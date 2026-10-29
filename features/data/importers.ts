import { isBlank, type Cell } from "@/lib/utils/spreadsheet";
import {
  EXPENSE_CATEGORIES,
  FUEL_TYPES,
  PAYMENT_METHODS,
  TRANSMISSIONS,
  type ExpenseCategory,
  type FuelType,
  type PaymentMethod,
  type Transmission,
  type Vehicle,
} from "@/types";
import { expenseSchema, purchaseFormSchema, type ExpenseInput, type PurchaseFormInput } from "@/lib/validation/schemas";
import { EXPENSE_CATEGORY_LABELS, FUEL_LABELS, PAYMENT_METHOD_LABELS, TRANSMISSION_LABELS } from "@/lib/utils/labels";
import { normalizeChassis, normalizeRegistration } from "@/lib/utils/ids";

/**
 * Spreadsheet import: columns are matched by header name (any order, common synonyms accepted),
 * values are coerced (₹4,50,000 · 4.5 lakh · 15/03/2026 · Excel dates · "Petrol"), and each row is
 * validated with the same rules as the on-screen forms before anything is saved.
 */

export const IMPORT_KINDS = ["stock", "expenses"] as const;
export type ImportKind = (typeof IMPORT_KINDS)[number];

type Coerced = { value: unknown } | { error: string };

interface FieldSpec {
  key: string;
  header: string;
  aliases?: string[];
  required?: boolean;
  example: Cell;
  hint?: string;
  coerce: (c: Cell) => Coerced;
}

export interface ImportRow<T> {
  /** 1-based row number in the file, as people see it in Excel. */
  line: number;
  input?: T;
  error?: string;
  /** Short description for the preview list. */
  label: string;
}

export interface ImportPlan<T> {
  kind: ImportKind;
  rows: ImportRow<T>[];
  ready: ImportRow<T>[];
  problems: ImportRow<T>[];
  /** Headers that were not recognised and will be ignored. */
  ignored: string[];
}

export class ImportFileError extends Error {}

// ─── Value coercion ───────────────────────────────────────────────────────────

const norm = (s: string) => s.toLowerCase().replace(/\(.*?\)|₹|\binr\b|\brs\b/g, "").replace(/[^a-z0-9]/g, "");

const ok = (value: unknown): Coerced => ({ value });
const fail = (error: string): Coerced => ({ error });

const text = (c: Cell): Coerced => ok(c === null ? "" : typeof c === "number" ? String(c) : String(c).trim());

function toNumber(c: Cell): number | null {
  if (typeof c === "number") return c;
  if (c === null || typeof c === "boolean") return null;
  const s = c.toLowerCase().replace(/,/g, "").trim();
  if (!s) return null;
  const m = s.match(/-?\d+(\.\d+)?/);
  if (!m) return NaN;
  let n = Number(m[0]);
  if (/\b(l|lakh|lakhs|lac|lacs)\b/.test(s)) n *= 1_00_000;
  else if (/\b(cr|crore|crores)\b/.test(s)) n *= 1_00_00_000;
  else if (/\d\s*k\b/.test(s)) n *= 1_000;
  return n;
}

const integer = (label: string, fallback?: number) => (c: Cell): Coerced => {
  const n = toNumber(c);
  if (n === null) return fallback !== undefined ? ok(fallback) : ok(undefined);
  return Number.isFinite(n) ? ok(Math.round(n)) : fail(`${label} should be a number`);
};

const money = (label: string, fallback?: number) => (c: Cell): Coerced => {
  const n = toNumber(c);
  if (n === null) return ok(fallback);
  return Number.isFinite(n) ? ok(Math.round(n * 100)) : fail(`${label} should be an amount, e.g. 450000`);
};

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const pad = (n: number) => String(n).padStart(2, "0");

/** Indian day-first dates, ISO dates, "5 Mar 2026" and Excel serial numbers → YYYY-MM-DD. */
export function parseDateCell(c: Cell): string | null | undefined {
  if (c === null || c === "") return undefined;
  if (typeof c === "number") {
    if (c < 1 || c > 2_958_465) return null;
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(c) * 86_400_000);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  if (typeof c === "boolean") return null;
  const s = c.trim();
  const year = (y: string) => (y.length === 2 ? 2000 + Number(y) : Number(y));
  const build = (y: number, m: number, d: number) => {
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? `${y}-${pad(m)}-${pad(d)}` : null;
  };
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T].*)?$/);
  if (m) return build(Number(m[1]), Number(m[2]), Number(m[3]));
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/);
  if (m) return build(year(m[3]), Number(m[2]), Number(m[1]));
  m = s.match(/^(\d{1,2})[-\s/.]*([a-z]{3})[a-z]*[-\s/.,]*(\d{2}|\d{4})$/i);
  if (m && MONTHS.includes(m[2].toLowerCase())) return build(year(m[3]), MONTHS.indexOf(m[2].toLowerCase()) + 1, Number(m[1]));
  return null;
}

