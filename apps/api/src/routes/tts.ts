import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { requireAuth, type AuthContext } from "../lib/middleware.js";
import {
  synthesizeHindi,
  synthesizeHindiSlow,
  HINDI_VOICES,
  audioObjectKey,
  type HindiVoice,
} from "../lib/tts.js";
import { getObject } from "../lib/storage.js";

export const ttsRoutes = new Hono<{ Variables: AuthContext }>();

// All routes require authentication
ttsRoutes.use("*", requireAuth);

const synthesizeSchema = z.object({
  text: z.string().min(1).max(5000),
  slow: z.boolean().optional().default(false),
  voice: z
    .enum([
      "hi-IN-Wavenet-A",
      "hi-IN-Wavenet-B",
      "hi-IN-Wavenet-C",
      "hi-IN-Wavenet-D",
      "hi-IN-Standard-A",
      "hi-IN-Standard-B",
    ])
    .optional(),
});

/**
 * POST /api/tts/synthesize
 * Generate audio for Hindi text
 */
ttsRoutes.post(
  "/synthesize",
  zValidator("json", synthesizeSchema),
  async (c) => {
    try {
      const { text, slow, voice } = c.req.valid("json");

      const synthesizeFn = slow ? synthesizeHindiSlow : synthesizeHindi;
      const { cacheKey } = await synthesizeFn(text, {
        voice: voice as HindiVoice | undefined,
      });

      return c.json({
        success: true,
        data: {
          audioUrl: `/api/tts/audio/${cacheKey}`,
          cacheKey,
        },
      });
    } catch (error) {
      console.error("TTS synthesis error:", error);
      const message = error instanceof Error ? error.message : "Unknown error";

      if (message.includes("credentials") || message.includes("auth")) {
        return c.json(
          {
            success: false,
            error:
              "TTS service not configured. Please set up Google Cloud credentials.",
          },
          503,
        );
      }

      return c.json({ success: false, error: message }, 500);
    }
  },
);

/**
 * GET /api/tts/audio/:cacheKey
 * Serve cached audio file from MinIO
 */
ttsRoutes.get("/audio/:cacheKey", async (c) => {
  try {
    const cacheKey = c.req.param("cacheKey");

    // Validate cache key format (md5 hash)
    if (!/^[a-f0-9]{32}$/.test(cacheKey)) {
      return c.json({ success: false, error: "Invalid audio key" }, 400);
    }

    const key = audioObjectKey(cacheKey);
    const result = await getObject(key);

    if (!result) {
      return c.json({ success: false, error: "Audio not found" }, 404);
    }

    return new Response(new Uint8Array(result.buffer), {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=31536000", // 1 year cache
        "Content-Length": result.buffer.length.toString(),
      },
    });
  } catch (error) {
    console.error("Audio fetch error:", error);
    return c.json({ success: false, error: "Audio not found" }, 404);
  }
});

const batchSynthesizeSchema = z.object({
  sentences: z.array(z.string().min(1).max(2000)).min(1).max(50),
  slow: z.boolean().optional().default(false),
  voice: z
    .enum([
      "hi-IN-Wavenet-A",
      "hi-IN-Wavenet-B",
      "hi-IN-Wavenet-C",
      "hi-IN-Wavenet-D",
      "hi-IN-Standard-A",
      "hi-IN-Standard-B",
    ])
    .optional(),
});

/**
 * POST /api/tts/batch
 * Generate audio for multiple sentences
 */
ttsRoutes.post(
  "/batch",
  zValidator("json", batchSynthesizeSchema),
  async (c) => {
    try {
      const { sentences, slow, voice } = c.req.valid("json");

      const synthesizeFn = slow ? synthesizeHindiSlow : synthesizeHindi;

      const results = await Promise.all(
        sentences.map(async (text, index) => {
          try {
            const { cacheKey } = await synthesizeFn(text, {
              voice: voice as HindiVoice | undefined,
            });
            return {
              index,
              text,
              audioUrl: `/api/tts/audio/${cacheKey}`,
              cacheKey,
            };
          } catch (error) {
            console.error(`TTS error for sentence ${index}:`, error);
            return {
              index,
              text,
              error: "Failed to generate audio",
            };
          }
        }),
      );

      return c.json({
        success: true,
        data: results,
      });
    } catch (error) {
      console.error("Batch TTS error:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      return c.json({ success: false, error: message }, 500);
    }
  },
);

/**
 * GET /api/tts/voices
 * List available Hindi voices
 */
ttsRoutes.get("/voices", async (c) => {
  return c.json({
    success: true,
    data: {
      voices: Object.entries(HINDI_VOICES).map(([key, value]) => ({
        id: value,
        name: key.replace(/_/g, " ").toLowerCase(),
        isWavenet: value.includes("Wavenet"),
      })),
      default: HINDI_VOICES.FEMALE_1,
    },
  });
});
