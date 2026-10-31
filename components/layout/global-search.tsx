"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { CarFront, Receipt, Search, ShoppingCart } from "lucide-react";
import { Dialog as P } from "radix-ui";
import { useData } from "@/components/providers/data-provider";
import { useAuth } from "@/hooks/use-auth";
import { useDialogStore } from "@/lib/store/dialogs";
import { VehicleStatusBadge } from "@/components/shared/status-badge";
import { VehicleImage } from "@/components/shared/vehicle-image";
import { vehicleTitle } from "@/lib/utils/labels";
import { formatINR } from "@/lib/utils/money";

export function GlobalSearchTrigger() {
  const setOpen = useDialogStore((s) => s.setSearch);
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="flex h-8 w-full max-w-md items-center gap-2 rounded-md border border-input bg-card px-3 text-sm text-muted-foreground shadow-xs transition-colors hover:bg-card focus-visible:ring-2 focus-visible:ring-ring/30 outline-none"
    >
      <Search className="size-4" />
      <span className="truncate">Search vehicles, registrations, sales…</span>
    </button>
  );
}

export function GlobalSearch() {
  const open = useDialogStore((s) => s.search);
  const setOpen = useDialogStore((s) => s.setSearch);
  const router = useRouter();
  const { ds, idx } = useData();
  const { can, user } = useAuth();

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(!useDialogStore.getState().search);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const vehicles = ds.vehicles.filter((v) => !v.archivedAt);
  const sales = can("sales.view") ? ds.sales.filter((s) => can("sales.viewAll") || s.soldBy === user?.id) : [];
  const purchases = can("purchases.view") ? ds.purchases : [];

  return (
    <P.Root open={open} onOpenChange={setOpen}>
      <P.Portal>
        <P.Overlay className="fixed inset-0 z-50 bg-[#0b1220]/45 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <P.Content className="fixed top-[12vh] left-1/2 z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl border bg-card shadow-2xl outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.98]">
          <P.Title className="sr-only">Search</P.Title>
          <P.Description className="sr-only">Search vehicles, sales and purchases</P.Description>
          <Command label="Global search" className="flex flex-col">
            <div className="flex items-center gap-2 border-b px-3">
              <Search className="size-4 text-muted-foreground" />
              <Command.Input
                autoFocus
                placeholder="Make, model, registration, stock no., buyer…"
                className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            <Command.List className="max-h-[60vh] overflow-y-auto p-1.5">
              <Command.Empty className="py-10 text-center text-sm text-muted-foreground">No matching records.</Command.Empty>
              <Command.Group heading="Vehicles" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground">
                {vehicles.map((v) => {
                  const imgs = idx.imagesByVehicle.get(v.id);
                  const cover = imgs?.find((i) => i.id === v.coverImageId) ?? imgs?.[0];
                  return (
                    <Command.Item
                      key={v.id}
                      value={`${v.make} ${v.model} ${v.variant} ${v.registrationNumber} ${v.registrationNumber.replace(/\s/g, "")} ${v.stockNumber} ${v.year}`}
                      onSelect={() => go(`/inventory/${v.id}`)}
                      className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm aria-selected:bg-muted"
                    >
                      <VehicleImage image={cover} alt="" className="h-9 w-12 shrink-0 rounded" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">
                          {v.year} {vehicleTitle(v)} <span className="font-normal text-muted-foreground">{v.variant}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {v.registrationNumber} · {v.stockNumber} · {formatINR(v.askingPricePaise)}
                        </div>
                      </div>
                      <VehicleStatusBadge status={v.status} />
                    </Command.Item>
                  );
                })}
              </Command.Group>
              {sales.length > 0 && (
                <Command.Group heading="Sales" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground">
                  {sales.map((s) => {
                    const v = idx.vehicles.get(s.vehicleId);
                    const c = idx.customers.get(s.customerId);
                    return (
                      <Command.Item
                        key={s.id}
                        value={`${s.reference} ${c?.name ?? ""} ${c?.phone ?? ""} ${v ? vehicleTitle(v) : ""}`}
                        onSelect={() => go(`/sales/${s.id}`)}
                        className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm aria-selected:bg-muted"
                      >
                        <Receipt className="size-4 text-muted-foreground" />
                        <span className="font-medium">{s.reference}</span>
                        <span className="truncate text-muted-foreground">
                          {c?.name} · {v ? vehicleTitle(v) : ""}
                        </span>
                      </Command.Item>
                    );
                  })}
                </Command.Group>
              )}
              {purchases.length > 0 && (
                <Command.Group heading="Purchases" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground">
                  {purchases.map((p) => {
                    const v = idx.vehicles.get(p.vehicleId);
                    return (
                      <Command.Item
                        key={p.id}
                        value={`${p.reference} ${p.sellerName} ${v ? vehicleTitle(v) : ""}`}
                        onSelect={() => go(`/purchases/${p.id}`)}
                        className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm aria-selected:bg-muted"
                      >
                        <ShoppingCart className="size-4 text-muted-foreground" />
                        <span className="font-medium">{p.reference}</span>
                        <span className="truncate text-muted-foreground">
                          {p.sellerName} · {v ? vehicleTitle(v) : ""}
                        </span>
                      </Command.Item>
                    );
                  })}
                </Command.Group>
              )}
            </Command.List>
            <div className="flex items-center gap-3 border-t px-3 py-2 text-[11px] text-muted-foreground">
              <CarFront className="size-3.5" /> Use ↑ ↓ to navigate, Enter to open, Esc to close
            </div>
          </Command>
        </P.Content>
      </P.Portal>
    </P.Root>
  );
}
