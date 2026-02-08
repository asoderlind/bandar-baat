/**
 * S3-compatible object storage (MinIO) integration.
 *
 * Used for caching TTS audio and (future) story images.
 * Works with any S3-compatible provider — swap the endpoint
 * to move from MinIO to AWS S3, Cloudflare R2, etc.
 */

import {
  S3Client,
  CreateBucketCommand,
  HeadBucketCommand,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT || "http://localhost:9000";
const MINIO_ACCESS_KEY = process.env.MINIO_ACCESS_KEY || "minioadmin";
const MINIO_SECRET_KEY = process.env.MINIO_SECRET_KEY || "minioadmin";
const MINIO_BUCKET = process.env.MINIO_BUCKET || "monke-say";
const MINIO_REGION = process.env.MINIO_REGION || "us-east-1";

// Key prefixes for different asset types
export const StoragePrefix = {
  AUDIO: "audio/",
  IMAGES: "images/",
} as const;

// ---------------------------------------------------------------------------
// Client singleton
// ---------------------------------------------------------------------------

let client: S3Client | null = null;

function getClient(): S3Client {
  if (!client) {
    client = new S3Client({
      endpoint: MINIO_ENDPOINT,
      region: MINIO_REGION,
      credentials: {
        accessKeyId: MINIO_ACCESS_KEY,
        secretAccessKey: MINIO_SECRET_KEY,
      },
      forcePathStyle: true, // Required for MinIO
    });
  }
  return client;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create the bucket if it doesn't already exist.
 * Call once at server startup.
 */
export async function initStorage(): Promise<void> {
  const s3 = getClient();
  try {
    await s3.send(new HeadBucketCommand({ Bucket: MINIO_BUCKET }));
    console.log(`✅ Storage bucket "${MINIO_BUCKET}" ready`);
  } catch {
    console.log(`📦 Creating storage bucket "${MINIO_BUCKET}"...`);
    await s3.send(new CreateBucketCommand({ Bucket: MINIO_BUCKET }));
    console.log(`✅ Storage bucket "${MINIO_BUCKET}" created`);
  }
}

/**
 * Check whether an object exists in the bucket.
 */
export async function objectExists(key: string): Promise<boolean> {
  const s3 = getClient();
  try {
    await s3.send(new HeadObjectCommand({ Bucket: MINIO_BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

/**
 * Upload a buffer to the bucket.
 */
export async function putObject(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string,
): Promise<void> {
  const s3 = getClient();
  await s3.send(
    new PutObjectCommand({
      Bucket: MINIO_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

/**
 * Download an object from the bucket.
 * Returns the body as a Buffer, or null if not found.
 */
export async function getObject(
  key: string,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const s3 = getClient();
  try {
    const response = await s3.send(
      new GetObjectCommand({ Bucket: MINIO_BUCKET, Key: key }),
    );

    if (!response.Body) return null;

    // Convert the readable stream to a Buffer
    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }

    return {
      buffer: Buffer.concat(chunks),
      contentType: response.ContentType || "application/octet-stream",
    };
  } catch {
    return null;
  }
}
