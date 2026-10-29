"use client";
import * as React from "react";
import Link from "next/link";
import { CircleAlert, Download, FileSpreadsheet, Upload } from "lucide-react";
import { toast } from "sonner";
import { useData } from "@/components/providers/data-provider";
import { useAuth, useCurrentUser } from "@/hooks/use-auth";
import { dealerService } from "@/lib/services/dealer-service";
import { BusinessError } from "@/lib/repositories/contracts";
import { downloadFile } from "@/lib/utils/csv";
import { todayISO } from "@/lib/utils/dates";
import { readSpreadsheet, SPREADSHEET_ACCEPT, SpreadsheetError, writeXlsx, XLSX_MIME, type SheetData } from "@/lib/utils/spreadsheet";
import type { ExpenseInput, PurchaseFormInput } from "@/lib/validation/schemas";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { EXPORT_DATASETS, sheetToCsv, type ExportContext } from "./datasets";
import { IMPORT_FIELDS, ImportFileError, planImport, templateRows, type ImportKind, type ImportPlan } from "./importers";

const IMPORTS: Record<ImportKind, { title: string; description: string; noun: string; done: { href: string; label: string } }> = {
  stock: {
    title: "Cars and purchases",
    description: "One row per car: specs, asking price, what you paid and who you bought it from. Each row adds the car to stock.",
    noun: "car",
    done: { href: "/inventory", label: "View inventory" },
  },
  expenses: {
    title: "Expenses",
    description: "One row per expense. Add a registration number to link a repair or detailing cost to a car.",
    noun: "expense",
    done: { href: "/expenses", label: "View expenses" },
  },
};

const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;
const CSV_MIME = "text/csv;charset=utf-8";

export function DataPage() {
  const { can } = useAuth();
  const kinds = (["stock", "expenses"] as const).filter((k) => can(k === "stock" ? "purchases.manage" : "expenses.manage"));
  return (
    <>
      <PageHeader title="Import & export" description="Bring cars and expenses in from Excel or CSV, and download any list as a spreadsheet." />
      <div className="flex flex-col gap-4">
        <ExportCard />
        {kinds.map((k) => <ImportCard key={k} kind={k} />)}
      </div>
    </>
  );
}

