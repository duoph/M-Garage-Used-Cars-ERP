"use client";
import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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

/** Cars render in batches; the next batch loads as the list nears the bottom of the screen. */
const PAGE_SIZE = 50;

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
  const storedView = useUiStore((s) => s.inventoryView);
  const setView = useUiStore((s) => s.setInventoryView);
  const view = storedView ?? ds.settings.defaultInventoryView;
  const params = useSearchParams();
  // Deep links (e.g. from the dashboard's "To do" list) can preset status and sort.
  const [filters, setFilters] = React.useState<InventoryFilters>(() => ({
    ...DEFAULT_INVENTORY_FILTERS,
    status: (["all", "in_stock", "available", "reserved", "sold"] as const).find((s) => s === params.get("status")) ?? "all",
    sort: (Object.keys(SORT_LABELS) as InventorySort[]).find((s) => s === params.get("sort")) ?? "newest",
  }));
  const [page, setPage] = React.useState({ key: "", limit: PAGE_SIZE });

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

  // The loaded count resets to the first batch whenever the filters change.
  const limit = page.key === filterKey ? page.limit : PAGE_SIZE;
  const visible = rows.slice(0, limit);
  const hasMore = rows.length > limit;
  const loadMore = React.useCallback(
    () => setPage((p) => ({ key: filterKey, limit: (p.key === filterKey ? p.limit : PAGE_SIZE) + PAGE_SIZE })),
    [filterKey],
  );

  const set = <K extends keyof InventoryFilters>(k: K, v: InventoryFilters[K]) => setFilters((f) => ({ ...f, [k]: v }));
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
        {/* Tabs + filters stay pinned under the top bar while the list scrolls. */}
        <div className="sticky top-12 z-10 rounded-t-xl border-b bg-card">
          <div className="flex items-end justify-between gap-3 border-b px-3 pt-1 sm:px-4">
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
                      "flex h-10 shrink-0 items-center gap-2 border-b-2 px-2.5 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/30 rounded-t-md",
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
            <span className="hidden shrink-0 pb-3 text-xs text-muted-foreground xl:inline">
              Stock value <strong className="font-semibold text-foreground tabular">{formatINRCompact(canCost ? counts.acquisitionValuePaise : counts.askingValuePaise)}</strong>
              {canCost ? " at cost" : " asking"}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 sm:px-4">
            <SearchInput value={filters.search} onChange={(v) => set("search", v)} placeholder="Search make, model, registration, stock no…" className="w-full sm:w-72" />
            {/* On phones the controls sit in one sideways-scrolling row to keep the pinned bar short. */}
            <div className="-mx-3 flex w-[calc(100%+1.5rem)] items-center gap-2 overflow-x-auto px-3 [scrollbar-width:none] *:shrink-0 sm:mx-0 sm:w-auto sm:flex-1 sm:flex-wrap sm:overflow-visible sm:px-0">
              <Select value={filters.fuel} onValueChange={(v) => set("fuel", v as InventoryFilters["fuel"])}>
                <SelectTrigger className="h-9 w-[118px]" aria-label="Fuel"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All fuels</SelectItem>
                  {FUEL_TYPES.map((f) => <SelectItem key={f} value={f}>{FUEL_LABELS[f]}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filters.transmission} onValueChange={(v) => set("transmission", v as InventoryFilters["transmission"])}>
                <SelectTrigger className="h-9 w-[140px]" aria-label="Transmission"><SelectValue /></SelectTrigger>
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
              <div className="ml-auto flex items-center gap-2">
                <span className="hidden text-xs text-muted-foreground tabular md:inline">
                  {rows.length === all.length ? `${rows.length} vehicles` : `${rows.length} of ${all.length}`}
                </span>
                <Select value={filters.sort} onValueChange={(v) => set("sort", v as InventorySort)}>
                  <SelectTrigger className="h-9 w-[160px]" aria-label="Sort by"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(SORT_LABELS) as InventorySort[]).map((s) => <SelectItem key={s} value={s}>{SORT_LABELS[s]}</SelectItem>)}
                  </SelectContent>
                </Select>
                <ToggleGroup type="single" value={view} onValueChange={(v) => v && setView(v as "grid" | "table")} aria-label="View">
                  <ToggleGroupItem value="table" aria-label="List view"><List /></ToggleGroupItem>
                  <ToggleGroupItem value="grid" aria-label="Grid view"><LayoutGrid /></ToggleGroupItem>
                </ToggleGroup>
              </div>
            </div>
          </div>
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
        ) : (
          <>
            {view === "grid" ? (
              <div className="grid gap-3 p-3 sm:grid-cols-2 sm:p-4 xl:grid-cols-3 2xl:grid-cols-4">
                {visible.map((r) => <VehicleCard key={r.vehicle.id} view={r} />)}
              </div>
            ) : (
              <ul className="divide-y">
                {visible.map((r) => <VehicleRow key={r.vehicle.id} view={r} showCost={canCost} />)}
              </ul>
            )}
            <LoadMore shown={visible.length} total={rows.length} hasMore={hasMore} onLoadMore={loadMore} />
          </>
        )}
      </Card>
    </>
  );
}

