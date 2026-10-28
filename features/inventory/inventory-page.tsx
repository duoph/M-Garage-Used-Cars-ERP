"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CarFront, Download, LayoutGrid, List, Plus, SearchX, SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { toast } from "sonner";
import { useData } from "@/components/providers/data-provider";
import { useAuth } from "@/hooks/use-auth";
import { useUiStore } from "@/lib/store/ui";
import { activeVehicles, inventoryCounts, vehicleView, type VehicleView } from "@/lib/calculations/selectors";
import { FUEL_TYPES, TRANSMISSIONS } from "@/types";
import { FUEL_LABELS, TRANSMISSION_LABELS, formatKm, vehicleTitle } from "@/lib/utils/labels";
import { formatINR, formatINRCompact } from "@/lib/utils/money";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { PageHeader } from "@/components/shared/page-header";
import { SearchInput } from "@/components/shared/search-input";
import { EmptyState } from "@/components/shared/empty-state";
import { DataTable, type ColumnDef } from "@/components/shared/data-table";
import { VehicleImage } from "@/components/shared/vehicle-image";
import { VehicleStatusBadge } from "@/components/shared/status-badge";
import { CurrencyInput } from "@/components/shared/currency-input";
import { VehicleCard } from "./vehicle-card";
import { VehicleActionsMenu } from "./vehicle-actions";
import { exportStockCsv } from "./export";
import {
  DEFAULT_INVENTORY_FILTERS,
  SORT_LABELS,
  activeFilterCount,
  applyInventoryFilters,
  type InventoryFilters,
  type InventorySort,
} from "./filters";

const GRID_PAGE = 12;

const STATUS_TABS: { value: InventoryFilters["status"]; label: string; dot?: string }[] = [
  { value: "all", label: "All" },
  { value: "in_stock", label: "In stock" },
  { value: "available", label: "Available", dot: "bg-success" },
  { value: "reserved", label: "Reserved", dot: "bg-warning" },
  { value: "sold", label: "Sold", dot: "bg-[#98a2b3]" },
];

