/**
 * Google Cloud Text-to-Speech integration for Hindi audio
 */

import { TextToSpeechClient } from "@google-cloud/text-to-speech";
import { createHash } from "crypto";
import { objectExists, putObject, StoragePrefix } from "./storage.js";

// Voice options for Hindi
export const HINDI_VOICES = {
  FEMALE_1: "hi-IN-Wavenet-A",
  FEMALE_2: "hi-IN-Wavenet-D",
  MALE_1: "hi-IN-Wavenet-B",
  MALE_2: "hi-IN-Wavenet-C",
  // Standard voices (cheaper)
  FEMALE_STANDARD: "hi-IN-Standard-A",
  MALE_STANDARD: "hi-IN-Standard-B",
} as const;

export type HindiVoice = (typeof HINDI_VOICES)[keyof typeof HINDI_VOICES];

export interface TTSOptions {
  voice?: HindiVoice;
  speakingRate?: number; // 0.25 to 4.0, default 1.0
  pitch?: number; // -20.0 to 20.0, default 0
}

let ttsClient: TextToSpeechClient | null = null;

/**
 * Get or create TTS client
 */
function getClient(): TextToSpeechClient {
  if (!ttsClient) {
    const rawCredentials = process.env.GOOGLE_TTS_CREDENTIALS;
    const credentials = rawCredentials
      ? JSON.parse(Buffer.from(rawCredentials, "base64").toString())
      : undefined;

    ttsClient = new TextToSpeechClient({
      credentials,
      fallback: "rest",
    });
  }
  return ttsClient;
}

/**
 * Generate a cache key for the audio file
 */
function generateCacheKey(
  text: string,
  voice: HindiVoice,
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
 * Synthesize Hindi text to speech.
 * Audio is cached in MinIO under  audio/<md5>.mp3
 */
export async function synthesizeHindi(
  text: string,
  options: TTSOptions = {},
): Promise<{ cacheKey: string }> {
  const voice = options.voice || HINDI_VOICES.FEMALE_1;
  const speakingRate = options.speakingRate || 1.0;
  const pitch = options.pitch || 0;

  const cacheKey = generateCacheKey(text, voice, speakingRate);
  const key = audioObjectKey(cacheKey);

  // Check MinIO cache
  if (await objectExists(key)) {
    return { cacheKey };
  }

  // Generate new audio via Google Cloud TTS
  const client = getClient();

  const [response] = await client.synthesizeSpeech({
    input: { text },
    voice: {
      languageCode: "hi-IN",
      name: voice,
    },
    audioConfig: {
      audioEncoding: "MP3",
      speakingRate,
      pitch,
      sampleRateHertz: 24000,
    },
  });

  if (!response.audioContent) {
    throw new Error("No audio content returned from TTS API");
  }

  // Store in MinIO
  await putObject(key, response.audioContent as Buffer, "audio/mpeg");

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
 * Get available Hindi voices
 */
export async function listHindiVoices() {
  const client = getClient();
  const [response] = await client.listVoices({ languageCode: "hi-IN" });
  return response.voices || [];
}
