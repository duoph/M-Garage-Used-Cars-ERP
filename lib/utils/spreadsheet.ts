import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

/**
 * Spreadsheet reading and writing without a heavy dependency.
 *
 * Reads: .xlsx / .xlsm (Office Open XML), .xls (Excel 97–2003 binary, and the HTML tables many
 * websites save with an .xls name), .csv / .tsv / .txt. Only the first worksheet is read.
 * Writes: .xlsx with a bold, frozen header row, column widths and number formats.
 */

export type Cell = string | number | boolean | null;

export class SpreadsheetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpreadsheetError";
  }
}

export const SPREADSHEET_ACCEPT = ".xlsx,.xlsm,.xls,.csv,.tsv,.txt";

/** Reads the first sheet of a file as rows of cells. Trailing empty rows are dropped. */
export async function readSpreadsheet(file: File): Promise<Cell[][]> {
  return readSpreadsheetBytes(new Uint8Array(await file.arrayBuffer()), file.name);
}

export function readSpreadsheetBytes(bytes: Uint8Array, name = ""): Cell[][] {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  let rows: Cell[][];
  // Sniff the content rather than trusting the extension: ".xls" downloads are often HTML or CSV.
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) rows = readXlsx(bytes);
  else if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) rows = readXls(bytes);
  else {
    if (["numbers", "ods", "pdf"].includes(ext))
      throw new SpreadsheetError("This file type isn't supported. Save it as Excel (.xlsx) or CSV and try again.");
    const text = decodeText(bytes);
    rows = /^\s*<(!doctype|html|table|\?xml)/i.test(text) ? readHtmlTable(text) : parseCsv(text);
  }
  while (rows.length && rows[rows.length - 1].every(isBlank)) rows.pop();
  return rows;
}

export function isBlank(c: Cell): boolean {
  return c === null || (typeof c === "string" && c.trim() === "");
}

function decodeText(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  // Files saved by older Excel versions are often Windows-1252; U+FFFD means UTF-8 didn't fit.
  return utf8.includes("�") ? new TextDecoder("windows-1252").decode(bytes) : utf8.replace(/^﻿/, "");
}

// ─── CSV ──────────────────────────────────────────────────────────────────────

/** RFC 4180 CSV with quoted fields; the delimiter (comma, semicolon or tab) is detected from the first line. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0].replace(/"[^"]*"/g, "");
  const counts = [",", ";", "\t"].map((d) => [d, firstLine.split(d).length - 1] as const);
  const delimiter = counts.reduce((best, c) => (c[1] > best[1] ? c : best), counts[0])[0];

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"' && field === "") quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// ─── HTML table (".xls" exports from web apps) ─────────────────────────────────

function readHtmlTable(html: string): Cell[][] {
  if (typeof DOMParser === "undefined") throw new SpreadsheetError("This file is a web page, not a spreadsheet.");
  const doc = new DOMParser().parseFromString(html, "text/html");
  const table = doc.querySelector("table");
  if (!table) throw new SpreadsheetError("No table was found in this file.");
  return Array.from(table.querySelectorAll("tr")).map((tr) =>
    Array.from(tr.querySelectorAll("th,td")).map((td) => (td.textContent ?? "").replace(/\s+/g, " ").trim()),
  );
}

// ─── XLSX reading ─────────────────────────────────────────────────────────────

const XML_ENTITIES: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };

function decodeXml(s: string): string {
  return s
    .replace(/&(#x[0-9a-f]+|#\d+|lt|gt|amp|quot|apos);/gi, (_, e: string) =>
      e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : XML_ENTITIES[e.toLowerCase()],
    )
    .replace(/_x([0-9a-f]{4})_/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16)));
}

function attr(tag: string, name: string): string | undefined {
  const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
  return m ? decodeXml(m[1]) : undefined;
}

/** Concatenated text of every <t> element, skipping phonetic hints. */
function richText(xml: string): string {
  const body = xml.replace(/<(?:\w+:)?rPh\b[\s\S]*?<\/(?:\w+:)?rPh>/g, "");
  let out = "";
  for (const m of body.matchAll(/<(?:\w+:)?t\b[^>]*?(?:\/>|>([\s\S]*?)<\/(?:\w+:)?t>)/g)) out += decodeXml(m[1] ?? "");
  return out;
}

