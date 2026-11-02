import type { Purchase, Reservation, Sale, Vehicle } from "@/types";

/**
 * Vehicle lifecycle rules.
 *
 *   available ──reserve──▶ reserved ──complete sale──▶ sold ──sales return──▶ returned_inspection
 *       ▲   ◀──cancel reservation──┘                     │                         │
 *       ├──────────────── cancel sale (valid reversal) ──┘                         │
 *       └────────────────────────────── back to stock (after inspection) ─────────┘
 *
 *   available ──purchase return──▶ returned_to_supplier (archived, out of stock)
 */

export type TransitionResult = { ok: true } | { ok: false; message: string };

const ok: TransitionResult = { ok: true };
const fail = (message: string): TransitionResult => ({ ok: false, message });

const INSPECTION = "This car came back on a sales return. Inspect it and move it back to stock first.";

export function canReserve(vehicle: Pick<Vehicle, "status" | "archivedAt">): TransitionResult {
  if (vehicle.archivedAt) return fail("This vehicle has been archived.");
  if (vehicle.status === "reserved") return fail("This vehicle is already reserved.");
  if (vehicle.status === "sold") return fail("A sold vehicle cannot be reserved.");
  if (vehicle.status === "returned_inspection") return fail(INSPECTION);
  if (vehicle.status === "returned_to_supplier") return fail("This vehicle was returned to its seller.");
  return ok;
}

/**
 * A sale can be completed for an available vehicle, or for a reserved vehicle only through
 * its own active reservation.
 */
export function canSell(
  vehicle: Pick<Vehicle, "id" | "status" | "archivedAt">,
  activeReservation: Pick<Reservation, "id" | "vehicleId" | "status"> | null,
  reservationId: string | null,
  existingCompletedSale: Pick<Sale, "id"> | null,
): TransitionResult {
  if (vehicle.archivedAt) return fail("This vehicle has been archived.");
  if (existingCompletedSale || vehicle.status === "sold") return fail("This vehicle has already been sold.");
  if (vehicle.status === "returned_inspection") return fail(INSPECTION);
  if (vehicle.status === "returned_to_supplier") return fail("This vehicle was returned to its seller.");
  if (vehicle.status === "reserved") {
    if (!activeReservation || activeReservation.vehicleId !== vehicle.id)
      return fail("Reservation record for this vehicle could not be found.");
    if (reservationId !== activeReservation.id)
      return fail("This vehicle is reserved for another buyer. Complete or release that reservation first.");
    return ok;
  }
  if (reservationId) return fail("The selected reservation is no longer active.");
  return ok;
}

export function canCancelReservation(reservation: Pick<Reservation, "status">): TransitionResult {
  if (reservation.status !== "active") return fail("Only active reservations can be cancelled.");
  return ok;
}

export function canCancelSale(sale: Pick<Sale, "status" | "returnStatus">): TransitionResult {
  if (sale.status !== "completed") return fail("This sale has already been cancelled.");
  if (sale.returnStatus && sale.returnStatus !== "none") return fail("This sale has a sales return. Corrections go through the return instead.");
  return ok;
}

/** A purchase may only be cancelled while its vehicle has not been reserved or sold. */
export function canCancelPurchase(vehicle: Pick<Vehicle, "status"> | undefined, purchase?: Pick<Purchase, "returnStatus">): TransitionResult {
  if (purchase?.returnStatus && purchase.returnStatus !== "none") return fail("This purchase has a purchase return.");
  if (!vehicle) return ok;
  if (vehicle.status === "sold") return fail("This vehicle has been sold. Cancel the sale first.");
  if (vehicle.status === "reserved") return fail("This vehicle is reserved. Release the reservation first.");
  return ok;
}

/** Status a vehicle returns to when its completed sale is reversed. */
export function statusAfterSaleCancellation(): Vehicle["status"] {
  return "available";
}

/** A sale can take a return while it is completed and its car has not already come back. */
export function canReturnSale(sale: Pick<Sale, "status" | "returnStatus">): TransitionResult {
  if (sale.status !== "completed") return fail("Only completed sales can be returned.");
  if (sale.returnStatus === "returned") return fail("This car has already been returned.");
  return ok;
}

/** A car can go back to its seller only while it is in stock and unsold. */
export function canReturnPurchase(purchase: Pick<Purchase, "status" | "returnStatus">, vehicle: Pick<Vehicle, "status" | "archivedAt"> | undefined): TransitionResult {
  if (purchase.status !== "active") return fail("This purchase was cancelled.");
  if (purchase.returnStatus === "returned") return fail("This car has already been returned to its seller.");
  if (!vehicle || vehicle.archivedAt) return fail("This car is no longer in stock.");
  if (vehicle.status === "sold") return fail("This car has been sold. Return the sale first.");
  if (vehicle.status === "reserved") return fail("This car is reserved. Release the reservation first.");
  return ok;
}