function ExportCard() {
  const { ds, idx } = useData();
  const { can } = useAuth();
  const user = useCurrentUser();
  const ctx: ExportContext = { ds, idx, user, can };
  const datasets = EXPORT_DATASETS.filter((d) => d.available(ctx));

  function download(sheets: SheetData[], name: string, format: "csv" | "xlsx") {
    if (format === "csv") downloadFile(`${name}-${todayISO()}.csv`, "﻿" + sheetToCsv(sheets[0]), CSV_MIME);
    else downloadFile(`${name}-${todayISO()}.xlsx`, writeXlsx(sheets) as BlobPart, XLSX_MIME);
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">Export</h2>
          <p className="text-[13px] text-muted-foreground">CSV opens anywhere. Excel keeps amounts as numbers you can add up.</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            download(datasets.map((d) => d.build(ctx)), "dealeros-all-data", "xlsx");
            toast.success(`Downloaded ${datasets.length} sheets in one workbook`);
          }}
        >
          <Download /> Everything (Excel)
        </Button>
      </div>
      <ul className="divide-y">
        {datasets.map((d) => {
          const data = d.build(ctx);
          const file = d.label.toLowerCase().replace(/\s+/g, "-");
          return (
            <li key={d.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">
                  {d.label} <span className="font-normal text-muted-foreground tabular">{data.rows.length}</span>
                </div>
                <div className="truncate text-xs text-muted-foreground">{d.description}</div>
              </div>
              <Button variant="ghost" size="sm" disabled={!data.rows.length} onClick={() => download([data], file, "csv")}>CSV</Button>
              <Button variant="outline" size="sm" disabled={!data.rows.length} onClick={() => download([data], file, "xlsx")}>Excel</Button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

type ImportState =
  | { step: "idle" }
  | { step: "error"; file: string; message: string }
  | { step: "review"; file: string; plan: ImportPlan<PurchaseFormInput | ExpenseInput> }
  | { step: "importing"; file: string; plan: ImportPlan<PurchaseFormInput | ExpenseInput>; done: number }
  | { step: "finished"; imported: number; failed: { line: number; label: string; error: string }[] };

function ImportCard({ kind }: { kind: ImportKind }) {
  const { ds } = useData();
  const user = useCurrentUser();
  const meta = IMPORTS[kind];
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [state, setState] = React.useState<ImportState>({ step: "idle" });

  function downloadTemplate(format: "csv" | "xlsx") {
    const t = templateRows(kind);
    const name = `${kind === "stock" ? "cars" : "expenses"}-import-template`;
    if (format === "csv") {
      const row = (cells: unknown[]) => cells.map((c) => (c === null || c === undefined ? "" : /[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : String(c))).join(",");
      downloadFile(`${name}.csv`, "﻿" + [row(t.headers), row(t.example)].join("\r\n"), CSV_MIME);
      return;
    }
    const sheets: SheetData[] = [
      { name: meta.title, columns: t.headers.map((h) => ({ header: h, width: Math.max(12, h.length + 4) })), rows: [t.example] },
      {
        name: "How to fill",
        columns: [{ header: "Column", width: 22 }, { header: "What to enter", width: 60 }],
        rows: IMPORT_FIELDS[kind].map((f, i) => [f.header, t.hints[i]]),
      },
    ];
    downloadFile(`${name}.xlsx`, writeXlsx(sheets) as BlobPart, XLSX_MIME);
  }

  async function onFile(file: File) {
    try {
      const sheet = await readSpreadsheet(file);
      const plan = planImport(kind, sheet, { vehicles: ds.vehicles });
      setState({ step: "review", file: file.name, plan });
    } catch (e) {
      if (e instanceof SpreadsheetError || e instanceof ImportFileError) setState({ step: "error", file: file.name, message: e.message });
      else {
        console.error(e);
        setState({ step: "error", file: file.name, message: "This file could not be read. Save it as .xlsx or CSV and try again." });
      }
    }
  }

  async function runImport() {
    if (state.step !== "review") return;
    const { plan, file } = state;
    const failed: { line: number; label: string; error: string }[] = [];
    let imported = 0;
    for (const [i, row] of plan.ready.entries()) {
      setState({ step: "importing", file, plan, done: i });
      try {
        if (kind === "stock") await dealerService.createPurchase(user, row.input as PurchaseFormInput, []);
        else await dealerService.createExpense(user, row.input as ExpenseInput);
        imported++;
      } catch (e) {
        failed.push({ line: row.line, label: row.label, error: e instanceof BusinessError ? e.message : "Could not be saved" });
        if (!(e instanceof BusinessError)) console.error(e);
      }
    }
    setState({ step: "finished", imported, failed });
    if (imported) toast.success(`Imported ${plural(imported, meta.noun)}`);
  }

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
        <div className="min-w-0 flex-1 basis-72">
          <h2 className="text-sm font-semibold">Import {meta.title.toLowerCase()}</h2>
          <p className="text-[13px] text-muted-foreground">{meta.description}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Template:{" "}
            <button type="button" className="font-medium text-foreground underline-offset-2 hover:underline" onClick={() => downloadTemplate("xlsx")}>Excel</button>
            {" · "}
            <button type="button" className="font-medium text-foreground underline-offset-2 hover:underline" onClick={() => downloadTemplate("csv")}>CSV</button>
            . Excel (.xlsx, .xls) and CSV files work; columns can be in any order.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={state.step === "importing"}>
          <Upload /> Choose file
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept={SPREADSHEET_ACCEPT}
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void onFile(f);
          }}
        />
      </div>

      {state.step === "error" && (
        <div className="flex items-start gap-2 border-t px-4 py-3 text-[13px]">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div>
            <span className="font-medium">{state.file}</span>: {state.message}
          </div>
        </div>
      )}

      {(state.step === "review" || state.step === "importing") && (
        <div className="border-t">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-[13px]">
            <FileSpreadsheet className="size-4 text-muted-foreground" />
            <span className="font-medium">{state.file}</span>
            <span className="text-muted-foreground">
              {plural(state.plan.ready.length, meta.noun)} ready
              {state.plan.problems.length > 0 && <>, <span className="text-destructive">{plural(state.plan.problems.length, "row")} with problems</span></>}
            </span>
          </div>
          {state.plan.ignored.length > 0 && (
            <p className="px-4 pb-2 text-xs text-muted-foreground">Ignored columns: {state.plan.ignored.join(", ")}</p>
          )}
          {state.plan.problems.length > 0 && (
            <div className="px-4 pb-3">
              <p className="mb-1 text-xs font-medium">These rows will be skipped. Fix them in the file and choose it again to include them.</p>
              <ul className="max-h-56 overflow-y-auto rounded-md border text-xs">
                {state.plan.problems.map((r) => (
                  <li key={r.line} className="flex gap-3 border-b px-3 py-1.5 last:border-b-0">
                    <span className="w-14 shrink-0 text-muted-foreground tabular">Row {r.line}</span>
                    <span className="min-w-0 flex-1">
                      {r.label && <span className="text-muted-foreground">{r.label}: </span>}
                      {r.error}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {state.plan.ready.length > 0 && (
            <div className="px-4 pb-3">
              <p className="mb-1 text-xs font-medium">Ready to import</p>
              <ul className="text-xs text-muted-foreground">
                {state.plan.ready.slice(0, 5).map((r) => <li key={r.line} className="truncate">Row {r.line}: {r.label}</li>)}
                {state.plan.ready.length > 5 && <li>and {state.plan.ready.length - 5} more</li>}
              </ul>
            </div>
          )}
          <div className="flex justify-end gap-2 border-t bg-muted/40 px-4 py-2.5">
            <Button variant="ghost" size="sm" onClick={() => setState({ step: "idle" })} disabled={state.step === "importing"}>Cancel</Button>
            <Button size="sm" onClick={runImport} disabled={!state.plan.ready.length} loading={state.step === "importing"}>
              {state.step === "importing" ? `Importing ${state.done + 1} of ${state.plan.ready.length}` : `Import ${plural(state.plan.ready.length, meta.noun)}`}
            </Button>
          </div>
        </div>
      )}

      {state.step === "finished" && (
        <div className="border-t px-4 py-3 text-[13px]">
          <p>
            Imported {plural(state.imported, meta.noun)}.
            {state.imported > 0 && <> <Link href={meta.done.href} className="font-medium underline-offset-2 hover:underline">{meta.done.label}</Link></>}
          </p>
          {state.failed.length > 0 && (
            <ul className="mt-2 text-xs">
              {state.failed.map((f) => (
                <li key={f.line}><span className="text-muted-foreground">Row {f.line} {f.label}:</span> {f.error}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}
