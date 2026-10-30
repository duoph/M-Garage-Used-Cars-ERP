import type { RemoteImageStorage } from "@/lib/repositories/contracts";
import { isR2Key, objectKeyOf, toR2Key } from "@/lib/images/r2-keys";

/** True when new photos should go to Cloudflare R2 instead of IndexedDB. */
export const r2Enabled = process.env.NEXT_PUBLIC_IMAGE_STORAGE === "r2";

async function errorMessage(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? fallback;
}

/** Uploads straight from the browser to R2 with presigned URLs issued by `/api/uploads`. */
export const r2ImageStorage: RemoteImageStorage = {
  async put(objectKey, blob) {
    const presign = await fetch("/api/uploads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: objectKey, contentType: blob.type, size: blob.size }),
    });
    if (!presign.ok) throw new Error(await errorMessage(presign, "Could not start the photo upload."));
    const { url } = (await presign.json()) as { url: string };
    const upload = await fetch(url, { method: "PUT", headers: { "Content-Type": blob.type }, body: blob });
    if (!upload.ok) throw new Error("Photo upload failed. Check your connection and try again.");
    return toR2Key(objectKey);
  },
  async remove(keys) {
    const objectKeys = keys.filter(isR2Key).map(objectKeyOf);
    if (objectKeys.length === 0) return;
    const res = await fetch("/api/uploads", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keys: objectKeys }),
    });
    if (!res.ok) throw new Error(await errorMessage(res, "Could not delete the photo from storage."));
  },
};
