/**
 * Google Cloud Text-to-Speech integration for Hindi audio
 */

import { TextToSpeechClient } from "@google-cloud/text-to-speech";
import { createHash } from "crypto";
import { writeFile, mkdir, access } from "fs/promises";
import { join } from "path";

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

// Audio storage directory
const AUDIO_DIR = process.env.AUDIO_STORAGE_PATH || "/tmp/monke-say-audio";

let ttsClient: TextToSpeechClient | null = null;

/**
 * Get or create TTS client
 */
function getClient(): TextToSpeechClient {
  if (!ttsClient) {
    // Client will use GOOGLE_APPLICATION_CREDENTIALS env var for auth
    // Or you can pass credentials directly
    const credentials = process.env.GOOGLE_TTS_CREDENTIALS
      ? JSON.parse(process.env.GOOGLE_TTS_CREDENTIALS)
      : undefined;

    ttsClient = new TextToSpeechClient({
      credentials,
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
 * Ensure audio directory exists
 */
async function ensureAudioDir(): Promise<void> {
  try {
    await access(AUDIO_DIR);
  } catch {
    await mkdir(AUDIO_DIR, { recursive: true });
  }
}

/**
 * Check if audio file exists in cache
 */
async function getAudioPath(cacheKey: string): Promise<string | null> {
  const filePath = join(AUDIO_DIR, `${cacheKey}.mp3`);
  try {
    await access(filePath);
    return filePath;
  } catch {
    return null;
  }
}

/**
 * Synthesize Hindi text to speech
 */
export async function synthesizeHindi(
  text: string,
  options: TTSOptions = {},
): Promise<{ audioPath: string; cacheKey: string }> {
  const voice = options.voice || HINDI_VOICES.FEMALE_1;
  const speakingRate = options.speakingRate || 1.0;
  const pitch = options.pitch || 0;

  const cacheKey = generateCacheKey(text, voice, speakingRate);

  // Check cache first
  await ensureAudioDir();
  const existingPath = await getAudioPath(cacheKey);
  if (existingPath) {
    return { audioPath: existingPath, cacheKey };
  }

  // Generate new audio
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
      // Higher quality settings
      sampleRateHertz: 24000,
    },
  });

  if (!response.audioContent) {
    throw new Error("No audio content returned from TTS API");
  }

  // Save to cache
  const audioPath = join(AUDIO_DIR, `${cacheKey}.mp3`);
  await writeFile(audioPath, response.audioContent as Buffer);

  return { audioPath, cacheKey };
}

/**
 * Synthesize text with slow speed for learners
 */
export async function synthesizeHindiSlow(
  text: string,
  options: Omit<TTSOptions, "speakingRate"> = {},
): Promise<{ audioPath: string; cacheKey: string }> {
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
): Promise<Array<{ text: string; audioPath: string; cacheKey: string }>> {
  const results = await Promise.all(
    sentences.map(async (text) => {
      const { audioPath, cacheKey } = await synthesizeHindi(text, options);
      return { text, audioPath, cacheKey };
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
