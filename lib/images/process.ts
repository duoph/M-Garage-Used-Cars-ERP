import type { PreparedPhoto } from "@/lib/repositories/contracts";

export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const FULL_MAX_EDGE = 1600;
const THUMB_MAX_EDGE = 480;

export class PhotoValidationError extends Error {}

export function validatePhotoFile(file: File, maxUploadMb: number): void {
  if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type))
    throw new PhotoValidationError(`${file.name}: only JPEG, PNG and WebP images are supported.`);
  if (file.size > maxUploadMb * 1024 * 1024)
    throw new PhotoValidationError(`${file.name}: file is larger than ${maxUploadMb} MB.`);
}

function supportsWebp(): boolean {
  const c = document.createElement("canvas");
  c.width = c.height = 1;
  return c.toDataURL("image/webp").startsWith("data:image/webp");
}

async function render(bitmap: ImageBitmap, maxEdge: number, type: string, quality: number) {
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new PhotoValidationError("Your browser could not process this image.");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  if (!blob) throw new PhotoValidationError("Image compression failed.");
  return { blob, width, height };
}

/** Validates, orients, resizes and compresses a photo, producing a full image and a thumbnail. */
export async function preparePhoto(file: File, maxUploadMb: number): Promise<PreparedPhoto> {
  validatePhotoFile(file, maxUploadMb);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new PhotoValidationError(`${file.name}: the image appears to be corrupted.`);
  }
  try {
    const type = supportsWebp() ? "image/webp" : "image/jpeg";
    const full = await render(bitmap, FULL_MAX_EDGE, type, 0.82);
    const thumb = await render(bitmap, THUMB_MAX_EDGE, type, 0.72);
    return { full: full.blob, thumb: thumb.blob, width: full.width, height: full.height, mimeType: type };
  } finally {
    bitmap.close();
  }
}

const LOGO_MAX_EDGE = 512;

/**
 * Prepares a showroom logo: resized to fit 512px and saved as PNG, which keeps transparent backgrounds
 * in every browser (Safari can't encode WebP, and JPEG would turn transparency black).
 */
export async function prepareLogo(file: File, maxUploadMb = 5): Promise<Blob> {
  validatePhotoFile(file, maxUploadMb);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new PhotoValidationError(`${file.name}: the image appears to be corrupted.`);
  }
  try {
    return (await render(bitmap, LOGO_MAX_EDGE, "image/png", 1)).blob;
  } finally {
    bitmap.close();
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}
