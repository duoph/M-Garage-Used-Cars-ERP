import { DEMO_PHOTOS } from "@/lib/images/demo-photos";
import { placeholderBlob, type BodyStyle } from "@/lib/images/placeholder";
import { newId } from "@/lib/utils/ids";
import type { ID, ImageBlobRecord, VehicleImage } from "@/types";

/**
 * Builds image records for a demo vehicle from the bundled real photos (/public/demo-cars),
 * then loads the files. If a file can't be fetched (offline, tests), a clearly-labelled
 * placeholder is generated instead so seeding never fails.
 */
interface PhotoSource {
  imageId: ID;
  key: string;
  thumbKey: string;
  url: string | null;
  thumbUrl: string | null;
  fallback: { title: string; color: string; style: BodyStyle; variant: 0 | 1 | 2 };
}

export interface DemoPhotoPlan {
  images: VehicleImage[];
  sources: PhotoSource[];
}

export function planDemoPhotos(opts: {
  vehicleId: ID;
  slug: string;
  title: string;
  color: string;
  style: BodyStyle;
  createdAt: string;
}): DemoPhotoPlan {
  const real = DEMO_PHOTOS[opts.slug]?.photos ?? [];
  const count = real.length || 3;
  const images: VehicleImage[] = [];
  const sources: PhotoSource[] = [];
  for (let i = 0; i < count; i++) {
    const id = newId();
    const key = `vehicles/${opts.vehicleId}/${id}`;
    const photo = real[i];
    images.push({
      id,
      vehicleId: opts.vehicleId,
      storageKey: key,
      thumbKey: `${key}/thumb`,
      mimeType: photo ? "image/webp" : "image/svg+xml",
      size: 0,
      width: photo ? 1280 : 1640,
      height: photo ? 800 : 1040,
      order: i,
      isCover: i === 0,
      isPlaceholder: !photo,
      attribution: photo ? { author: photo.author, license: photo.license, licenseUrl: photo.licenseUrl, source: photo.source } : null,
      createdAt: opts.createdAt,
      updatedAt: opts.createdAt,
    });
    sources.push({
      imageId: id,
      key,
      thumbKey: `${key}/thumb`,
      url: photo ? `/demo-cars/${photo.file}.webp` : null,
      thumbUrl: photo ? `/demo-cars/${photo.file}-thumb.webp` : null,
      fallback: { title: opts.title, color: opts.color, style: opts.style, variant: (i % 3) as 0 | 1 | 2 },
    });
  }
  return { images, sources };
}

async function fetchBlob(url: string | null): Promise<Blob | null> {
  if (!url || typeof fetch === "undefined" || typeof window === "undefined") return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return blob.type.startsWith("image/") ? blob : null;
  } catch {
    return null;
  }
}

/** Loads blobs for planned photos; must run outside any IndexedDB transaction. */
export async function loadDemoPhotos(plan: DemoPhotoPlan): Promise<{ images: VehicleImage[]; blobs: ImageBlobRecord[] }> {
  const now = new Date().toISOString();
  const blobs: ImageBlobRecord[] = [];
  const images = plan.images.map((img) => ({ ...img }));
  await Promise.all(
    plan.sources.map(async (src) => {
      const img = images.find((i) => i.id === src.imageId)!;
      const [full, thumb] = await Promise.all([fetchBlob(src.url), fetchBlob(src.thumbUrl)]);
      if (full && thumb) {
        blobs.push({ key: src.key, blob: full, size: full.size, mimeType: full.type, createdAt: now });
        blobs.push({ key: src.thumbKey, blob: thumb, size: thumb.size, mimeType: thumb.type, createdAt: now });
        img.size = full.size + thumb.size;
        img.mimeType = full.type;
        return;
      }
      const svg = placeholderBlob(src.fallback);
      blobs.push({ key: src.key, blob: svg, size: svg.size, mimeType: svg.type, createdAt: now });
      img.thumbKey = src.key;
      img.size = svg.size;
      img.mimeType = svg.type;
      img.width = 1640;
      img.height = 1040;
      img.isPlaceholder = true;
      img.attribution = null;
    }),
  );
  return { images, blobs };
}

export const DEMO_PHOTOS_VERSION = "real-v1";
