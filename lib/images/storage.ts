import { getDb } from "@/lib/db/database";
import type { ImageStorage } from "@/lib/repositories/contracts";

/** IndexedDB-backed image storage. Replace with an R2 signed-upload client in production. */
export const indexedDbImageStorage: ImageStorage = {
  async put(key, blob) {
    await getDb().imageBlobs.put({
      key,
      blob,
      size: blob.size,
      mimeType: blob.type,
      createdAt: new Date().toISOString(),
    });
  },
  async get(key) {
    return (await getDb().imageBlobs.get(key))?.blob;
  },
  async remove(keys) {
    await getDb().imageBlobs.bulkDelete([...keys]);
  },
  async usageBytes() {
    let total = 0;
    await getDb().imageBlobs.each((r) => {
      total += r.size;
    });
    return total;
  },
};
