"use client";
import Link from "next/link";
import { Camera, Hourglass } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { AGING_DAYS } from "@/features/dashboard/needs-attention";
import type { VehicleView } from "@/lib/calculations/selectors";
import { formatINR } from "@/lib/utils/money";
import { FUEL_LABELS, TRANSMISSION_LABELS, VEHICLE_STATUS_LABELS, formatKm, vehicleTitle } from "@/lib/utils/labels";
import { VehicleImage } from "@/components/shared/vehicle-image";
import { VehicleActionsMenu } from "./vehicle-actions";

const STATUS_DOT = { available: "bg-success", reserved: "bg-warning", sold: "bg-[#98a2b3]", returned_inspection: "bg-[#2948b8]", returned_to_supplier: "bg-destructive" } as const;

/**
 * Photo-first card: status and photo count over the image, then name, one spec line, plate and stock
 * age, and the price. Every card has the same structure so rows line up; the whole card is a link.
 */
export function VehicleCard({ view }: { view: VehicleView }) {
  const v = view.vehicle;
  const href = `/inventory/${v.id}`;
  const sold = v.status === "sold";
  const aging = !sold && view.stockAgeDays > AGING_DAYS;
  const price = view.sale?.salePricePaise ?? v.askingPricePaise;

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-xl border bg-card transition-[border-color,box-shadow] duration-200 focus-within:ring-2 focus-within:ring-ring/30 hover:border-foreground/15 hover:shadow-[0_6px_20px_-8px_rgba(15,27,51,0.18)]">
      <div className="relative">
        <VehicleImage
          image={view.cover}
          alt={vehicleTitle(v)}
          className="aspect-[16/10] w-full sm:aspect-[4/3]"
          imgClassName={cn("transition-transform duration-500 group-hover:scale-[1.03]", sold && "grayscale-[35%]")}
        />
        {/* Soft fade so the overlay labels stay readable on bright photos. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-14 bg-gradient-to-b from-black/25 to-transparent" aria-hidden />
        <span className="absolute top-2 left-2 inline-flex items-center gap-1.5 rounded-full bg-white/95 px-2 py-0.5 text-[11px] font-medium text-foreground shadow-sm">
          <span className={cn("size-1.5 rounded-full", STATUS_DOT[v.status])} aria-hidden />
          {VEHICLE_STATUS_LABELS[v.status]}
        </span>
        {aging && (
          <span className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-warning px-2 py-0.5 text-[11px] font-medium text-white shadow-sm" title={`In stock for more than ${AGING_DAYS} days`}>
            <Hourglass className="size-3" aria-hidden />
            {view.stockAgeDays}d
          </span>
        )}
        {view.images.length > 1 && (
          <span className="absolute right-2 bottom-2 inline-flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] font-medium text-white tabular">
            <Camera className="size-3" aria-hidden />
            {view.images.length}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex items-start gap-1">
          <div className="min-w-0 flex-1">
            {/* Stretched link: the whole card opens the vehicle, the menu stays its own control. */}
            <Link href={href} className="block truncate text-sm font-semibold tracking-tight outline-none after:absolute after:inset-0 after:content-['']">
              {v.year} {vehicleTitle(v)}
            </Link>
            <p className="truncate text-xs text-muted-foreground">{v.variant || "—"}</p>
          </div>
          <div className="relative z-10 -mt-1 -mr-1.5">
            <VehicleActionsMenu view={view} />
          </div>
        </div>

        <p className="truncate text-xs text-muted-foreground">
          {formatKm(v.mileageKm)} · {FUEL_LABELS[v.fuelType]} · {TRANSMISSION_LABELS[v.transmission]}
        </p>

        <div className="flex items-center justify-between gap-2 text-[11px]">
          <span className="rounded border bg-muted/60 px-1.5 py-px font-mono tracking-wide text-foreground/80">{v.registrationNumber}</span>
          {!sold && (
            <span className={cn("tabular", aging ? "font-medium text-warning" : "text-muted-foreground")} title="Days since purchase">
              {view.stockAgeDays === 0 ? "Added today" : `${view.stockAgeDays}d in stock`}
            </span>
          )}
        </div>

        <div className="mt-auto flex items-end justify-between gap-2 border-t pt-2.5">
          <div className="min-w-0">
            <div className="text-[11px] text-muted-foreground">{sold ? "Sold for" : "Asking"}</div>
            <div className="text-base leading-tight font-semibold tracking-tight tabular">{formatINR(price)}</div>
          </div>
          {view.reservationCustomer && (
            <span className="min-w-0 truncate text-right text-[11px] text-warning" title={`Reserved for ${view.reservationCustomer.name}`}>
              for <strong className="font-medium">{view.reservationCustomer.name}</strong>
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
