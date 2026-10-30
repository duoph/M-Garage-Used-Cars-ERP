import type { DealerDatabase } from "@/lib/db/database";
import type { BusinessSettings, User } from "@/types";

/** The first account in a new showroom. Rename it and add staff from the Staff page. */
export const OWNER_USER_ID = "u-owner";

/**
 * Bumped when every browser must be wiped back to a blank showroom. v1 removed the bundled demo
 * showroom (sample cars, sales, staff and photos).
 */
const FRESH_START_VERSION = "1";
const DEMO_SHOWROOM_NAME = "Prestige Auto Hub";

export function defaultSettings(): BusinessSettings {
  return {
    id: "business",
    showroomName: "My Showroom",
    legalName: "",
    address: "",
    city: "",
    phone: "",
    email: "",
    gstin: "",
    logoKey: null,
    currency: "INR",
    dateFormat: "dd MMM yyyy",
    defaultInventoryView: "grid",
    receiptFooter: "Thank you for your business.",
    receiptTerms:
      "Vehicle sold on an as-is-where-is basis after inspection by the buyer. RC transfer will be completed after receipt of full payment. This is a payment acknowledgement, not a tax invoice.",
    maxUploadMb: 10,
    maxPhotosPerVehicle: 20,
    storageQuotaGb: 5,
    updatedAt: new Date().toISOString(),
  };
}

function ownerUser(): User {
  const ts = new Date().toISOString();
  return { id: OWNER_USER_ID, name: "Owner", email: "", phone: "", role: "admin", status: "active", createdAt: ts, updatedAt: ts };
}

/** Records that this database holds real showroom data, so the fresh-start wipe never runs on it. */
export async function markInitialized(db: DealerDatabase): Promise<void> {
  await db.meta.put({ key: "freshStart", value: FRESH_START_VERSION });
}

/**
 * Prepares the local database on first load: a blank showroom with one Owner admin. Browsers that still
 * hold the old demo showroom are wiped once; showroom settings and the uploaded logo are kept.
 */
export async function ensureInitialized(db: DealerDatabase): Promise<void> {
  const marker = await db.meta.get("freshStart");
  if (marker?.value === FRESH_START_VERSION) return;
  await db.transaction("rw", db.tables, async () => {
    const settings = await db.settings.get("business");
    const logo = settings?.logoKey ? await db.imageBlobs.get(settings.logoKey) : undefined;
    await Promise.all(db.tables.filter((t) => t.name !== "settings").map((t) => t.clear()));
    // The untouched demo profile is replaced; a profile someone already edited is kept.
    if (!settings || settings.showroomName === DEMO_SHOWROOM_NAME)
      await db.settings.put({ ...defaultSettings(), logoKey: settings?.logoKey ?? null });
    if (logo) await db.imageBlobs.put(logo);
    await db.users.add(ownerUser());
    await markInitialized(db);
  });
}
