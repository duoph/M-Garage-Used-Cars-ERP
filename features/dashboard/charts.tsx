"use client";
import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatINR, formatINRCompact } from "@/lib/utils/money";
import { EXPENSE_CATEGORY_LABELS } from "@/lib/utils/labels";
import type { MonthlyPoint } from "@/lib/calculations/selectors";
import type { ExpenseCategory, VehicleStatus } from "@/types";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { EmptyState } from "@/components/shared/empty-state";
import { BarChart3 } from "lucide-react";

const AXIS = { fontSize: 11, fill: "#667085" };
const GRID = "#eef0f3";

function TooltipBox({ title, rows }: { title: string; rows: { label: string; value: string; color?: string }[] }) {
  return (
    <div className="min-w-40 rounded-lg border bg-card px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-medium text-foreground">{title}</p>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            {r.color && <span className="size-2 rounded-sm" style={{ background: r.color }} />}
            {r.label}
          </span>
          <span className="font-medium tabular text-foreground">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

type SalesMetric = "revenue" | "profit" | "units";

export function SalesPerformanceChart({ data, showProfit }: { data: MonthlyPoint[]; showProfit: boolean }) {
  const [metric, setMetric] = React.useState<SalesMetric>("revenue");
  const active: SalesMetric = !showProfit && metric === "profit" ? "revenue" : metric;
  const key = active === "revenue" ? "revenuePaise" : active === "profit" ? "profitPaise" : "count";
  const fmt = (v: number) => (active === "units" ? String(v) : formatINRCompact(v));
  const empty = data.every((d) => d.count === 0);

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex justify-end px-2">
        <ToggleGroup type="single" value={active} onValueChange={(v) => v && setMetric(v as SalesMetric)} aria-label="Chart metric">
          <ToggleGroupItem value="revenue">Revenue</ToggleGroupItem>
          {showProfit && <ToggleGroupItem value="profit">Gross profit</ToggleGroupItem>}
          <ToggleGroupItem value="units">Units</ToggleGroupItem>
        </ToggleGroup>
      </div>
      {empty ? (
        <EmptyState icon={BarChart3} title="No sales yet" description="Completed sales will be charted here." className="py-10" />
      ) : (
        <div className="h-64" role="img" aria-label={`Monthly ${active} bar chart`}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="28%">
              <CartesianGrid vertical={false} stroke={GRID} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={AXIS} />
              <YAxis tickLine={false} axisLine={false} tick={AXIS} width={56} tickFormatter={fmt} allowDecimals={false} />
              <Tooltip
                cursor={{ fill: "#f3f4f7" }}
                content={({ active: on, payload }) => {
                  if (!on || !payload?.length) return null;
                  const p = payload[0].payload as MonthlyPoint;
                  const rows = [
                    { label: "Revenue", value: formatINR(p.revenuePaise) },
                    { label: "Cars sold", value: String(p.count) },
                  ];
                  if (showProfit) rows.push({ label: "Gross profit", value: formatINR(p.profitPaise) });
                  return <TooltipBox title={p.key} rows={rows} />;
                }}
              />
              <Bar dataKey={key} fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={44} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

const STATUS_COLORS: Record<VehicleStatus, string> = { available: "#059669", reserved: "#d97706", sold: "#94a3b8" };
const STATUS_LABELS: Record<VehicleStatus, string> = { available: "Available", reserved: "Reserved", sold: "Sold" };

export function InventoryStatusChart({ counts }: { counts: Record<VehicleStatus, number> }) {
  const data = (Object.keys(counts) as VehicleStatus[]).map((s) => ({ status: s, value: counts[s] }));
  const total = data.reduce((a, d) => a + d.value, 0);
  if (total === 0)
    return <EmptyState icon={BarChart3} title="No vehicles yet" description="Add a purchase to start tracking stock." className="py-10" />;
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row lg:flex-col xl:flex-row">
      <div className="relative h-44 w-44 shrink-0" role="img" aria-label="Inventory status donut chart">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="status" innerRadius={52} outerRadius={78} paddingAngle={2} stroke="#fff" strokeWidth={2}>
              {data.map((d) => (
                <Cell key={d.status} fill={STATUS_COLORS[d.status]} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as { status: VehicleStatus; value: number };
                return <TooltipBox title={STATUS_LABELS[d.status]} rows={[{ label: "Vehicles", value: String(d.value) }]} />;
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold tabular">{total}</span>
          <span className="text-[11px] text-muted-foreground">vehicles</span>
        </div>
      </div>
      <ul className="grid w-full gap-2 text-sm">
        {data.map((d) => (
          <li key={d.status} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-muted-foreground">
              <span className="size-2.5 rounded-sm" style={{ background: STATUS_COLORS[d.status] }} />
              {STATUS_LABELS[d.status]}
            </span>
            <span className="font-medium tabular">
              {d.value} <span className="text-xs font-normal text-muted-foreground">({Math.round((d.value / total) * 100)}%)</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ExpenseBreakdownChart({
  data,
  height = 240,
}: {
  data: { category: ExpenseCategory; amountPaise: number; vehicle: boolean }[];
  height?: number;
}) {
  if (data.length === 0)
    return <EmptyState icon={BarChart3} title="No expenses in this period" description="Recorded expenses will be grouped by category." className="py-10" />;
  const rows = data.slice(0, 8).map((d) => ({ ...d, label: EXPENSE_CATEGORY_LABELS[d.category] }));
  return (
    <div style={{ height: Math.max(160, Math.min(height, rows.length * 34 + 20)) }} role="img" aria-label="Expenses by category bar chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }} barCategoryGap="22%">
          <CartesianGrid horizontal={false} stroke={GRID} />
          <XAxis type="number" tickLine={false} axisLine={false} tick={AXIS} tickFormatter={(v: number) => formatINRCompact(v)} />
          <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} tick={AXIS} width={132} />
          <Tooltip
            cursor={{ fill: "#f3f4f7" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as (typeof rows)[number];
              return (
                <TooltipBox
                  title={d.label}
                  rows={[
                    { label: "Amount", value: formatINR(d.amountPaise) },
                    { label: "Type", value: d.vehicle ? "Vehicle" : "General" },
                  ]}
                />
              );
            }}
          />
          <Bar dataKey="amountPaise" radius={[0, 4, 4, 0]} maxBarSize={20}>
            {rows.map((r) => (
              <Cell key={r.category} fill={r.vehicle ? "var(--chart-1)" : "var(--chart-2)"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ExpenseLegend() {
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-chart-1" /> Vehicle</span>
      <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-chart-2" /> General</span>
    </div>
  );
}
