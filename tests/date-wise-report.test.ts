import { beforeAll, describe, expect, it } from "vitest";
import { DealerDatabase } from "@/lib/db/database";
import { readDataset } from "@/lib/db/dataset";
import { seedDatabase } from "./fixtures/demo-seed";
import type { Dataset } from "@/lib/calculations/selectors";
import { dateWiseReport } from "@/lib/calculations/reports";
import { inRange } from "@/lib/utils/dates";
import { sumPaise } from "@/lib/utils/money";

let ds: Dataset;

beforeAll(async () => {
  const db = new DealerDatabase(`datewise-${Math.random()}`);
  await seedDatabase(db);
  ds = (await readDataset(db))!;
});

describe("date-wise summary", () => {
  it("adds up to the same sales and money totals as the records and the ledger", () => {
    const all = { from: null, to: null };
    const r = dateWiseReport(ds, all, null, "day", true);
    const completed = ds.sales.filter((s) => s.status === "completed");
    expect(r.carsSold).toBe(completed.length);
    expect(r.salesPaise).toBe(sumPaise(completed.map((s) => s.salePricePaise)));
    const real = ds.ledger.filter((e) => e.source !== "opening" && !e.transfer);
    expect(r.inPaise).toBe(sumPaise(real.filter((e) => e.direction === "in").map((e) => e.amountPaise)));
    expect(r.outPaise).toBe(sumPaise(real.filter((e) => e.direction === "out").map((e) => e.amountPaise)));
    // Daily, weekly and monthly views only regroup the same numbers.
    for (const by of ["week", "month"] as const) expect(dateWiseReport(ds, all, null, by, true).salesPaise).toBe(r.salesPaise);
  });

  it("lists every day of a custom range, including days with nothing", () => {
    const range = { from: "2025-02-01", to: "2025-02-28" };
    const r = dateWiseReport(ds, range, null, "day", false);
    expect(r.rows).toHaveLength(28);
    expect(r.rows[0].key).toBe("2025-02-01");
    expect(r.rows.at(-1)!.key).toBe("2025-02-28");
    const sales = ds.sales.filter((s) => s.status === "completed" && inRange(s.saleDate, range));
    expect(r.salesPaise).toBe(sumPaise(sales.map((s) => s.salePricePaise)));
  });

  it("clips weeks and months to the selected dates", () => {
    const r = dateWiseReport(ds, { from: "2025-02-05", to: "2025-03-10" }, null, "month", false);
    expect(r.rows.map((x) => [x.key, x.end])).toEqual([["2025-02-05", "2025-02-28"], ["2025-03-01", "2025-03-10"]]);
  });
});
