"use client";
import Link from "next/link";
import { CalendarClock, Fuel, Gauge, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { AGING_DAYS } from "@/features/dashboard/needs-attention";
import type { VehicleView } from "@/lib/calculations/selectors";
import { formatINR } from "@/lib/utils/money";
import { FUEL_LABELS, TRANSMISSION_LABELS, formatKm, vehicleTitle } from "@/lib/utils/labels";
import { Card } from "@/components/ui/card";
import { VehicleImage } from "@/components/shared/vehicle-image";
import { VehicleStatusBadge } from "@/components/shared/status-badge";
import { VehicleActionsMenu } from "./vehicle-actions";

export function VehicleCard({ view }: { view: VehicleView }) {
  const v = view.vehicle;
  const href = `/inventory/${v.id}`;
  return (
    <Card className="group flex flex-col overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg">
      <Link href={href} className="relative block outline-none focus-visible:ring-2 focus-visible:ring-ring/40" tabIndex={-1} aria-hidden>
        <VehicleImage image={view.cover} alt={vehicleTitle(v)} className="aspect-[16/10] w-full" imgClassName="transition-transform duration-300 group-hover:scale-[1.02]" />
        <div className="absolute top-2.5 left-2.5">
          <VehicleStatusBadge status={v.status} />
        </div>
        {view.images.length > 1 && (
          <span className="absolute right-2.5 bottom-2.5 rounded-md bg-black/55 px-1.5 py-0.5 text-[11px] font-medium text-white">
            {view.images.length} photos
          </span>
        )}
      </Link>
      <div className="flex flex-1 flex-col p-3.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link href={href} className="block truncate text-[15px] font-semibold tracking-tight hover:underline focus-visible:outline-2 focus-visible:outline-ring rounded">
              {vehicleTitle(v)}
            </Link>
            <p className="truncate text-xs text-muted-foreground">
              {v.year} · {v.variant || "—"}
            </p>
          </div>
          <VehicleActionsMenu view={view} />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="inline-flex w-fit rounded border bg-[#f9fafb] px-1.5 py-0.5 font-mono text-[11px] tracking-wide text-[#344054]">
            {v.registrationNumber}
          </span>
          {v.status !== "sold" && (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px]",
                view.stockAgeDays > AGING_DAYS ? "bg-warning-soft font-medium text-warning" : "text-muted-foreground",
              )}
              title="Days since purchase"
            >
              <CalendarClock className="size-3" />
              {view.stockAgeDays === 0 ? "Added today" : `${view.stockAgeDays} day${view.stockAgeDays === 1 ? "" : "s"} in stock`}
            </span>
          )}
        </div>
        {view.reservationCustomer && (
          <p className="mt-2 truncate rounded-md bg-warning-soft/60 px-2 py-1 text-[11.5px] text-[#7a3e06]">
            Reserved for <strong className="font-semibold">{view.reservationCustomer.name}</strong>
          </p>
        )}
        <ul className="mt-3 mb-3 grid grid-cols-3 gap-2 text-[11.5px] text-muted-foreground">
          <li className="flex items-center gap-1 truncate"><Gauge className="size-3.5 shrink-0" />{formatKm(v.mileageKm)}</li>
          <li className="flex items-center gap-1 truncate"><Fuel className="size-3.5 shrink-0" />{FUEL_LABELS[v.fuelType]}</li>
          <li className="flex items-center gap-1 truncate"><Settings2 className="size-3.5 shrink-0" />{TRANSMISSION_LABELS[v.transmission]}</li>
        </ul>
        <div className="mt-auto flex items-end justify-between border-t pt-3">
          <div>
            <div className="text-[11px] text-muted-foreground">{v.status === "sold" ? "Sold for" : "Asking price"}</div>
            <div className="text-base font-semibold tabular">{formatINR(view.sale?.salePricePaise ?? v.askingPricePaise)}</div>
          </div>
          <Link href={href} className="text-xs font-medium text-primary hover:underline">
            View details
          </Link>
        </div>
      </div>
    </Card>
  );
}
