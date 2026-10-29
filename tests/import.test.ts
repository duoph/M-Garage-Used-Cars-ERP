import { describe, expect, it } from "vitest";
import { ImportFileError, parseDateCell, planImport } from "@/features/data/importers";
import type { Vehicle } from "@/types";

const existing = [{ id: "v1", stockNumber: "STK-0001", registrationNumber: "KL 07 CD 4521", chassisNumber: "MA3EWDE1S00123456", archivedAt: null }] as Vehicle[];

describe("dates in imported files", () => {
  it("reads day-first, ISO, month names and Excel serial numbers", () => {
    expect(parseDateCell("15/03/2026")).toBe("2026-03-15");
    expect(parseDateCell("5-3-26")).toBe("2026-03-05");
    expect(parseDateCell("2026-03-15")).toBe("2026-03-15");
    expect(parseDateCell("5 Mar 2026")).toBe("2026-03-05");
    expect(parseDateCell("05-Mar-26")).toBe("2026-03-05");
    expect(parseDateCell(46096)).toBe("2026-03-15");
    expect(parseDateCell("31/02/2026")).toBeNull();
    expect(parseDateCell("")).toBeUndefined();
  });
});

describe("stock import", () => {
  const header = ["Brand", "Model", "Year", "Reg No", "Fuel", "Gearbox", "KMs Driven", "Color", "Selling Price (₹)", "Bought On", "Cost Price", "Seller", "Seller Mobile", "Something else"];

  it("matches headings by synonym, converts values and validates each row", () => {
    const plan = planImport(
      "stock",
      [
        [],
        header,
        ["Tata", "Nexon", 2022, "kl-08-ab-1234", "Diesel", "AMT", "38,500 km", "Grey", "8.5 lakh", "12/09/2026", "₹7,40,000", "Ravi K", 9847000001, "x"],
        ["Kia", "Seltos", 2021, "KL 07 CD 4521", "Petrol", "MT", 41000, "White", 1200000, "12/09/2026", 1000000, "Anu", "9847000002", ""],
        ["Kia", "Sonet", 2023, "KL 08 AB 1234", "Diesel", "Automatic", 9000, "Red", 950000, "13/09/2026", 800000, "Joe", "9847000003", ""],
        ["Honda", "City", 2020, "KL 09 X 1", "Kerosene", "Manual", 1, "Blue", 1, "01/01/2026", 1, "Joe", "9847000004", ""],
        ["Honda", "Amaze", 2020, "KL 09 X 2", "Petrol", "Manual", 1000, "Blue", 500000, "01/01/2026", 400000, "Joe", "12345", ""],
        ["", "", "", "", "", "", "", "", "", "", "", "", "", ""],
      ],
      { vehicles: existing },
    );
    expect(plan.ignored).toEqual(["Something else"]);
    expect(plan.ready).toHaveLength(1);
    expect(plan.ready[0].line).toBe(3);
    expect(plan.ready[0].input).toMatchObject({
      make: "Tata", registrationNumber: "kl-08-ab-1234", fuelType: "diesel", transmission: "amt", mileageKm: 38500,
      askingPricePaise: 8_50_000_00, purchaseDate: "2026-09-12", purchasePricePaise: 7_40_000_00, amountPaidPaise: 7_40_000_00,
      previousOwners: 1, paymentMethod: "bank_transfer", sellerContact: "9847000001",
    });
    expect(plan.problems.map((p) => [p.line, p.error])).toEqual([
      [4, "Already in stock as STK-0001 (KL 07 CD 4521)"],
      [5, "Same registration as row 3"],
      [6, expect.stringContaining('Fuel "Kerosene" isn\'t recognised')],
      [7, expect.stringContaining("10-digit")],
    ]);
  });

  it("explains which required columns are missing", () => {
    expect(() => planImport("stock", [["Make", "Model"]], { vehicles: [] })).toThrow(ImportFileError);
    expect(() => planImport("stock", [["Make", "Model"]], { vehicles: [] })).toThrow(/Missing columns: Year, Registration/);
  });
});

describe("expense import", () => {
  it("links vehicle expenses by registration and requires a car for vehicle categories", () => {
    const plan = planImport(
      "expenses",
      [
        ["Date", "Category", "Particulars", "Amount", "Vehicle"],
        ["2026-10-01", "Painting", "Bumper respray", "₹6,500", "KL07CD4521"],
        ["2026-10-02", "Rent", "October rent", 85000, ""],
        ["2026-10-03", "Repair", "Clutch plate", 9000, ""],
        ["2026-10-03", "Repair", "Clutch plate", 9000, "KL 01 A 1"],
      ],
      { vehicles: existing },
    );
    expect(plan.ready.map((r) => r.input)).toMatchObject([
      { category: "painting", vehicleId: "v1", amountPaise: 6_500_00, paymentMethod: "cash" },
      { category: "rent", vehicleId: null, amountPaise: 85_000_00 },
    ]);
    expect(plan.problems.map((p) => p.error)).toEqual([expect.stringContaining("Select the vehicle"), "No car with registration KL 01 A 1 in stock"]);
  });
});
