"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { FileSpreadsheet, Printer } from "lucide-react";
import { toast } from "sonner";
import { useData } from "@/components/providers/data-provider";
import { useAuth } from "@/hooks/use-auth";
import { branchScope } from "@/lib/permissions";
import { describeRange, formatDDMMYYYY, resolvePreset, todayISO, type DateRange, type DateRangePreset } from "@/lib/utils/dates";
import { formatINR } from "@/lib/utils/money";
import { downloadFile } from "@/lib/utils/csv";
import { writeXlsx, XLSX_MIME, type Cell, type SheetColumn, type SheetData } from "@/lib/utils/spreadsheet";
import { cn } from "@/lib/utils/cn";
import type { ID } from "@/types";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DateRangePicker } from "@/components/shared/date-range-picker";
import { EmptyState } from "@/components/shared/empty-state";
import { BranchSelect } from "@/features/branches/branch-select";
import { SearchX } from "lucide-react";

/**
 * Shared pieces for every money report: a date range (with Today … This FY presets), a branch filter
 * ("All branches" for people who see every branch), totals rows, drill-down to the source entry, and
 * PDF (print) / Excel export with the range and branch in the header.
 */

export interface ReportFilters {
  range: DateRange;
  setRange: (r: DateRange) => void;
  branch: string;
  setBranch: (b: string) => void;
  /** Branches the report covers; null = every branch. */
  branchIds: ID[] | null;
  rangeLabel: string;
  branchLabel: string;
}

export function useReportFilters(preset: DateRangePreset = "this_month"): ReportFilters {
  const { ds } = useData();
  const { user } = useAuth();
  const scope = branchScope(user);
  const [range, setRange] = React.useState<DateRange>(() => resolvePreset(preset));
  const [branch, setBranch] = React.useState<string>(() => (scope ? scope[0] ?? "all" : "all"));
  const branchIds = branch === "all" ? scope : [branch];
  const rangeLabel = range.from || range.to ? `${range.from ? formatDDMMYYYY(range.from) : "Start"} to ${range.to ? formatDDMMYYYY(range.to) : "Today"}` : describeRange(range);
  const branchLabel = branch === "all" ? "All branches" : ds.branches.find((b) => b.id === branch)?.name ?? "—";
  return { range, setRange, branch, setBranch, branchIds, rangeLabel, branchLabel };
}

/** Records in the selected branches (records without a branch belong to every view). */
export function inBranches(branchId: ID | null | undefined, branchIds: readonly ID[] | null): boolean {
  return !branchIds || !branchId || branchIds.includes(branchId);
}

export function ReportFilterBar({ f, showRange = true, extra }: { f: ReportFilters; showRange?: boolean; extra?: React.ReactNode }) {
  const { ds } = useData();
  return (
    <div className="no-print flex flex-wrap items-center gap-2">
      {showRange && <DateRangePicker value={f.range} onChange={f.setRange} />}
      {ds.branches.length > 1 && <BranchSelect value={f.branch} onChange={f.setBranch} allowAll className="w-48" />}
      {extra}
    </div>
  );
}

export interface ReportColumn<T> {
  header: string;
  /** Screen cell. Defaults to the export value. */
  cell?: (row: T) => React.ReactNode;
  /** Export value (money as paise when `money`). */
  value: (row: T) => Cell;
  money?: boolean;
  align?: "right";
  /** Footer value: a paise total for money columns, or any text. */
  total?: number | string;
  className?: string;
  width?: number;
}

/** A report table: rows open their source entry; money columns are right-aligned with a totals footer. */
export function ReportTable<T>({
  columns,
  rows,
  href,
  empty = "Nothing in this period.",
  rowKey,
  totalLabel = "Total",
}: {
  columns: ReportColumn<T>[];
  rows: T[];
  href?: (row: T) => string | null | undefined;
  empty?: string;
  rowKey: (row: T, i: number) => string;
  totalLabel?: string;
}) {
  const router = useRouter();
  const hasTotals = columns.some((c) => c.total !== undefined);
  if (rows.length === 0) return <EmptyState icon={SearchX} title={empty} className="py-10" />;
  return (
    <div className="overflow-x-auto print:overflow-visible">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {columns.map((c) => (
              <TableHead key={c.header} className={cn((c.money || c.align === "right") && "text-right", c.className)}>{c.header}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, i) => {
            const target = href?.(r);
            return (
              <TableRow
                key={rowKey(r, i)}
                className={cn(target && "cursor-pointer")}
                onClick={target ? () => router.push(target) : undefined}
                tabIndex={target ? 0 : undefined}
                onKeyDown={target ? (e) => e.key === "Enter" && router.push(target) : undefined}
              >
                {columns.map((c) => {
                  const v = c.value(r);
                  return (
                    <TableCell key={c.header} className={cn((c.money || c.align === "right") && "text-right tabular", c.className)}>
                      {c.cell ? c.cell(r) : c.money ? (typeof v === "number" ? (v === 0 ? "—" : formatINR(v)) : "—") : (v ?? "—")}
                    </TableCell>
                  );
                })}
              </TableRow>
            );
          })}
        </TableBody>
        {hasTotals && (
          <TableFooter>
            <TableRow className="font-semibold hover:bg-transparent">
              {columns.map((c, i) => (
                <TableCell key={c.header} className={cn((c.money || c.align === "right") && "text-right tabular", c.className)}>
                  {i === 0 && c.total === undefined ? totalLabel : typeof c.total === "number" ? formatINR(c.total) : c.total ?? ""}
                </TableCell>
              ))}
            </TableRow>
          </TableFooter>
        )}
      </Table>
    </div>
  );
}