function columnIndex(ref: string): number {
  let n = 0;
  for (const ch of ref.replace(/\d+$/, "")) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function readXlsx(bytes: Uint8Array): Cell[][] {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, { filter: (f) => f.name.startsWith("xl/") });
  } catch {
    throw new SpreadsheetError("This Excel file looks damaged and could not be opened.");
  }
  const text = (path: string) => (files[path] ? strFromU8(files[path]) : undefined);
  const workbook = text("xl/workbook.xml");
  if (!workbook) throw new SpreadsheetError("This file is not an Excel workbook.");

  // First sheet → its relationship target.
  let sheetPath = "xl/worksheets/sheet1.xml";
  const firstSheet = workbook.match(/<(?:\w+:)?sheet\b[^>]*>/)?.[0];
  const relId = firstSheet?.match(/\s[\w]+:id="([^"]+)"/)?.[1];
  const rels = text("xl/_rels/workbook.xml.rels");
  if (relId && rels) {
    for (const m of rels.matchAll(/<(?:\w+:)?Relationship\b[^>]*>/g)) {
      if (attr(m[0], "Id") !== relId) continue;
      const target = attr(m[0], "Target") ?? "";
      sheetPath = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
    }
  }
  const sheet = text(sheetPath);
  if (!sheet) throw new SpreadsheetError("The first sheet of this workbook could not be read.");

  const shared: string[] = [];
  const sst = text("xl/sharedStrings.xml");
  if (sst) for (const m of sst.matchAll(/<(?:\w+:)?si\b[^>]*>([\s\S]*?)<\/(?:\w+:)?si>/g)) shared.push(richText(m[1]));

  const rows: Cell[][] = [];
  let nextRow = 0;
  for (const rm of sheet.matchAll(/<(?:\w+:)?row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?row>)/g)) {
    const r = Number(attr(rm[1], "r") ?? nextRow + 1) - 1;
    nextRow = r + 1;
    const row: Cell[] = [];
    let nextCol = 0;
    for (const cm of (rm[2] ?? "").matchAll(/<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g)) {
      const ref = attr(cm[1], "r");
      const c = ref ? columnIndex(ref) : nextCol;
      nextCol = c + 1;
      const type = attr(cm[1], "t") ?? "n";
      const inner = cm[2] ?? "";
      const v = inner.match(/<(?:\w+:)?v\b[^>]*>([\s\S]*?)<\/(?:\w+:)?v>/)?.[1];
      let value: Cell = null;
      if (type === "s") value = v !== undefined ? (shared[Number(v)] ?? null) : null;
      else if (type === "inlineStr") value = richText(inner);
      else if (type === "str") value = v !== undefined ? decodeXml(v) : null;
      else if (type === "b") value = v === "1";
      else if (type === "e") value = null;
      else if (v !== undefined && v !== "") value = Number(v);
      row[c] = value;
    }
    rows[r] = Array.from(row, (x) => x ?? null);
  }
  return Array.from(rows, (x) => x ?? []);
}

// ─── XLS (Excel 97–2003, BIFF8 inside a compound file) ────────────────────────

const END_OF_CHAIN = 0xfffffffe;
const FREE_SECT = 0xffffffff;

