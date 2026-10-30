import { DeleteObjectsCommand, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/** Server-only Cloudflare R2 access through its S3-compatible API. Credentials never reach the browser. */

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. See .env.example for the Cloudflare R2 settings.`);
  return value;
}

let client: S3Client | null = null;
function r2(): S3Client {
  client ??= new S3Client({
    region: "auto",
    endpoint: `https://${env("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: env("R2_ACCESS_KEY_ID"), secretAccessKey: env("R2_SECRET_ACCESS_KEY") },
  });
  return client;
}

const bucket = () => env("R2_BUCKET");

export const UPLOAD_URL_TTL_SECONDS = 5 * 60;
export const READ_URL_TTL_SECONDS = 60 * 60;

/**
 * A presigned PUT for one object. Content-Type and Content-Length are part of the signature,
 * so the browser can only upload exactly the type and size it declared.
 */
export function presignUpload(key: string, contentType: string, size: number): Promise<string> {
  return getSignedUrl(
    r2(),
    new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: contentType, ContentLength: size }),
    { expiresIn: UPLOAD_URL_TTL_SECONDS, signableHeaders: new Set(["content-type", "content-length"]) },
  );
}

/** Where the browser should load an object from: the public bucket domain if configured, else a signed URL. */
export async function readUrl(key: string): Promise<string> {
  const publicBase = process.env.R2_PUBLIC_URL;
  if (publicBase) return `${publicBase.replace(/\/$/, "")}/${key}`;
  return getSignedUrl(r2(), new GetObjectCommand({ Bucket: bucket(), Key: key }), { expiresIn: READ_URL_TTL_SECONDS });
}

export async function deleteObjects(keys: readonly string[]): Promise<void> {
  if (keys.length === 0) return;
  await r2().send(
    new DeleteObjectsCommand({ Bucket: bucket(), Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true } }),
  );
}

/** Total size and object count of the bucket, paging through every object (1,000 per request). */
export async function bucketUsage(): Promise<{ bytes: number; objects: number }> {
  let bytes = 0;
  let objects = 0;
  let ContinuationToken: string | undefined;
  do {
    const page = await r2().send(new ListObjectsV2Command({ Bucket: bucket(), ContinuationToken }));
    for (const o of page.Contents ?? []) {
      bytes += o.Size ?? 0;
      objects++;
    }
    ContinuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (ContinuationToken);
  return { bytes, objects };
}
