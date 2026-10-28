import type { VehicleView } from "@/lib/calculations/selectors";
import { csvRupees, downloadCsv, type CsvColumn } from "@/lib/utils/csv";
import { formatDate } from "@/lib/utils/dates";
import { FUEL_LABELS, TRANSMISSION_LABELS, VEHICLE_STATUS_LABELS } from "@/lib/utils/labels";
import { todayISO } from "@/lib/utils/dates";

/** Stock export. Cost and profit columns are only included when the caller is authorised. */
export function exportStockCsv(rows: readonly VehicleView[], opts: { includeCost: boolean; includeProfit: boolean }) {
  const cols: CsvColumn<VehicleView>[] = [
    { header: "Stock No.", value: (r) => r.vehicle.stockNumber },
    { header: "Make", value: (r) => r.vehicle.make },
    { header: "Model", value: (r) => r.vehicle.model },
    { header: "Variant", value: (r) => r.vehicle.variant },
    { header: "Year", value: (r) => r.vehicle.year },
    { header: "Registration", value: (r) => r.vehicle.registrationNumber },
    { header: "Fuel", value: (r) => FUEL_LABELS[r.vehicle.fuelType] },
    { header: "Transmission", value: (r) => TRANSMISSION_LABELS[r.vehicle.transmission] },
    { header: "Kilometers", value: (r) => r.vehicle.mileageKm },
    { header: "Colour", value: (r) => r.vehicle.color },
    { header: "Owners", value: (r) => r.vehicle.previousOwners },
    { header: "Status", value: (r) => VEHICLE_STATUS_LABELS[r.vehicle.status] },
    { header: "Asking Price (INR)", value: (r) => csvRupees(r.vehicle.askingPricePaise) },
    { header: "Stock Age (days)", value: (r) => r.stockAgeDays },
  ];
  if (opts.includeCost) {
    cols.push(
      { header: "Purchase Date", value: (r) => formatDate(r.purchase?.purchaseDate, "yyyy-MM-dd") },
      { header: "Purchase Price (INR)", value: (r) => csvRupees(r.purchase?.purchasePricePaise ?? 0) },
      { header: "Vehicle Expenses (INR)", value: (r) => csvRupees(r.expensesPaise) },
      { header: "Landed Cost (INR)", value: (r) => csvRupees(r.landedCostPaise) },
    );
  }
  if (opts.includeProfit) {
    cols.push(
      { header: "Sale Price (INR)", value: (r) => (r.sale ? csvRupees(r.sale.salePricePaise) : "") },
      { header: "Gross Profit (INR)", value: (r) => (r.profitPaise !== null ? csvRupees(r.profitPaise) : "") },
    );
  }
  downloadCsv(`stock-list-${todayISO()}.csv`, rows, cols);
}