const date = (label: string) => (c: Cell): Coerced => {
  const d = parseDateCell(c);
  if (d === undefined) return ok(undefined);
  return d ? ok(d) : fail(`${label} should be a date, e.g. 15/03/2026`);
};

function choice<T extends string>(label: string, keys: readonly T[], labels: Record<T, string>, synonyms: Record<string, T>, fallback?: T) {
  const lookup = new Map<string, T>();
  for (const k of keys) {
    lookup.set(norm(k), k);
    lookup.set(norm(labels[k]), k);
  }
  for (const [s, k] of Object.entries(synonyms)) lookup.set(norm(s), k);
  return (c: Cell): Coerced => {
    if (isBlank(c)) return ok(fallback);
    const hit = lookup.get(norm(String(c)));
    return hit ? ok(hit) : fail(`${label} "${c}" isn't recognised. Use one of: ${keys.map((k) => labels[k]).join(", ")}`);
  };
}

const fuel = choice<FuelType>("Fuel", FUEL_TYPES, FUEL_LABELS, { ev: "electric", gas: "cng", "petrol cng": "cng", "petrol + cng": "cng" });
const transmission = choice<Transmission>("Transmission", TRANSMISSIONS, TRANSMISSION_LABELS, { mt: "manual", at: "automatic", auto: "automatic", tc: "automatic" });
const paymentMethod = (fallback: PaymentMethod) =>
  choice<PaymentMethod>("Payment method", PAYMENT_METHODS, PAYMENT_METHOD_LABELS, {
    neft: "bank_transfer", rtgs: "bank_transfer", imps: "bank_transfer", bank: "bank_transfer", transfer: "bank_transfer",
    gpay: "upi", phonepe: "upi", paytm: "upi", check: "cheque", "credit card": "card", "debit card": "card", loan: "finance",
  }, fallback);
const category = choice<ExpenseCategory>("Category", EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS, {
  repairs: "repair", service: "mechanical", paint: "painting", polish: "detailing", cleaning: "detailing", transport: "transportation",
  towing: "transportation", rto: "documentation", insurance: "documentation", papers: "documentation", electricity: "utilities",
  water: "utilities", salaries: "salary", wages: "salary", ads: "marketing", advertising: "marketing", stationery: "office",
  misc: "general_misc", other: "general_misc",
});

// ─── Field definitions ────────────────────────────────────────────────────────

const STOCK_FIELDS: FieldSpec[] = [
  { key: "make", header: "Make", aliases: ["brand", "manufacturer", "company"], required: true, example: "Maruti Suzuki", coerce: text },
  { key: "model", header: "Model", required: true, example: "Swift", coerce: text },
  { key: "variant", header: "Variant", aliases: ["trim", "version"], example: "VXi", coerce: text },
  { key: "year", header: "Year", aliases: ["model year", "mfg year", "manufacturing year", "year of manufacture"], required: true, example: 2019, coerce: integer("Year") },
  { key: "registrationNumber", header: "Registration", aliases: ["registration number", "registration no", "reg no", "reg number", "reg", "vehicle number", "vehicle no", "number plate", "plate"], required: true, example: "KL 07 CD 4521", coerce: text },
  { key: "chassisNumber", header: "Chassis No", aliases: ["chassis", "chassis number", "vin"], example: "MA3EWDE1S00123456", coerce: text },
  { key: "engineNumber", header: "Engine No", aliases: ["engine", "engine number"], example: "K12MN1234567", coerce: text },
  { key: "fuelType", header: "Fuel", aliases: ["fuel type"], required: true, example: "Petrol", hint: "Petrol, Diesel, CNG, Electric or Hybrid", coerce: fuel },
  { key: "transmission", header: "Transmission", aliases: ["gearbox", "gear"], required: true, example: "Manual", hint: "Manual, Automatic, AMT, CVT or DCT", coerce: transmission },
  { key: "mileageKm", header: "Kilometers", aliases: ["km", "kms", "kilometres", "km driven", "kms driven", "odometer", "mileage"], required: true, example: 42000, coerce: integer("Kilometers") },
  { key: "color", header: "Colour", aliases: ["color"], required: true, example: "White", coerce: text },
  { key: "previousOwners", header: "Owners", aliases: ["owner", "no of owners", "previous owners", "ownership"], example: 1, coerce: integer("Owners", 1) },
  { key: "askingPricePaise", header: "Asking Price", aliases: ["selling price", "price", "listing price", "sale price"], required: true, example: 525000, coerce: money("Asking price") },
  { key: "purchaseDate", header: "Purchase Date", aliases: ["bought on", "date purchased", "date"], required: true, example: "15/03/2026", hint: "DD/MM/YYYY", coerce: date("Purchase date") },
  { key: "purchasePricePaise", header: "Purchase Price", aliases: ["cost", "cost price", "bought for", "buying price"], required: true, example: 450000, coerce: money("Purchase price") },
  { key: "amountPaidPaise", header: "Amount Paid", aliases: ["paid", "paid to seller"], example: 450000, hint: "Leave blank if paid in full", coerce: money("Amount paid") },
  { key: "paymentMethod", header: "Payment Method", aliases: ["payment mode", "paid by", "mode"], example: "Bank transfer", coerce: paymentMethod("bank_transfer") },
  { key: "paymentReference", header: "Payment Reference", aliases: ["utr", "reference", "transaction id"], example: "", coerce: text },
  { key: "sellerName", header: "Seller Name", aliases: ["seller", "bought from", "previous owner"], required: true, example: "Anand Pillai", coerce: text },
  { key: "sellerContact", header: "Seller Phone", aliases: ["seller contact", "seller mobile", "seller number", "phone", "mobile"], required: true, example: "9847012345", coerce: text },
  { key: "sellerAddress", header: "Seller Address", aliases: ["seller city"], example: "Kochi", coerce: text },
  { key: "notes", header: "Notes", aliases: ["remarks", "comments", "description"], example: "", coerce: text },
];

