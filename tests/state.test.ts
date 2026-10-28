import { describe, expect, it } from "vitest";
import { canCancelPurchase, canCancelReservation, canCancelSale, canReserve, canSell } from "@/lib/calculations/state";

const v = (status: "available" | "reserved" | "sold", archivedAt: string | null = null) => ({ id: "v1", status, archivedAt });

describe("vehicle state transitions", () => {
  it("only available vehicles can be reserved", () => {
    expect(canReserve(v("available")).ok).toBe(true);
    expect(canReserve(v("reserved")).ok).toBe(false);
    expect(canReserve(v("sold")).ok).toBe(false);
    expect(canReserve(v("available", "2026-01-01")).ok).toBe(false);
  });
  it("available vehicles can be sold directly", () => {
    expect(canSell(v("available"), null, null, null).ok).toBe(true);
  });
  it("reserved vehicles can only be sold through their own reservation", () => {
    const res = { id: "r1", vehicleId: "v1", status: "active" as const };
    expect(canSell(v("reserved"), res, "r1", null).ok).toBe(true);
    expect(canSell(v("reserved"), res, null, null).ok).toBe(false);
    expect(canSell(v("reserved"), res, "r-other", null).ok).toBe(false);
  });
  it("a vehicle can never be sold twice", () => {
    expect(canSell(v("sold"), null, null, null).ok).toBe(false);
    expect(canSell(v("available"), null, null, { id: "s1" }).ok).toBe(false);
  });
  it("cancellation rules", () => {
    expect(canCancelReservation({ status: "active" }).ok).toBe(true);
    expect(canCancelReservation({ status: "converted" }).ok).toBe(false);
    expect(canCancelSale({ status: "completed" }).ok).toBe(true);
    expect(canCancelSale({ status: "cancelled" }).ok).toBe(false);
    expect(canCancelPurchase(v("available")).ok).toBe(true);
    expect(canCancelPurchase(v("sold")).ok).toBe(false);
    expect(canCancelPurchase(v("reserved")).ok).toBe(false);
  });
});