/** Extracts one stream from an OLE2 compound file. */
function readCompoundStream(bytes: Uint8Array, names: string[]): Uint8Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u32 = (o: number) => view.getUint32(o, true);
  const sectorSize = 1 << view.getUint16(0x1e, true);
  const miniSectorSize = 1 << view.getUint16(0x20, true);
  const miniCutoff = u32(0x38);
  const sectorOffset = (sid: number) => (sid + 1) * sectorSize;
  const perSector = sectorSize / 4;

  // DIFAT: 109 entries in the header, then a chain of DIFAT sectors.
  const fatSectors: number[] = [];
  for (let i = 0; i < 109; i++) {
    const sid = u32(0x4c + i * 4);
    if (sid !== FREE_SECT && sid !== END_OF_CHAIN) fatSectors.push(sid);
  }
  let difat = u32(0x44);
  for (let guard = 0; difat !== END_OF_CHAIN && difat !== FREE_SECT && guard < 10_000; guard++) {
    const base = sectorOffset(difat);
    for (let i = 0; i < perSector - 1; i++) {
      const sid = u32(base + i * 4);
      if (sid !== FREE_SECT && sid !== END_OF_CHAIN) fatSectors.push(sid);
    }
    difat = u32(base + (perSector - 1) * 4);
  }
  const fat: number[] = [];
  for (const sid of fatSectors) {
    const base = sectorOffset(sid);
    if (base + sectorSize > bytes.length) break;
    for (let i = 0; i < perSector; i++) fat.push(u32(base + i * 4));
  }

  const chain = (start: number, table: number[]) => {
    const out: number[] = [];
    for (let sid = start; sid !== END_OF_CHAIN && sid < table.length && out.length <= table.length; sid = table[sid]) out.push(sid);
    return out;
  };
  const readChain = (start: number) => {
    const sids = chain(start, fat);
    const out = new Uint8Array(sids.length * sectorSize);
    sids.forEach((sid, i) => out.set(bytes.subarray(sectorOffset(sid), sectorOffset(sid) + sectorSize), i * sectorSize));
    return out;
  };

  const dir = readChain(u32(0x30));
  const dirView = new DataView(dir.buffer);
  const entries: { name: string; type: number; start: number; size: number }[] = [];
  for (let o = 0; o + 128 <= dir.length; o += 128) {
    const nameLen = dirView.getUint16(o + 0x40, true);
    const name = new TextDecoder("utf-16le").decode(dir.subarray(o, o + Math.max(0, nameLen - 2)));
    entries.push({ name, type: dir[o + 0x42], start: dirView.getUint32(o + 0x74, true), size: dirView.getUint32(o + 0x78, true) });
  }
  if (entries.some((e) => e.name === "EncryptedPackage"))
    throw new SpreadsheetError("This workbook is password-protected. Remove the password in Excel and try again.");
  const entry = entries.find((e) => e.type === 2 && names.includes(e.name.toLowerCase()));
  if (!entry) throw new SpreadsheetError("This .xls file has no workbook inside. Save it as .xlsx or CSV and try again.");

  if (entry.size >= miniCutoff) return readChain(entry.start).subarray(0, entry.size);

  // Small streams live in the mini stream, addressed through the mini FAT.
  const root = entries[0];
  const miniStream = readChain(root.start);
  const miniFatBytes = readChain(u32(0x3c));
  const miniFatView = new DataView(miniFatBytes.buffer);
  const miniFat = Array.from({ length: miniFatBytes.length / 4 }, (_, i) => miniFatView.getUint32(i * 4, true));
  const sids = chain(entry.start, miniFat);
  const out = new Uint8Array(sids.length * miniSectorSize);
  sids.forEach((sid, i) => out.set(miniStream.subarray(sid * miniSectorSize, (sid + 1) * miniSectorSize), i * miniSectorSize));
  return out.subarray(0, entry.size);
}

/** Reads across a record and its CONTINUE records, re-reading the character-width flag at each boundary. */
class BiffCursor {
  private seg = 0;
  private pos = 0;
  private readonly segments: Uint8Array[];
  constructor(segments: Uint8Array[]) {
    this.segments = segments;
  }
  private ensure() {
    while (this.seg < this.segments.length && this.pos >= this.segments[this.seg].length) {
      this.seg++;
      this.pos = 0;
    }
    if (this.seg >= this.segments.length) throw new SpreadsheetError("This .xls file is incomplete.");
  }
  get atSegmentStart() {
    return this.pos === 0;
  }
  get done() {
    return this.seg >= this.segments.length || (this.seg === this.segments.length - 1 && this.pos >= this.segments[this.seg].length);
  }
  u8(): number {
    this.ensure();
    return this.segments[this.seg][this.pos++];
  }
  u16(): number {
    return this.u8() | (this.u8() << 8);
  }
  u32(): number {
    return (this.u16() | (this.u16() << 16)) >>> 0;
  }
  skip(n: number) {
    for (let i = 0; i < n; i++) this.u8();
  }
  /** XLUnicodeRichExtendedString (SST entries) or a plain XLUnicodeString. */
  string(rich = true): string {
    const cch = this.u16();
    let flags = this.u8();
    const runs = rich && flags & 0x08 ? this.u16() : 0;
    const ext = rich && flags & 0x04 ? this.u32() : 0;
    let out = "";
    for (let i = 0; i < cch; i++) {
      if (i > 0 && this.seg < this.segments.length && this.pos >= this.segments[this.seg].length) {
        this.ensure();
        flags = this.u8();
      }
      out += String.fromCharCode(flags & 0x01 ? this.u16() : this.u8());
    }
    this.skip(runs * 4 + ext);
    return out;
  }
}

