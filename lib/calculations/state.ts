import type { Reservation, Sale, Vehicle } from "@/types";

/**
 * Vehicle lifecycle rules.
 *
 *   available ──reserve──▶ reserved ──complete sale──▶ sold
 *       ▲   ◀──cancel reservation──┘                     │
 *       └──────────────── cancel sale (valid reversal) ──┘
 */

export type TransitionResult = { ok: true } | { ok: false; message: string };

const ok: TransitionResult = { ok: true };
const fail = (message: string): TransitionResult => ({ ok: false, message });

export function canReserve(vehicle: Pick<Vehicle, "status" | "archivedAt">): TransitionResult {
  if (vehicle.archivedAt) return fail("This vehicle has been archived.");
  if (vehicle.status === "reserved") return fail("This vehicle is already reserved.");
  if (vehicle.status === "sold") return fail("A sold vehicle cannot be reserved.");
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

export function canCancelSale(sale: Pick<Sale, "status">): TransitionResult {
  if (sale.status !== "completed") return fail("This sale has already been cancelled.");
  return ok;
}

/** A purchase may only be cancelled while its vehicle has not been reserved or sold. */
export function canCancelPurchase(vehicle: Pick<Vehicle, "status"> | undefined): TransitionResult {
  if (!vehicle) return ok;
  if (vehicle.status === "sold") return fail("This vehicle has been sold. Cancel the sale first.");
  if (vehicle.status === "reserved") return fail("This vehicle is reserved. Release the reservation first.");
  return ok;
}

/** Status a vehicle returns to when its completed sale is reversed. */
export function statusAfterSaleCancellation(): Vehicle["status"] {
  return "available";
}