/** Report columns → an Excel sheet with totals. Money is written in rupees. */
export function toSheet<T>(name: string, columns: ReportColumn<T>[], rows: T[], header: string[]): SheetData {
  const cols: SheetColumn[] = columns.map((c) => ({ header: c.header, width: c.width ?? (c.money ? 14 : 18), format: c.money ? "money" : "text" }));
  const toCell = (c: ReportColumn<T>, v: Cell): Cell => (c.money && typeof v === "number" ? v / 100 : v);
  const body = rows.map((r) => columns.map((c) => toCell(c, c.value(r))));
  const totals = columns.some((c) => c.total !== undefined)
    ? [columns.map((c, i) => (typeof c.total === "number" ? c.total / 100 : c.total ?? (i === 0 ? "Total" : null)))]
    : [];
  // The report title, period and branch sit above the column headers.
  return { name, columns: cols, rows: [...body, ...totals], preamble: header };
}

/** PDF prints the page (its print header carries the period and branch); Excel builds the sheets. */
export function ExportButtons({ title, f, sheets }: { title: string; f?: Pick<ReportFilters, "rangeLabel" | "branchLabel">; sheets: () => SheetData[] }) {
  const { can } = useAuth();
  return (
    <div className="no-print flex gap-2">
      <Button variant="outline" size="sm" onClick={() => window.print()}><Printer /> PDF</Button>
      {can("data.export") && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            // The file name carries the period, e.g. "total-sales-report-01-10-2026-to-31-10-2026.xlsx".
            const file = `${fileSlug(`${title} ${f?.rangeLabel ?? todayISO()}`)}.xlsx`;
            downloadFile(file, writeXlsx(sheets()) as BlobPart, XLSX_MIME);
            toast.success(`${title} exported`);
          }}
        >
          <FileSpreadsheet /> Excel
        </Button>
      )}
    </div>
  );
}

/** "Total Sales Report 01-10-2026 to 31-10-2026" → "total-sales-report-01-10-2026-to-31-10-2026". */
export function fileSlug(text: string): string {
  return text.replace(/\W+/g, "-").replace(/^-|-$/g, "").toLowerCase();
}

/** Lines printed at the top of the PDF and Excel export. */
export function reportHeader(title: string, f: Pick<ReportFilters, "rangeLabel" | "branchLabel">, showroom: string): string[] {
  return [`${showroom} — ${title}`, `Period: ${f.rangeLabel}`, `Branch: ${f.branchLabel}`, `Generated ${formatDDMMYYYY(todayISO())}`];
}

/** Shown only on paper: showroom, report, period and branch. */
export function PrintHeader({ title, f }: { title: string; f: Pick<ReportFilters, "rangeLabel" | "branchLabel"> }) {
  const { ds } = useData();
  return (
    <div className="print-only mb-4 border-b pb-2">
      <div className="text-base font-semibold">{ds.settings.showroomName} — {title}</div>
      <div className="text-xs">Period: {f.rangeLabel} · Branch: {f.branchLabel} · Printed {formatDDMMYYYY(todayISO())}</div>
    </div>
  );
}

/** Small label/value tiles for report summaries. */
export function SummaryTiles({ items }: { items: { label: string; value: React.ReactNode; tone?: "pos" | "neg" }[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map((m) => (
        <div key={m.label} className="rounded-xl border bg-card px-4 py-3">
          <div className="text-xs text-muted-foreground">{m.label}</div>
          <div className={cn("mt-0.5 text-lg font-semibold tabular", m.tone === "pos" && "text-success", m.tone === "neg" && "text-destructive")}>{m.value}</div>
        </div>
      ))}
    </div>
  );
}
