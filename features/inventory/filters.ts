import type { FuelType, Transmission, VehicleStatus } from "@/types";
import type { VehicleView } from "@/lib/calculations/selectors";
import { normalizeRegistration } from "@/lib/utils/ids";

export type InventorySort = "newest" | "oldest" | "price_desc" | "price_asc" | "km_asc" | "km_desc";

export interface InventoryFilters {
  search: string;
  status: "all" | "in_stock" | VehicleStatus;
  fuel: "all" | FuelType;
  transmission: "all" | Transmission;
  yearFrom: number | null;
  yearTo: number | null;
  priceMin: number | null;
  priceMax: number | null;
  sort: InventorySort;
}

export const DEFAULT_INVENTORY_FILTERS: InventoryFilters = {
  search: "",
  status: "all",
  fuel: "all",
  transmission: "all",
  yearFrom: null,
  yearTo: null,
  priceMin: null,
  priceMax: null,
  sort: "newest",
};

export const SORT_LABELS: Record<InventorySort, string> = {
  newest: "Newest first",
  oldest: "Oldest first",
  price_desc: "Price: high to low",
  price_asc: "Price: low to high",
  km_asc: "Mileage: low to high",
  km_desc: "Mileage: high to low",
};

export function activeFilterCount(f: InventoryFilters): number {
  return [
    f.search.trim() !== "",
    f.status !== "all",
    f.fuel !== "all",
    f.transmission !== "all",
    f.yearFrom !== null,
    f.yearTo !== null,
    f.priceMin !== null,
    f.priceMax !== null,
  ].filter(Boolean).length;
}

export function matchesSearch(v: VehicleView, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const { vehicle } = v;
  const hay = `${vehicle.make} ${vehicle.model} ${vehicle.variant} ${vehicle.year} ${vehicle.color} ${vehicle.stockNumber} ${vehicle.registrationNumber}`.toLowerCase();
  const regQuery = normalizeRegistration(q);
  return q.split(/\s+/).every((t) => hay.includes(t)) || (regQuery.length >= 3 && normalizeRegistration(vehicle.registrationNumber).includes(regQuery));
}

export function applyInventoryFilters(views: readonly VehicleView[], f: InventoryFilters): VehicleView[] {
  const out = views.filter(({ vehicle: v, ...rest }) => {
    if (f.status === "in_stock" ? v.status === "sold" : f.status !== "all" && v.status !== f.status) return false;
    if (f.fuel !== "all" && v.fuelType !== f.fuel) return false;
    if (f.transmission !== "all" && v.transmission !== f.transmission) return false;
    if (f.yearFrom !== null && v.year < f.yearFrom) return false;
    if (f.yearTo !== null && v.year > f.yearTo) return false;
    if (f.priceMin !== null && v.askingPricePaise < f.priceMin) return false;
    if (f.priceMax !== null && v.askingPricePaise > f.priceMax) return false;
    return matchesSearch({ vehicle: v, ...rest } as VehicleView, f.search);
  });
  const by: Record<InventorySort, (a: VehicleView, b: VehicleView) => number> = {
    newest: (a, b) => (b.purchase?.purchaseDate ?? b.vehicle.createdAt).localeCompare(a.purchase?.purchaseDate ?? a.vehicle.createdAt) || b.vehicle.createdAt.localeCompare(a.vehicle.createdAt),
    oldest: (a, b) => (a.purchase?.purchaseDate ?? a.vehicle.createdAt).localeCompare(b.purchase?.purchaseDate ?? b.vehicle.createdAt) || a.vehicle.createdAt.localeCompare(b.vehicle.createdAt),
    price_desc: (a, b) => b.vehicle.askingPricePaise - a.vehicle.askingPricePaise,
    price_asc: (a, b) => a.vehicle.askingPricePaise - b.vehicle.askingPricePaise,
    km_asc: (a, b) => a.vehicle.mileageKm - b.vehicle.mileageKm,
    km_desc: (a, b) => b.vehicle.mileageKm - a.vehicle.mileageKm,
  };
  return out.sort(by[f.sort]);
}
