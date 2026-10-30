import { describe, expect, it } from "vitest";
import { DealerDatabase } from "@/lib/db/database";
import { ensureInitialized, OWNER_USER_ID } from "@/lib/db/bootstrap";
import { seedDatabase } from "./fixtures/demo-seed";

const newDb = () => new DealerDatabase(`bootstrap-${Math.random()}`);

describe("fresh start", () => {
  it("creates a blank showroom with one owner", async () => {
    const db = newDb();
    await ensureInitialized(db);
    expect(await db.users.toArray()).toMatchObject([{ id: OWNER_USER_ID, role: "admin", status: "active" }]);
    expect(await db.vehicles.count()).toBe(0);
    expect((await db.settings.get("business"))?.showroomName).toBe("My Showroom");
  });

  it("wipes an old demo showroom once, keeping the logo", async () => {
    const db = newDb();
    await seedDatabase(db);
    const logo = new Blob(["logo"], { type: "image/png" });
    await db.imageBlobs.put({ key: "logo", blob: logo, size: logo.size, mimeType: logo.type, createdAt: new Date().toISOString() });
    await db.settings.update("business", { logoKey: "logo" });

    await ensureInitialized(db);
    for (const t of [db.vehicles, db.purchases, db.sales, db.expenses, db.customers, db.activity]) expect(await t.count()).toBe(0);
    expect((await db.users.toArray()).map((u) => u.id)).toEqual([OWNER_USER_ID]);
    const settings = await db.settings.get("business");
    expect(settings).toMatchObject({ showroomName: "My Showroom", logoKey: "logo" });
    expect(await db.imageBlobs.get("logo")).toBeDefined();

    // Records added afterwards survive later loads.
    await db.users.update(OWNER_USER_ID, { name: "Hadi" });
    await ensureInitialized(db);
    expect((await db.users.get(OWNER_USER_ID))?.name).toBe("Hadi");
  });

  it("keeps a showroom profile that was already edited", async () => {
    const db = newDb();
    await seedDatabase(db);
    await db.settings.update("business", { showroomName: "M Garage" });
    await ensureInitialized(db);
    expect((await db.settings.get("business"))?.showroomName).toBe("M Garage");
  });
});
