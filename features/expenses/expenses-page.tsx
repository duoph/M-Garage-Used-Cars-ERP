"use client";
import * as React from "react";
import Link from "next/link";
import { Download, MoreHorizontal, Pencil, Plus, SearchX, Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { useData } from "@/components/providers/data-provider";
import { useAuth, useCurrentUser } from "@/hooks/use-auth";
import { useDialogStore } from "@/lib/store/dialogs";
import { dealerService } from "@/lib/services/dealer-service";
import { reportError } from "@/hooks/use-commands";
import { expenseBreakdown } from "@/lib/calculations/selectors";
import { formatDate, inRange, resolvePreset, todayISO, type DateRange } from "@/lib/utils/dates";
import { formatINR, formatINRCompact, sumPaise } from "@/lib/utils/money";
import { EXPENSE_CATEGORY_LABELS, PAYMENT_METHOD_LABELS, vehicleTitle } from "@/lib/utils/labels";
import { csvRupees, downloadCsv } from "@/lib/utils/csv";
import { EXPENSE_CATEGORIES, type Expense, type ExpenseCategory } from "@/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PageHeader } from "@/components/shared/page-header";
import { SearchInput } from "@/components/shared/search-input";
import { DateRangePicker } from "@/components/shared/date-range-picker";
import { DataTable, type ColumnDef } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { StatCard } from "@/components/shared/stat-card";
import { ChartCard } from "@/components/shared/chart-card";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ExpenseBreakdownChart, ExpenseLegend } from "@/features/dashboard/charts";

