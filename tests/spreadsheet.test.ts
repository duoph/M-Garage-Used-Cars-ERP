import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCsv, readSpreadsheetBytes, SpreadsheetError, writeXlsx } from "@/lib/utils/spreadsheet";

describe("CSV", () => {
  it("handles quotes, embedded commas and new lines, and a BOM", () => {
    const rows = parseCsv('﻿Name,Notes\r\n"Pillai, Anand","Said ""yes""\nlater"\r\nRavi,\r\n');
    expect(rows).toEqual([["Name", "Notes"], ["Pillai, Anand", 'Said "yes"\nlater'], ["Ravi", ""]]);
  });

  it("detects semicolon and tab delimiters", () => {
    expect(parseCsv("a;b;c\n1;2;3")).toEqual([["a", "b", "c"], ["1", "2", "3"]]);
    expect(parseCsv("a\tb\n1\t2")).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("treats a .xls that is really CSV text as CSV", () => {
    expect(readSpreadsheetBytes(new TextEncoder().encode("Make,Year\nTata,2023\n"), "export.xls")).toEqual([["Make", "Year"], ["Tata", "2023"]]);
  });
});

describe("XLSX", () => {
  it("reads back what it writes, with numbers kept as numbers", () => {
    const bytes = writeXlsx([
      {
        name: "Stock / list",
        columns: [{ header: "Make" }, { header: "Price", format: "money" }, { header: "Km", format: "integer" }, { header: "Notes" }],
        rows: [
          ["Tata", 650000.5, 12000, "  spaced & <escaped>  "],
          ["Kia", 1200000, null, true],
        ],
      },
      { name: "Second", columns: [{ header: "Only" }], rows: [] },
    ]);
    expect(readSpreadsheetBytes(bytes, "out.xlsx")).toEqual([
      ["Make", "Price", "Km", "Notes"],
      ["Tata", 650000.5, 12000, "  spaced & <escaped>  "],
      ["Kia", 1200000, null, true],
    ]);
  });

  it("reads a workbook written by another program (shared strings, dates as serial numbers, gaps)", () => {
    const rows = readSpreadsheetBytes(new Uint8Array(readFileSync("tests/fixtures/openpyxl-sample.xlsx")), "sample.xlsx");
    expect(rows[0]).toEqual(["Make", "Model", "Year", "Registration", "Purchase Date", "Price", "Notes"]);
    expect(rows[1]).toEqual(["Maruti Suzuki", "Swift", 2019, "KL 07 CD 4521", 46096, 425000.5, "Rs & ₹ <ok>"]);
    expect(rows[2].slice(0, 6)).toEqual(["Hyundai", "i20", 2021, "KL 43 F 5512", 46024, 610000]);
    expect(rows[3][6]).toBe(true);
  });

  it("rejects a damaged zip", () => {
    expect(() => readSpreadsheetBytes(new Uint8Array([0x50, 0x4b, 1, 2, 3]), "bad.xlsx")).toThrow(SpreadsheetError);
  });
});

// ─── A tiny Excel 97–2003 writer, just enough to exercise the .xls reader. ────

function rec(type: number, data: number[]): number[] {
  return [type & 0xff, type >> 8, data.length & 0xff, data.length >> 8, ...data];
}
const u16 = (n: number) => [n & 0xff, (n >> 8) & 0xff];
const u32 = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff];
const f64 = (n: number) => Array.from(new Uint8Array(new Float64Array([n]).buffer));
const latin = (s: string) => Array.from(s, (c) => c.charCodeAt(0));
const utf16 = (s: string) => Array.from(s).flatMap((c) => u16(c.charCodeAt(0)));
const rkInt = (n: number) => u32(((n << 2) | 0x02) >>> 0);
const bof = (kind: number) => rec(0x0809, [...u16(0x0600), ...u16(kind), ...u16(0), ...u16(0), ...u32(0), ...u32(0)]);

function buildWorkbookStream(): number[] {
  // SST: "Make", then "Maruti Suzuki ₹" split across a CONTINUE that switches to 16-bit characters.
  const sst = rec(0x00fc, [...u32(2), ...u32(2), ...u16(4), 0, ...latin("Make"), ...u16(15), 0, ...latin("Maruti ")]);
  const cont = rec(0x003c, [0x01, ...utf16("Suzuki ₹")]);
  const sheetName = latin("Cars");
  const boundSheet = (offset: number) => rec(0x0085, [...u32(offset), 0, 0, sheetName.length, 0, ...sheetName]);
  const globalsLength = bof(0x0005).length + boundSheet(0).length + sst.length + cont.length + 4;
  const globals = [...bof(0x0005), ...boundSheet(globalsLength), ...sst, ...cont, ...rec(0x000a, [])];
  const cell = (row: number, col: number) => [...u16(row), ...u16(col), ...u16(15)];
  const sheet = [
    ...bof(0x0010),
    ...rec(0x00fd, [...cell(0, 0), ...u32(0)]), // LABELSST "Make"
    ...rec(0x0204, [...cell(0, 1), ...u16(5), 0, ...latin("Price")]), // LABEL
    ...rec(0x00fd, [...cell(1, 0), ...u32(1)]),
    ...rec(0x0203, [...cell(1, 1), ...f64(425000.5)]), // NUMBER
    ...rec(0x00bd, [...u16(1), ...u16(2), ...u16(15), ...rkInt(2019), ...u16(15), ...u32(((12345 << 2) | 0x03) >>> 0), ...u16(3)]), // MULRK: 2019, 123.45
    ...rec(0x0006, [...cell(2, 0), 0, 0, 0, 0, 0, 0, 0xff, 0xff, ...u16(0), ...u32(0), ...u16(0)]), // FORMULA → string
    ...rec(0x0207, [...u16(2), 0, ...latin("OK")]),
    ...rec(0x0205, [...cell(2, 1), 1, 0]), // BOOLERR true
    ...rec(0x000a, []),
  ];
  return [...globals, ...sheet];
}

/** Wraps a stream in a compound file. Streams under 4096 bytes go in the mini stream, like Excel does. */
function compoundFile(stream: number[]): Uint8Array {
  const SECTOR = 512;
  const mini = stream.length < 4096;
  const sectors = (n: number) => Math.ceil(n / SECTOR);
  const header = new Uint8Array(SECTOR);
  const hv = new DataView(header.buffer);
  header.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  hv.setUint16(0x18, 0x3e, true);
  hv.setUint16(0x1a, 3, true);
  hv.setUint16(0x1c, 0xfffe, true);
  hv.setUint16(0x1e, 9, true);
  hv.setUint16(0x20, 6, true);
  hv.setUint32(0x2c, 1, true);
  hv.setUint32(0x38, 4096, true);
  hv.setUint32(0x44, 0xfffffffe, true);
  for (let i = 0; i < 109; i++) hv.setUint32(0x4c + i * 4, i === 0 ? 0 : 0xffffffff, true);

  // Sector 0: FAT, 1: directory, then [mini FAT, mini stream] or the stream itself.
  const body: Uint8Array[] = [];
  const fat = new Array(SECTOR / 4).fill(0xffffffff);
  fat[0] = 0xfffffffd;
  fat[1] = 0xfffffffe;
  const chainFrom = (start: number, count: number) => {
    for (let i = 0; i < count; i++) fat[start + i] = i === count - 1 ? 0xfffffffe : start + i + 1;
  };
  const dir = new Uint8Array(SECTOR);
  const dv = new DataView(dir.buffer);
  const entry = (i: number, name: string, type: number, start: number, size: number) => {
    utf16(name).forEach((b, j) => (dir[i * 128 + j] = b));
    dv.setUint16(i * 128 + 0x40, (name.length + 1) * 2, true);
    dir[i * 128 + 0x42] = type;
    dv.setUint32(i * 128 + 0x44, 0xffffffff, true);
    dv.setUint32(i * 128 + 0x48, 0xffffffff, true);
    dv.setUint32(i * 128 + 0x4c, i === 0 ? 1 : 0xffffffff, true);
    dv.setUint32(i * 128 + 0x74, start, true);
    dv.setUint32(i * 128 + 0x78, size, true);
  };
  const pad = (bytes: number[], to: number) => {
    const out = new Uint8Array(Math.ceil(bytes.length / to) * to || to);
    out.set(bytes);
    return out;
  };
  if (mini) {
    const miniSectors = Math.ceil(stream.length / 64);
    const miniFat = new Array(SECTOR / 4).fill(0xffffffff);
    for (let i = 0; i < miniSectors; i++) miniFat[i] = i === miniSectors - 1 ? 0xfffffffe : i + 1;
    fat[2] = 0xfffffffe;
    const ms = pad(stream, SECTOR);
    chainFrom(3, sectors(ms.length));
    hv.setUint32(0x3c, 2, true);
    hv.setUint32(0x40, 1, true);
    entry(0, "Root Entry", 5, 3, ms.length);
    entry(1, "Workbook", 2, 0, stream.length);
    body.push(new Uint8Array(miniFat.flatMap(u32)), ms);
  } else {
    hv.setUint32(0x3c, 0xfffffffe, true);
    const s = pad(stream, SECTOR);
    chainFrom(2, sectors(s.length));
    entry(0, "Root Entry", 5, 0xfffffffe, 0);
    entry(1, "Workbook", 2, 2, stream.length);
    body.push(s);
  }
  hv.setUint32(0x30, 1, true);
  const parts = [header, new Uint8Array(fat.flatMap(u32)), dir, ...body];
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

describe("XLS (Excel 97–2003)", () => {
  it("reads strings split across records, numbers, RK values, formulas and booleans (small file, mini stream)", () => {
    expect(readSpreadsheetBytes(compoundFile(buildWorkbookStream()), "cars.xls")).toEqual([
      ["Make", "Price"],
      ["Maruti Suzuki ₹", 425000.5, 2019, 123.45],
      ["OK", true],
    ]);
  });

  it("reads the same workbook when it is large enough to use regular sectors", () => {
    const stream = buildWorkbookStream();
    const rows = readSpreadsheetBytes(compoundFile([...stream, ...new Array(5000).fill(0)]), "cars.xls");
    expect(rows[1]).toEqual(["Maruti Suzuki ₹", 425000.5, 2019, 123.45]);
    expect(rows[2]).toEqual(["OK", true]);
  });

  const SYSTEM_XLS = "/System/Library/PrivateFrameworks/OfficeImport.framework/Versions/A/Resources/BlankDelimited.xls";
  it.skipIf(!existsSync(SYSTEM_XLS))("opens a real Excel-made .xls file", () => {
    expect(readSpreadsheetBytes(new Uint8Array(readFileSync(SYSTEM_XLS)), "blank.xls")).toEqual([]);
  });
});