function decodeRk(rk: number): number {
  let v: number;
  if (rk & 0x02) v = (rk | 0) >> 2;
  else {
    const buf = new DataView(new ArrayBuffer(8));
    buf.setUint32(4, rk & 0xfffffffc, true);
    v = buf.getFloat64(0, true);
  }
  return rk & 0x01 ? v / 100 : v;
}

function readXls(bytes: Uint8Array): Cell[][] {
  const wb = readCompoundStream(bytes, ["workbook", "book"]);
  const view = new DataView(wb.buffer, wb.byteOffset, wb.byteLength);
  const record = (o: number) => ({ type: view.getUint16(o, true), len: view.getUint16(o + 2, true), data: o + 4 });

  if (record(0).type !== 0x0809 || view.getUint16(4, true) !== 0x0600)
    throw new SpreadsheetError("This is a very old Excel file. Open it in Excel and save it as .xlsx or CSV.");

  // Globals: shared strings and the first worksheet's offset.
  const sst: string[] = [];
  let sheetOffset = -1;
  let o = 0;
  while (o + 4 <= wb.length) {
    const r = record(o);
    if (r.type === 0x002f) throw new SpreadsheetError("This workbook is password-protected. Remove the password in Excel and try again.");
    if (r.type === 0x0085 && sheetOffset < 0 && wb[r.data + 5] === 0) sheetOffset = view.getUint32(r.data, true);
    if (r.type === 0x00fc) {
      const segments = [wb.subarray(r.data, r.data + r.len)];
      let n = r.data + r.len;
      while (n + 4 <= wb.length && record(n).type === 0x003c) {
        const c = record(n);
        segments.push(wb.subarray(c.data, c.data + c.len));
        n = c.data + c.len;
      }
      const cur = new BiffCursor(segments);
      cur.skip(4);
      const unique = cur.u32();
      for (let i = 0; i < unique && !cur.done; i++) sst.push(cur.string());
    }
    if (r.type === 0x000a) break;
    o = r.data + r.len;
  }
  if (sheetOffset < 0) throw new SpreadsheetError("This .xls file has no worksheet.");

  const rows: Cell[][] = [];
  const set = (row: number, col: number, value: Cell) => {
    (rows[row] ??= [])[col] = value;
  };
  let pendingFormula: [number, number] | null = null;
  o = sheetOffset;
  while (o + 4 <= wb.length) {
    const r = record(o);
    const d = r.data;
    if (r.type === 0x000a || d + r.len > wb.length) break;
    // Every cell record starts with its row and column; other records are skipped below.
    const row = r.len >= 4 ? view.getUint16(d, true) : 0;
    const col = r.len >= 4 ? view.getUint16(d + 2, true) : 0;
    switch (r.type) {
      case 0x00fd: // LABELSST
        set(row, col, sst[view.getUint32(d + 6, true)] ?? "");
        break;
      case 0x0203: // NUMBER
        set(row, col, view.getFloat64(d + 6, true));
        break;
      case 0x027e: // RK
        set(row, col, decodeRk(view.getUint32(d + 6, true)));
        break;
      case 0x00bd: {
        // MULRK
        const count = (r.len - 6) / 6;
        for (let i = 0; i < count; i++) set(row, col + i, decodeRk(view.getUint32(d + 4 + i * 6 + 2, true)));
        break;
      }
      case 0x0204: // LABEL
      case 0x00d6: // RSTRING
        set(row, col, new BiffCursor([wb.subarray(d + 6, d + r.len)]).string(false));
        break;
      case 0x0205: // BOOLERR
        set(row, col, wb[d + 7] ? null : wb[d + 6] === 1);
        break;
      case 0x0006: {
        // FORMULA: cached result
        if (view.getUint16(d + 12, true) === 0xffff) {
          const kind = wb[d + 6];
          if (kind === 0) pendingFormula = [row, col];
          else set(row, col, kind === 1 ? wb[d + 8] === 1 : null);
        } else set(row, col, view.getFloat64(d + 6, true));
        break;
      }
      case 0x0207: // STRING (result of the previous formula)
        if (pendingFormula) set(pendingFormula[0], pendingFormula[1], new BiffCursor([wb.subarray(d, d + r.len)]).string(false));
        pendingFormula = null;
        break;
    }
    if (r.type === 0x000a) break;
    o = d + r.len;
  }
  return Array.from(rows, (x) => Array.from(x ?? [], (c) => c ?? null));
}

