import { differenceInCalendarDays, parseISO } from "date-fns";
import type { ISODate, Vehicle, VehiclePapers } from "@/types";

/** Days ahead a validity counts as "expiring soon". */
export const PAPERS_WARNING_DAYS = 30;

export type PaperStatus = "expired" | "expiring" | "valid" | "unknown";

export interface PaperCheck {
  key: "insurance" | "puc" | "rc" | "fitness" | "noc";
  label: string;
  date: ISODate | "";
  status: PaperStatus;
  /** Days until expiry; negative once expired. */
  days: number | null;
}

export function validityStatus(date: ISODate | "", today: Date = new Date()): { status: PaperStatus; days: number | null } {
  if (!date) return { status: "unknown", days: null };
  const days = differenceInCalendarDays(parseISO(date), today);
  return { status: days < 0 ? "expired" : days <= PAPERS_WARNING_DAYS ? "expiring" : "valid", days };
}

export function emptyPapers(): VehiclePapers {
  return {
    insuranceType: "comprehensive",
    insuranceCompany: "",
    insurancePolicyNumber: "",
    insuranceValidTill: "",
    pucValidTill: "",
    rcValidTill: "",
    fitnessValidTill: "",
    hypothecated: false,
    financierName: "",
    nocReceived: false,
    rcInHand: false,
    spareKey: false,
    serviceRecords: false,
    notes: "",
  };
}

/** Validity checks for one car. Uninsured cars skip the insurance check; NOC shows only while hypothecated. */
export function paperChecks(v: Pick<Vehicle, "papers">, today: Date = new Date()): PaperCheck[] {
  const p = v.papers;
  if (!p) return [];
  const checks: PaperCheck[] = [];
  if (p.insuranceType !== "none") checks.push({ key: "insurance", label: "Insurance", date: p.insuranceValidTill, ...validityStatus(p.insuranceValidTill, today) });
  checks.push({ key: "puc", label: "Pollution (PUC)", date: p.pucValidTill, ...validityStatus(p.pucValidTill, today) });
  checks.push({ key: "rc", label: "RC validity", date: p.rcValidTill, ...validityStatus(p.rcValidTill, today) });
  if (p.fitnessValidTill) checks.push({ key: "fitness", label: "Fitness", date: p.fitnessValidTill, ...validityStatus(p.fitnessValidTill, today) });
  if (p.hypothecated)
    checks.push({ key: "noc", label: `NOC from ${p.financierName || "financier"}`, date: "", status: p.nocReceived ? "valid" : "expired", days: null });
  return checks;
}

/** Problems worth flagging on a car still in stock: expired or expiring papers and a missing bank NOC. */
export function paperAlerts(v: Pick<Vehicle, "papers">, today: Date = new Date()): PaperCheck[] {
  return paperChecks(v, today).filter((c) => c.status === "expired" || c.status === "expiring");
}