/** One car per row: photo, name and specs on the left; price, status and stock age on the right. */
function VehicleRow({ view: r, showCost }: { view: VehicleView; showCost: boolean }) {
  const v = r.vehicle;
  const aging = v.status !== "sold" && r.stockAgeDays > 60;
  return (
    <li className="flex items-center gap-2 pr-2 transition-colors hover:bg-muted/50 sm:pr-3">
      <Link href={`/inventory/${v.id}`} className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-3 outline-none focus-visible:bg-muted sm:pl-4">
        <VehicleImage image={r.cover} alt={vehicleTitle(v)} className="h-12 w-[72px] shrink-0 rounded-md" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">
            {v.year} {vehicleTitle(v)} <span className="font-normal text-muted-foreground">{v.variant}</span>
          </div>
          <div className="truncate text-xs text-muted-foreground">
            <span className="font-mono text-foreground/80">{v.registrationNumber}</span>
            {" · "}{FUEL_LABELS[v.fuelType]} · {TRANSMISSION_LABELS[v.transmission]} · {formatKm(v.mileageKm)}
          </div>
          {/* On phones, price and status move under the name. */}
          <div className="mt-1 flex items-center gap-2 sm:hidden">
            <span className="text-sm font-semibold tabular">{formatINR(v.askingPricePaise)}</span>
            <VehicleStatusBadge status={v.status} />
          </div>
        </div>
        <div className="hidden w-28 shrink-0 text-right sm:block">
          <div className="text-sm font-semibold tabular">{formatINR(v.askingPricePaise)}</div>
          {showCost && <div className="text-[11px] text-muted-foreground tabular">Cost {formatINR(r.landedCostPaise)}</div>}
        </div>
        <div className="hidden w-24 shrink-0 justify-end sm:flex">
          <VehicleStatusBadge status={v.status} />
        </div>
        <div className={cn("hidden w-10 shrink-0 text-right text-xs tabular md:block", aging ? "font-medium text-warning" : "text-muted-foreground")} title="Days in stock">
          {r.stockAgeDays}d
        </div>
      </Link>
      <VehicleActionsMenu view={r} />
    </li>
  );
}

/** Auto-loads the next batch when the footer scrolls near view; the button covers keyboard users and slow scrolls. */
function LoadMore({ shown, total, hasMore, onLoadMore }: { shown: number; total: number; hasMore: boolean; onLoadMore: () => void }) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const el = ref.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver(([entry]) => entry.isIntersecting && onLoadMore(), { rootMargin: "400px 0px" });
    io.observe(el);
    return () => io.disconnect();
    // `shown` re-arms the observer after each batch, so a still-visible footer keeps loading.
  }, [hasMore, onLoadMore, shown]);

  return (
    <div ref={ref} className="flex flex-col items-center gap-2 border-t px-4 py-3 text-xs text-muted-foreground">
      <span className="tabular">Showing {shown} of {total}</span>
      {hasMore && (
        <Button variant="outline" size="sm" onClick={onLoadMore}>
          Load {Math.min(PAGE_SIZE, total - shown)} more
        </Button>
      )}
    </div>
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