const EXPENSE_FIELDS: FieldSpec[] = [
  { key: "date", header: "Date", aliases: ["expense date", "paid on", "bill date"], required: true, example: "05/10/2026", hint: "DD/MM/YYYY", coerce: date("Date") },
  { key: "category", header: "Category", aliases: ["type", "head", "expense type"], required: true, example: "Repair", hint: "e.g. Repair, Painting, Rent, Salary", coerce: category },
  { key: "description", header: "Description", aliases: ["details", "item", "particulars", "narration"], required: true, example: "Front bumper repair", coerce: text },
  { key: "amountPaise", header: "Amount", aliases: ["amount paid", "cost", "total"], required: true, example: 8500, coerce: money("Amount") },
  { key: "vendor", header: "Vendor", aliases: ["paid to", "supplier", "shop", "workshop"], example: "City Auto Works", coerce: text },
  { key: "paymentMethod", header: "Payment Method", aliases: ["payment mode", "paid by", "mode"], example: "UPI", coerce: paymentMethod("cash") },
  { key: "registration", header: "Vehicle Registration", aliases: ["vehicle", "registration", "reg no", "vehicle number", "car"], example: "KL 07 CD 4521", hint: "Required for vehicle categories", coerce: text },
  { key: "notes", header: "Notes", aliases: ["remarks", "comments"], example: "", coerce: text },
];

export const IMPORT_FIELDS: Record<ImportKind, FieldSpec[]> = { stock: STOCK_FIELDS, expenses: EXPENSE_FIELDS };

export const IMPORT_LIMIT = 2000;

// ─── Planning ─────────────────────────────────────────────────────────────────

function mapHeaders(header: Cell[], fields: FieldSpec[]) {
  const byName = new Map<string, FieldSpec>();
  for (const f of fields) for (const n of [f.header, f.key, ...(f.aliases ?? [])]) if (!byName.has(norm(n))) byName.set(norm(n), f);
  const columns = new Map<string, number>();
  const ignored: string[] = [];
  header.forEach((h, i) => {
    if (isBlank(h)) return;
    const f = byName.get(norm(String(h)));
    if (f && !columns.has(f.key)) columns.set(f.key, i);
    else ignored.push(String(h));
  });
  const missing = fields.filter((f) => f.required && !columns.has(f.key)).map((f) => f.header);
  return { columns, ignored, missing };
}

function readRow(row: Cell[], fields: FieldSpec[], columns: Map<string, number>) {
  const values: Record<string, unknown> = {};
  for (const f of fields) {
    const i = columns.get(f.key);
    const result = f.coerce(i === undefined ? null : (row[i] ?? null));
    if ("error" in result) return { error: result.error };
    values[f.key] = result.value;
  }
  return { values };
}

function firstIssue(error: { issues: { message: string; path: PropertyKey[] }[] }, fields: FieldSpec[]) {
  const issue = error.issues[0];
  const field = fields.find((f) => f.key === issue?.path[0]);
  // "Purchase price is required" already names the field; otherwise prefix it.
  const msg = issue?.message ?? "Invalid row";
  return field && !msg.toLowerCase().includes(field.header.toLowerCase().split(" ")[0]) ? `${field.header}: ${msg}` : msg;
}

