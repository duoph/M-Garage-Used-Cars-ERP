import { ACCEPTED_IMAGE_TYPES } from "@/lib/images/process";

/**
 * Stored image keys that start with `r2:` live in Cloudflare R2; anything else is an IndexedDB blob
 * (photos added before R2 was switched on, and the showroom logo). Shared by the browser and the API routes.
 */
export const R2_KEY_PREFIX = "r2:";

/**
 * Bucket folder that holds vehicle photos. Each car gets its own subfolder:
 * `car-images/<vehicleId>/<imageId>.webp` and `<imageId>-thumb.webp`.
 */
export const R2_PHOTO_FOLDER = "car-images";

const EXTENSIONS: Record<string, string> = { "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png" };

/** Object keys for a photo and its thumbnail inside the car's folder. */
export function vehiclePhotoObjectKeys(vehicleId: string, imageId: string, mimeType: string) {
  const base = `${R2_PHOTO_FOLDER}/${vehicleId}/${imageId}`;
  const ext = EXTENSIONS[mimeType] ?? "webp";
  return { full: `${base}.${ext}`, thumb: `${base}-thumb.${ext}` };
}

/** Largest single object the upload route will sign. Photos are compressed well below this first. */
export const R2_MAX_OBJECT_BYTES = 10 * 1024 * 1024;

const VEHICLE_OBJECT_KEY = new RegExp(`^${R2_PHOTO_FOLDER}/[0-9a-f-]{36}/[0-9a-f-]{36}(-thumb)?\\.(webp|jpg|png)$`);

export function isR2Key(key: string): boolean {
  return key.startsWith(R2_KEY_PREFIX);
}

export function toR2Key(objectKey: string): string {
  return `${R2_KEY_PREFIX}${objectKey}`;
}

export function objectKeyOf(key: string): string {
  return key.slice(R2_KEY_PREFIX.length);
}

/** Only vehicle photo paths may be written or deleted through the API. */
export function isValidVehicleObjectKey(objectKey: string): boolean {
  return VEHICLE_OBJECT_KEY.test(objectKey);
}

export function isAcceptedImageType(type: string): boolean {
  return (ACCEPTED_IMAGE_TYPES as readonly string[]).includes(type);
}

/** Same-origin URL that redirects to the object, usable directly as an <img src>. */
export function r2ImageUrl(key: string): string {
  return `/api/images/${objectKeyOf(key)}`;
}
