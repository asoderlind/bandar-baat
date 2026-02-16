/**
 * ElevenLabs Text-to-Speech integration for Hindi audio
 */

import { createHash } from "crypto";
import { objectExists, putObject, StoragePrefix } from "./storage.js";

const ELEVENLABS_API_URL =
  process.env.ELEVENLABS_API_URL || "https://api.elevenlabs.io/v1";

// Default voice ID can be overridden via env var
const DEFAULT_VOICE_ID =
  process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM";

export type HindiVoice = string;

export interface TTSOptions {
  voice?: HindiVoice;
  speakingRate?: number; // 0.5 to 2.0, default 1.0
}

function getApiKey(): string {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("ELEVENLABS_API_KEY not set");
  return key;
}

/**
 * Generate a cache key for the audio file
 */
function generateCacheKey(
  text: string,
  voice: string,
  rate: number,
): string {
  const hash = createHash("md5")
    .update(`${text}|${voice}|${rate}`)
    .digest("hex");
  return hash;
}

/**
 * Build the full MinIO object key for an audio cache entry.
 */
export function audioObjectKey(cacheKey: string): string {
  return `${StoragePrefix.AUDIO}${cacheKey}.mp3`;
}

/**
 * Synthesize Hindi text to speech via ElevenLabs.
 * Audio is cached in MinIO under audio/<md5>.mp3
 */
export async function synthesizeHindi(
  text: string,
  options: TTSOptions = {},
): Promise<{ cacheKey: string }> {
  const voice = options.voice || DEFAULT_VOICE_ID;
  const speakingRate = options.speakingRate || 1.0;

  const cacheKey = generateCacheKey(text, voice, speakingRate);
  const key = audioObjectKey(cacheKey);

  // Check MinIO cache
  if (await objectExists(key)) {
    return { cacheKey };
  }

  const response = await fetch(
    `${ELEVENLABS_API_URL}/text-to-speech/${voice}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        "xi-api-key": getApiKey(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
        ...(speakingRate !== 1.0 && { speed: speakingRate }),
      }),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`ElevenLabs TTS error ${response.status}: ${body}`);
  }

  const audioBuffer = Buffer.from(await response.arrayBuffer());
  if (audioBuffer.length === 0) {
    throw new Error("No audio content returned from TTS API");
  }

  // Store in MinIO
  await putObject(key, audioBuffer, "audio/mpeg");

  return { cacheKey };
}

/**
 * Synthesize text with slow speed for learners
 */
export async function synthesizeHindiSlow(
  text: string,
  options: Omit<TTSOptions, "speakingRate"> = {},
): Promise<{ cacheKey: string }> {
  return synthesizeHindi(text, {
    ...options,
    speakingRate: 0.75,
  });
}

/**
 * Batch synthesize multiple sentences
 */
export async function synthesizeSentences(
  sentences: string[],
  options: TTSOptions = {},
): Promise<Array<{ text: string; cacheKey: string }>> {
  const results = await Promise.all(
    sentences.map(async (text) => {
      const { cacheKey } = await synthesizeHindi(text, options);
      return { text, cacheKey };
    }),
  );
  return results;
}

/**
 * Get available voices from ElevenLabs
 */
export async function listVoices() {
  const response = await fetch(`${ELEVENLABS_API_URL}/voices`, {
    headers: { "xi-api-key": getApiKey() },
  });

  if (!response.ok) {
    throw new Error(`List voices error ${response.status}`);
  }

  const data = (await response.json()) as {
    voices?: Array<{ voice_id: string; name: string }>;
  };
  return data.voices || [];
}