export interface ImportContext {
  vehicles: readonly Vehicle[];
}

/** Turns sheet rows into validated inputs. The first non-empty row is the header. */
export function planImport(kind: ImportKind, sheet: Cell[][], ctx: ImportContext): ImportPlan<PurchaseFormInput | ExpenseInput> {
  const start = sheet.findIndex((r) => r.some((c) => !isBlank(c)));
  if (start < 0) throw new ImportFileError("This file is empty.");
  const fields = IMPORT_FIELDS[kind];
  const { columns, ignored, missing } = mapHeaders(sheet[start], fields);
  if (columns.size === 0)
    throw new ImportFileError(`No matching columns were found. The first row should have headings like ${fields.slice(0, 4).map((f) => f.header).join(", ")}.`);
  if (missing.length) throw new ImportFileError(`Missing column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}. Download the template to see the expected headings.`);

  const body = sheet.slice(start + 1).map((cells, i) => ({ cells, line: start + i + 2 })).filter((r) => r.cells.some((c) => !isBlank(c)));
  if (body.length > IMPORT_LIMIT) throw new ImportFileError(`This file has ${body.length} rows. Import up to ${IMPORT_LIMIT} at a time.`);

  const active = ctx.vehicles.filter((v) => !v.archivedAt);
  const regs = new Map(active.map((v) => [normalizeRegistration(v.registrationNumber), v]));
  const chassis = new Map(active.filter((v) => v.chassisNumber).map((v) => [normalizeChassis(v.chassisNumber), v]));
  const seenRegs = new Map<string, number>();
  const seenChassis = new Map<string, number>();

  const rows = body.map(({ cells, line }): ImportRow<PurchaseFormInput | ExpenseInput> => {
    const read = readRow(cells, fields, columns);
    const label = (v: Record<string, unknown>) =>
      kind === "stock" ? [v.year, v.make, v.model, v.registrationNumber].filter(Boolean).join(" ") : [v.date, v.description].filter(Boolean).join(" · ");
    if ("error" in read) return { line, error: read.error, label: cells.filter((c) => !isBlank(c)).slice(0, 3).join(" ") };
    const v = read.values;

    if (kind === "stock") {
      const parsed = purchaseFormSchema.safeParse({
        ...v,
        amountPaidPaise: v.amountPaidPaise ?? v.purchasePricePaise,
        sellerNotes: "",
        purchaseNotes: "",
      });
      if (!parsed.success) return { line, error: firstIssue(parsed.error, fields), label: label(v) };
      const input = parsed.data;
      const reg = normalizeRegistration(input.registrationNumber);
      const ch = input.chassisNumber ? normalizeChassis(input.chassisNumber) : "";
      const existing = regs.get(reg) ?? (ch ? chassis.get(ch) : undefined);
      if (existing) return { line, error: `Already in stock as ${existing.stockNumber} (${existing.registrationNumber})`, label: label(v) };
      if (seenRegs.has(reg)) return { line, error: `Same registration as row ${seenRegs.get(reg)}`, label: label(v) };
      if (ch && seenChassis.has(ch)) return { line, error: `Same chassis number as row ${seenChassis.get(ch)}`, label: label(v) };
      seenRegs.set(reg, line);
      if (ch) seenChassis.set(ch, line);
      return { line, input, label: label(v) };
    }

    const reg = String(v.registration ?? "");
    const vehicle = reg ? active.find((x) => normalizeRegistration(x.registrationNumber) === normalizeRegistration(reg)) : undefined;
    if (reg && !vehicle) return { line, error: `No car with registration ${reg} in stock`, label: label(v) };
    const parsed = expenseSchema.safeParse({ ...v, vehicleId: vehicle?.id ?? null });
    if (!parsed.success) return { line, error: firstIssue(parsed.error, fields), label: label(v) };
    return { line, input: parsed.data, label: label(v) };
  });

  return { kind, rows, ready: rows.filter((r) => r.input), problems: rows.filter((r) => r.error), ignored };
}

/** Header row and one example row, for the downloadable template. */
export function templateRows(kind: ImportKind): { headers: string[]; example: Cell[]; hints: string[] } {
  const fields = IMPORT_FIELDS[kind];
  return {
    headers: fields.map((f) => f.header),
    example: fields.map((f) => f.example),
    hints: fields.map((f) => [f.required ? "Required" : "Optional", f.hint].filter(Boolean).join(". ")),
  };
}