// ─── XLSX writing ─────────────────────────────────────────────────────────────

export interface SheetColumn {
  header: string;
  /** Approximate width in characters. */
  width?: number;
  format?: "text" | "money" | "integer";
}

export interface SheetData {
  name: string;
  columns: SheetColumn[];
  rows: Cell[][];
  /** Lines written above the column headers (report title, period, branch). */
  preamble?: string[];
}

const escapeXml = (s: string) =>
  s
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function columnName(i: number): string {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

// Style indexes in STYLES: 0 normal, 1 bold header, 2 money, 3 integer.
const STYLE = { header: 1, money: 2, integer: 3 } as const;
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

function sheetXml(sheet: SheetData): string {
  const cell = (ref: string, value: Cell, style = 0) => {
    const s = style ? ` s="${style}"` : "";
    if (value === null || value === "") return "";
    if (typeof value === "number" && Number.isFinite(value)) return `<c r="${ref}"${s}><v>${value}</v></c>`;
    if (typeof value === "boolean") return `<c r="${ref}" t="b"${s}><v>${value ? 1 : 0}</v></c>`;
    const text = String(value);
    const space = /^\s|\s$/.test(text) ? ' xml:space="preserve"' : "";
    return `<c r="${ref}" t="inlineStr"${s}><is><t${space}>${escapeXml(text)}</t></is></c>`;
  };
  const lead = sheet.preamble?.length ? [...sheet.preamble, ""] : [];
  const h = lead.length + 1;
  const pre = lead.map((line, i) => `<row r="${i + 1}">${cell(`A${i + 1}`, line, i === 0 ? STYLE.header : 0)}</row>`).join("");
  const header = `<row r="${h}">${sheet.columns.map((c, i) => cell(`${columnName(i)}${h}`, c.header, STYLE.header)).join("")}</row>`;
  const body = sheet.rows
    .map((row, r) => {
      const cells = sheet.columns.map((c, i) => {
        const style = c.format === "money" ? STYLE.money : c.format === "integer" ? STYLE.integer : 0;
        return cell(`${columnName(i)}${r + h + 1}`, row[i] ?? null, typeof row[i] === "number" ? style : 0);
      });
      return `<row r="${r + h + 1}">${cells.join("")}</row>`;
    })
    .join("");
  const cols = sheet.columns
    .map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${Math.min(60, Math.max(8, c.width ?? Math.max(10, c.header.length + 2)))}" customWidth="1"/>`)
    .join("");
  const last = `${columnName(Math.max(0, sheet.columns.length - 1))}${sheet.rows.length + h}`;
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${h}" topLeftCell="A${h + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    (cols ? `<cols>${cols}</cols>` : "") +
    `<sheetData>${pre}${header}${body}</sheetData>` +
    (sheet.columns.length ? `<autoFilter ref="A${h}:${last}"/>` : "") +
    `</worksheet>`
  );
}

/** Excel sheet names: at most 31 characters, none of []:*?/\ and unique within the workbook. */
function sheetNames(names: string[]): string[] {
  const used = new Set<string>();
  return names.map((n) => {
    const base = n.replace(/[[\]:*?/\\]/g, " ").trim().slice(0, 31) || "Sheet";
    let name = base;
    for (let i = 2; used.has(name.toLowerCase()); i++) name = `${base.slice(0, 28)} ${i}`;
    used.add(name.toLowerCase());
    return name;
  });
}

export function writeXlsx(sheets: SheetData[]): Uint8Array {
  const names = sheetNames(sheets.map((s) => s.name));
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets
        .map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
        .join("")}</Types>`,
    ),
    "_rels/.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ),
    "xl/workbook.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names
        .map((n, i) => `<sheet name="${escapeXml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
        .join("")}</sheets></workbook>`,
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
        .map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
        .join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    ),
    "xl/styles.xml": strToU8(STYLES),
  };
  sheets.forEach((s, i) => {
    files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(s));
  });
  return zipSync(files, { level: 6 });
}

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