export function InventoryPage() {
  const { ds, idx } = useData();
  const { can } = useAuth();
  const router = useRouter();
  const storedView = useUiStore((s) => s.inventoryView);
  const setView = useUiStore((s) => s.setInventoryView);
  const view = storedView ?? ds.settings.defaultInventoryView;
  const params = useSearchParams();
  // Deep links (e.g. from the dashboard's "Needs attention") can preset status and sort.
  const [filters, setFilters] = React.useState<InventoryFilters>(() => ({
    ...DEFAULT_INVENTORY_FILTERS,
    status: (["all", "in_stock", "available", "reserved", "sold"] as const).find((s) => s === params.get("status")) ?? "all",
    sort: (Object.keys(SORT_LABELS) as InventorySort[]).find((s) => s === params.get("sort")) ?? "newest",
  }));
  const [grid, setGrid] = React.useState({ key: "", limit: GRID_PAGE });

  const all = React.useMemo(() => activeVehicles(ds).map((v) => vehicleView(v, idx)), [ds, idx]);
  const rows = React.useMemo(() => applyInventoryFilters(all, filters), [all, filters]);
  const counts = inventoryCounts(ds, idx);
  const nFilters = activeFilterCount(filters);
  const statusCount: Record<InventoryFilters["status"], number> = {
    all: all.length,
    in_stock: counts.inStock,
    available: counts.available,
    reserved: counts.reserved,
    sold: counts.sold,
  };
  const canCost = can("finance.viewCost");
  const filterKey = JSON.stringify(filters);

  // The "show more" count resets whenever the filters change.
  const gridLimit = grid.key === filterKey ? grid.limit : GRID_PAGE;
  const setGridLimit = (fn: (n: number) => number) => setGrid({ key: filterKey, limit: fn(gridLimit) });

  const set = <K extends keyof InventoryFilters>(k: K, v: InventoryFilters[K]) => setFilters((f) => ({ ...f, [k]: v }));

  const columns = React.useMemo<ColumnDef<VehicleView>[]>(() => {
    const cols: ColumnDef<VehicleView>[] = [
      {
        id: "vehicle",
        header: "Vehicle",
        accessorFn: (r) => `${r.vehicle.make} ${r.vehicle.model}`,
        cell: ({ row: { original: r } }) => (
          <div className="flex items-center gap-3">
            <VehicleImage image={r.cover} alt={vehicleTitle(r.vehicle)} className="h-10 w-14 shrink-0 rounded-md" />
            <div className="min-w-0">
              <Link href={`/inventory/${r.vehicle.id}`} className="font-medium hover:underline">
                {vehicleTitle(r.vehicle)}
              </Link>
              <div className="max-w-56 truncate text-xs text-muted-foreground">{r.vehicle.variant} · {r.vehicle.stockNumber}</div>
            </div>
          </div>
        ),
      },
      { id: "reg", header: "Registration", accessorFn: (r) => r.vehicle.registrationNumber, cell: ({ getValue }) => <span className="font-mono text-xs">{String(getValue())}</span> },
      { id: "year", header: "Year", accessorFn: (r) => r.vehicle.year },
      { id: "fuel", header: "Fuel", accessorFn: (r) => FUEL_LABELS[r.vehicle.fuelType], cell: ({ row: { original: r } }) => <span>{FUEL_LABELS[r.vehicle.fuelType]} · <span className="text-muted-foreground">{TRANSMISSION_LABELS[r.vehicle.transmission]}</span></span> },
      { id: "km", header: "Kilometers", accessorFn: (r) => r.vehicle.mileageKm, cell: ({ row: { original: r } }) => formatKm(r.vehicle.mileageKm), meta: { align: "right" } },
      { id: "price", header: "Asking price", accessorFn: (r) => r.vehicle.askingPricePaise, cell: ({ row: { original: r } }) => <span className="font-medium">{formatINR(r.vehicle.askingPricePaise)}</span>, meta: { align: "right" } },
    ];
    if (canCost)
      cols.push({
        id: "cost",
        header: "Landed cost",
        accessorFn: (r) => r.landedCostPaise,
        cell: ({ row: { original: r } }) => <span className="text-muted-foreground">{formatINR(r.landedCostPaise)}</span>,
        meta: { align: "right" },
      });
    cols.push(
      { id: "status", header: "Status", accessorFn: (r) => r.vehicle.status, cell: ({ row: { original: r } }) => <VehicleStatusBadge status={r.vehicle.status} /> },
      {
        id: "age",
        header: "Stock age",
        accessorFn: (r) => r.stockAgeDays,
        cell: ({ row: { original: r } }) => (
          <span className={r.vehicle.status !== "sold" && r.stockAgeDays > 60 ? "font-medium text-warning" : ""}>{r.stockAgeDays}d</span>
        ),
        meta: { align: "right" },
      },
      { id: "actions", header: () => <span className="sr-only">Actions</span>, enableSorting: false, cell: ({ row: { original: r } }) => <VehicleActionsMenu view={r} /> },
    );
    return cols;
  }, [canCost]);

  const noVehicles = all.length === 0;

  return (
    <>
      <PageHeader
        title="Vehicle Inventory"
        description="Manage and track all vehicles in your showroom. Click a car to see photos, costs and history."
        actions={
          <>
            {can("inventory.export") && (
              <Button
                variant="outline"
                disabled={rows.length === 0}
                onClick={() => {
                  exportStockCsv(rows, { includeCost: canCost, includeProfit: can("finance.viewProfit") });
                  toast.success(`Exported ${rows.length} vehicle${rows.length === 1 ? "" : "s"}`);
                }}
              >
                <Download /> Export
              </Button>
            )}
            {can("purchases.manage") && (
              <Button asChild>
                <Link href="/purchases/new"><Plus /> Add vehicle</Link>
              </Button>
            )}
          </>
        }
      />

      <Card>
        <div className="flex flex-col gap-3 border-b px-3 pt-3 sm:px-4 sm:pt-4 lg:flex-row lg:items-end lg:justify-between">
          <div role="tablist" aria-label="Vehicle status" className="-mb-px flex gap-1 overflow-x-auto [scrollbar-width:none]">
            {STATUS_TABS.map((t) => {
              const active = filters.status === t.value;
              return (
                <button
                  key={t.value}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => set("status", t.value)}
                  className={cn(
                    "flex h-10 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/30 rounded-t-md",
                    active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t.dot && <span className={cn("size-1.5 rounded-full", t.dot)} aria-hidden />}
                  {t.label}
                  <span className={cn("rounded-full px-1.5 text-[11px] tabular", active ? "bg-primary-soft text-primary" : "bg-muted text-muted-foreground")}>
                    {statusCount[t.value]}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2 pb-3">
            <span className="hidden text-xs text-muted-foreground xl:inline">
              Stock value <strong className="font-semibold text-foreground tabular">{formatINRCompact(canCost ? counts.acquisitionValuePaise : counts.askingValuePaise)}</strong>
              {canCost ? " at cost" : " asking"}
            </span>
            <Select value={filters.sort} onValueChange={(v) => set("sort", v as InventorySort)}>
              <SelectTrigger className="h-9 w-[170px]" aria-label="Sort by"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(SORT_LABELS) as InventorySort[]).map((s) => <SelectItem key={s} value={s}>{SORT_LABELS[s]}</SelectItem>)}
              </SelectContent>
            </Select>
            <ToggleGroup type="single" value={view} onValueChange={(v) => v && setView(v as "grid" | "table")} aria-label="View">
              <ToggleGroupItem value="grid" aria-label="Grid view"><LayoutGrid /></ToggleGroupItem>
              <ToggleGroupItem value="table" aria-label="Table view"><List /></ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>
        <div className="flex flex-col gap-2 border-b bg-[#fbfcfd] p-3 sm:flex-row sm:flex-wrap sm:items-center sm:px-4">
          <SearchInput value={filters.search} onChange={(v) => set("search", v)} placeholder="Search make, model, registration, stock no…" className="sm:w-80" />
          <div className="flex flex-wrap items-center gap-2">
            <Select value={filters.fuel} onValueChange={(v) => set("fuel", v as InventoryFilters["fuel"])}>
              <SelectTrigger className="h-9 w-[120px]" aria-label="Fuel"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All fuels</SelectItem>
                {FUEL_TYPES.map((f) => <SelectItem key={f} value={f}>{FUEL_LABELS[f]}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filters.transmission} onValueChange={(v) => set("transmission", v as InventoryFilters["transmission"])}>
              <SelectTrigger className="h-9 w-[150px]" aria-label="Transmission"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All gearboxes</SelectItem>
                {TRANSMISSIONS.map((t) => <SelectItem key={t} value={t}>{TRANSMISSION_LABELS[t]}</SelectItem>)}
              </SelectContent>
            </Select>
            <MoreFilters filters={filters} setFilters={setFilters} />
            {nFilters > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setFilters((f) => ({ ...DEFAULT_INVENTORY_FILTERS, sort: f.sort }))}>
                <X /> Clear ({nFilters})
              </Button>
            )}
          </div>
          <span className="text-xs text-muted-foreground tabular sm:ml-auto">
            {rows.length === all.length ? `${rows.length} vehicles` : `${rows.length} of ${all.length} vehicles`}
          </span>
        </div>

        {noVehicles ? (
          <EmptyState
            icon={CarFront}
            title="Your inventory is empty"
            description="Vehicles appear here when you record a purchase."
            action={can("purchases.manage") && <Button asChild><Link href="/purchases/new"><Plus /> Record purchase</Link></Button>}
          />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={SearchX}
            title="No vehicles match your filters"
            description="Try a different search term or clear some filters."
            action={<Button variant="outline" onClick={() => setFilters(DEFAULT_INVENTORY_FILTERS)}>Clear all filters</Button>}
          />
        ) : view === "grid" ? (
          <div className="p-3 sm:p-4">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {rows.slice(0, gridLimit).map((r) => <VehicleCard key={r.vehicle.id} view={r} />)}
            </div>
            {rows.length > gridLimit && (
              <div className="mt-4 flex justify-center">
                <Button variant="outline" onClick={() => setGridLimit((n) => n + GRID_PAGE)}>
                  Show more ({rows.length - gridLimit} remaining)
                </Button>
              </div>
            )}
          </div>
        ) : (
          <DataTable
            data={rows}
            columns={columns}
            getRowId={(r) => r.vehicle.id}
            resetPageKey={filterKey}
            onRowClick={(r) => router.push(`/inventory/${r.vehicle.id}`)}
            renderMobileCard={(r) => (
              <div className="flex items-center gap-3 px-4 py-3">
                <Link href={`/inventory/${r.vehicle.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <VehicleImage image={r.cover} alt={vehicleTitle(r.vehicle)} className="h-14 w-20 shrink-0 rounded-md" />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{r.vehicle.year} {vehicleTitle(r.vehicle)}</div>
                    <div className="truncate text-xs text-muted-foreground">{r.vehicle.registrationNumber} · {formatKm(r.vehicle.mileageKm)}</div>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-sm font-semibold tabular">{formatINR(r.vehicle.askingPricePaise)}</span>
                      <VehicleStatusBadge status={r.vehicle.status} />
                    </div>
                  </div>
                </Link>
                <VehicleActionsMenu view={r} />
              </div>
            )}
          />
        )}
      </Card>
    </>
  );
}

function MoreFilters({ filters, setFilters }: { filters: InventoryFilters; setFilters: React.Dispatch<React.SetStateAction<InventoryFilters>> }) {
  const n = [filters.yearFrom, filters.yearTo, filters.priceMin, filters.priceMax].filter((v) => v !== null).length;
  const yearNow = new Date().getFullYear();
  const num = (s: string) => (s === "" ? null : Number(s));
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="h-9">
          <SlidersHorizontal /> Year & price{n > 0 && <span className="rounded-full bg-primary px-1.5 text-[10px] text-white">{n}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label>Manufacturing year</Label>
            <div className="grid grid-cols-2 gap-2">
              <Input type="number" placeholder="From" min={1990} max={yearNow} value={filters.yearFrom ?? ""} onChange={(e) => setFilters((f) => ({ ...f, yearFrom: num(e.target.value) }))} aria-label="Year from" />
              <Input type="number" placeholder="To" min={1990} max={yearNow} value={filters.yearTo ?? ""} onChange={(e) => setFilters((f) => ({ ...f, yearTo: num(e.target.value) }))} aria-label="Year to" />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Asking price</Label>
            <div className="grid grid-cols-2 gap-2">
              <CurrencyInput value={filters.priceMin} onChange={(v) => setFilters((f) => ({ ...f, priceMin: v }))} placeholder="Min" aria-describedby="price-hint" />
              <CurrencyInput value={filters.priceMax} onChange={(v) => setFilters((f) => ({ ...f, priceMax: v }))} placeholder="Max" aria-describedby="price-hint" />
            </div>
            <p id="price-hint" className="text-xs text-muted-foreground">Enter amounts in rupees, e.g. 500000 for ₹5 lakh.</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="justify-self-start"
            onClick={() => setFilters((f) => ({ ...f, yearFrom: null, yearTo: null, priceMin: null, priceMax: null }))}
          >
            Reset year & price
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
