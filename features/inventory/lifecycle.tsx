"use client";
import { Check, CircleDot, ClipboardList, Receipt, ShoppingCart } from "lucide-react";
import type { VehicleView } from "@/lib/calculations/selectors";
import { formatDate } from "@/lib/utils/dates";
import { cn } from "@/lib/utils/cn";

/** Purchased → In stock → Reserved → Sold, so anyone can see where a car is at a glance. */
export function VehicleLifecycle({ view }: { view: VehicleView }) {
  const v = view.vehicle;
  const steps = [
    { key: "purchased", label: "Purchased", icon: ShoppingCart, date: view.purchase?.purchaseDate, done: true },
    { key: "stock", label: "In stock", icon: CircleDot, date: view.purchase?.purchaseDate, done: true, note: v.status === "available" ? `${view.stockAgeDays} days` : undefined },
    {
      key: "reserved",
      label: "Reserved",
      icon: ClipboardList,
      date: view.reservation?.reservationDate,
      done: v.status === "reserved" || v.status === "sold",
      skipped: v.status === "sold" && !view.sale?.reservationId,
      note: view.reservationCustomer?.name,
    },
    { key: "sold", label: "Sold", icon: Receipt, date: view.sale?.saleDate, done: v.status === "sold", note: view.buyer?.name },
  ];
  const currentIndex = v.status === "sold" ? 3 : v.status === "reserved" ? 2 : 1;

  return (
    <ol className="flex items-start" aria-label="Vehicle lifecycle">
      {steps.map((s, i) => {
        const current = i === currentIndex;
        return (
          <li key={s.key} className="relative flex flex-1 flex-col items-center text-center">
            {i > 0 && (
              <span
                aria-hidden
                className={cn("absolute top-4 right-1/2 h-0.5 w-full -translate-y-1/2", s.done && !s.skipped ? "bg-primary" : "bg-[#e4e7ec]")}
              />
            )}
            <span
              className={cn(
                "relative z-10 flex size-8 items-center justify-center rounded-full border-2 bg-card",
                s.skipped ? "border-dashed border-[#d0d5dd] text-[#98a2b3]" : s.done ? "border-primary text-primary" : "border-[#e4e7ec] text-[#98a2b3]",
                current && "bg-primary text-white",
              )}
            >
              {s.done && !current && !s.skipped ? <Check className="size-4" /> : <s.icon className="size-4" />}
            </span>
            <span className={cn("mt-1.5 text-xs font-medium", current ? "text-foreground" : "text-muted-foreground")}>{s.label}</span>
            <span className="text-[11px] text-muted-foreground">
              {s.skipped ? "Direct sale" : s.done && s.date ? formatDate(s.date) : "—"}
            </span>
            {s.note && !s.skipped && <span className="max-w-24 truncate text-[11px] text-muted-foreground">{s.note}</span>}
          </li>
        );
      })}
    </ol>
  );
}