export function ExpensesPage() {
  const { ds, idx } = useData();
  const { can } = useAuth();
  const user = useCurrentUser();
  const openExpense = useDialogStore((s) => s.openExpense);
  const [range, setRange] = React.useState<DateRange>(resolvePreset("this_month"));
  const [search, setSearch] = React.useState("");
  const [type, setType] = React.useState<"all" | "vehicle" | "general">("all");
  const [category, setCategory] = React.useState<"all" | ExpenseCategory>("all");
  const [toDelete, setToDelete] = React.useState<Expense | null>(null);
  const canManage = can("expenses.manage");

  const inPeriod = React.useMemo(() => ds.expenses.filter((e) => inRange(e.date, range)), [ds.expenses, range]);
  const rows = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return inPeriod
      .filter((e) => (type === "all" ? true : type === "vehicle" ? !!e.vehicleId : !e.vehicleId))
      .filter((e) => category === "all" || e.category === category)
      .filter((e) => {
        if (!q) return true;
        const v = e.vehicleId ? idx.vehicles.get(e.vehicleId) : undefined;
        return `${e.reference} ${e.description} ${e.vendor} ${EXPENSE_CATEGORY_LABELS[e.category]} ${v?.make ?? ""} ${v?.model ?? ""} ${v?.registrationNumber ?? ""}`.toLowerCase().includes(q);
      })
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  }, [inPeriod, search, type, category, idx]);

  const totalAll = sumPaise(inPeriod.map((e) => e.amountPaise));
  const totalVehicle = sumPaise(inPeriod.filter((e) => e.vehicleId).map((e) => e.amountPaise));
  const totalGeneral = totalAll - totalVehicle;

  const columns = React.useMemo<ColumnDef<Expense>[]>(
    () => [
      { id: "date", header: "Date", accessorFn: (e) => e.date, cell: ({ row: { original: e } }) => formatDate(e.date) },
      { id: "ref", header: "Reference", accessorFn: (e) => e.reference, cell: ({ getValue }) => <span className="text-muted-foreground">{String(getValue())}</span> },
      { id: "category", header: "Category", accessorFn: (e) => EXPENSE_CATEGORY_LABELS[e.category], cell: ({ row: { original: e } }) => <Badge tone={e.vehicleId ? "brand" : "neutral"}>{EXPENSE_CATEGORY_LABELS[e.category]}</Badge> },
      {
        id: "desc",
        header: "Description",
        accessorFn: (e) => e.description,
        cell: ({ row: { original: e } }) => (
          <div className="max-w-64">
            <div className="truncate">{e.description}</div>
            {e.vendor && <div className="truncate text-xs text-muted-foreground">{e.vendor}</div>}
          </div>
        ),
      },
      {
        id: "vehicle",
        header: "Vehicle",
        accessorFn: (e) => (e.vehicleId ? idx.vehicles.get(e.vehicleId)?.model ?? "" : ""),
        cell: ({ row: { original: e } }) => {
          const v = e.vehicleId ? idx.vehicles.get(e.vehicleId) : undefined;
          return v ? (
            <Link href={`/inventory/${v.id}`} className="hover:underline">
              {vehicleTitle(v)} <span className="font-mono text-[11px] text-muted-foreground">{v.registrationNumber}</span>
            </Link>
          ) : (
            <span className="text-muted-foreground">General</span>
          );
        },
      },
      { id: "amount", header: "Amount", accessorFn: (e) => e.amountPaise, cell: ({ row: { original: e } }) => <span className="font-medium">{formatINR(e.amountPaise)}</span>, meta: { align: "right" } },
      { id: "by", header: "Recorded by", accessorFn: (e) => idx.users.get(e.createdBy)?.name ?? "" },
      {
        id: "actions",
        enableSorting: false,
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row: { original: e } }) =>
          canManage ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${e.reference}`}><MoreHorizontal /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onSelect={() => openExpense({ expenseId: e.id })}><Pencil /> Edit</DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onSelect={() => setToDelete(e)}><Trash2 /> Delete</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null,
      },
    ],
    [idx, canManage, openExpense],
  );

  function exportCsv() {
    downloadCsv(`expenses-${todayISO()}.csv`, rows, [
      { header: "Date", value: (e) => e.date },
      { header: "Reference", value: (e) => e.reference },
      { header: "Category", value: (e) => EXPENSE_CATEGORY_LABELS[e.category] },
      { header: "Type", value: (e) => (e.vehicleId ? "Vehicle" : "General") },
      { header: "Description", value: (e) => e.description },
      { header: "Vendor", value: (e) => e.vendor },
      { header: "Vehicle", value: (e) => { const v = e.vehicleId ? idx.vehicles.get(e.vehicleId) : undefined; return v ? `${vehicleTitle(v)} (${v.registrationNumber})` : ""; } },
      { header: "Payment Method", value: (e) => PAYMENT_METHOD_LABELS[e.paymentMethod] },
      { header: "Amount (INR)", value: (e) => csvRupees(e.amountPaise) },
      { header: "Recorded By", value: (e) => idx.users.get(e.createdBy)?.name },
    ]);
    toast.success(`Exported ${rows.length} expenses`);
  }

  return (
    <>
      <PageHeader
        title="Expenses"
        description="Vehicle reconditioning costs and general showroom expenses."
        actions={
          <>
            <DateRangePicker value={range} onChange={setRange} />
            {can("data.export") && <Button variant="outline" onClick={exportCsv} disabled={rows.length === 0}><Download /> Export</Button>}
            {canManage && <Button onClick={() => openExpense()}><Plus /> Add expense</Button>}
          </>
        }
      />
      <div className="grid gap-3 sm:grid-cols-3 lg:gap-4">
        <StatCard label="Total expenses" value={formatINRCompact(totalAll)} icon={Wallet} tone="brand" hint={`${inPeriod.length} entries · ${formatINR(totalAll)}`} />
        <StatCard label="Vehicle-related" value={formatINRCompact(totalVehicle)} icon={Wallet} hint="Added to vehicle landed cost" />
        <StatCard label="General operating" value={formatINRCompact(totalGeneral)} icon={Wallet} tone="danger" hint="Not deducted from per-car profit" />
      </div>
      <ChartCard title="Expenses by category" description="Selected period" action={<ExpenseLegend />} className="mt-4">
        <ExpenseBreakdownChart data={expenseBreakdown(inPeriod)} height={300} />
      </ChartCard>
      <Card className="mt-4">
        <div className="flex flex-col gap-3 border-b p-3 sm:p-4 lg:flex-row lg:items-center">
          <SearchInput value={search} onChange={setSearch} placeholder="Search description, vendor, vehicle…" className="lg:w-80" />
          <div className="flex flex-wrap gap-2">
            <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
              <SelectTrigger className="h-9 w-[150px]" aria-label="Expense type"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="vehicle">Vehicle-related</SelectItem>
                <SelectItem value="general">General</SelectItem>
              </SelectContent>
            </Select>
            <Select value={category} onValueChange={(v) => setCategory(v as typeof category)}>
              <SelectTrigger className="h-9 w-[200px]" aria-label="Category"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {EXPENSE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{EXPENSE_CATEGORY_LABELS[c]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        {ds.expenses.length === 0 ? (
          <EmptyState icon={Wallet} title="No expenses recorded" description="Track repairs, detailing, rent, salaries and more." action={canManage && <Button onClick={() => openExpense()}><Plus /> Add expense</Button>} />
        ) : (
          <DataTable
            data={rows}
            columns={columns}
            getRowId={(e) => e.id}
            resetPageKey={`${search}|${type}|${category}|${range.from}|${range.to}`}
            empty={<EmptyState icon={SearchX} title="No expenses in this view" description="Try a wider date range or different filters." />}
            renderMobileCard={(e) => {
              const v = e.vehicleId ? idx.vehicles.get(e.vehicleId) : undefined;
              return (
                <div className="flex items-start gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{e.description}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {EXPENSE_CATEGORY_LABELS[e.category]} · {formatDate(e.date)}{v ? ` · ${vehicleTitle(v)}` : ""}
                    </div>
                  </div>
                  <div className="text-sm font-semibold tabular">{formatINR(e.amountPaise)}</div>
                  {canManage && (
                    <Button variant="ghost" size="icon-sm" aria-label="Edit expense" onClick={() => openExpense({ expenseId: e.id })}><Pencil /></Button>
                  )}
                </div>
              );
            }}
          />
        )}
      </Card>
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Delete this expense?"
        description={
          toDelete && (
            <>
              <strong>{toDelete.description}</strong> ({formatINR(toDelete.amountPaise)}) will be removed.
              {toDelete.vehicleId && " The vehicle's landed cost and profit will be recalculated."} The deletion is recorded in the activity log.
            </>
          )
        }
        confirmLabel="Delete expense"
        tone="destructive"
        onConfirm={async () => {
          if (!toDelete) return;
          try {
            await dealerService.deleteExpense(user, toDelete.id);
            toast.success("Expense deleted");
          } catch (e) {
            reportError(e);
            return false;
          }
        }}
      />
    </>
  );
}
