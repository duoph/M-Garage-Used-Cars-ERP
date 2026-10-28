import type { Paise } from "@/types";

/**
 * Money helpers. All arithmetic happens on integer paise; conversion to and from
 * rupees only happens at the UI boundary.
 */

const inrFull = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const inrPlain = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

export function assertPaise(value: number): Paise {
  if (!Number.isSafeInteger(value)) throw new Error(`Invalid paise amount: ${value}`);
  return value;
}

/** Converts a rupee string/number entered by a user into integer paise. Returns null when invalid. */
export function rupeesToPaise(input: string | number): Paise | null {
  const raw = typeof input === "number" ? String(input) : input.replace(/[,₹\s]/g, "");
  if (raw === "" || !/^-?\d+(\.\d{0,2})?$/.test(raw)) return null;
  const negative = raw.startsWith("-");
  const [whole, fraction = ""] = raw.replace("-", "").split(".");
  const paise = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(paise)) return null;
  return negative ? -paise : paise;
}

/** Paise → rupee string suitable for an input field (no grouping). */
export function paiseToRupeeInput(paise: Paise): string {
  const sign = paise < 0 ? "-" : "";
  const abs = Math.abs(paise);
  const whole = Math.floor(abs / 100);
  const fraction = abs % 100;
  return fraction === 0 ? `${sign}${whole}` : `${sign}${whole}.${String(fraction).padStart(2, "0")}`;
}

/** ₹5,40,000 style formatting (Indian digit grouping). */
export function formatINR(paise: Paise): string {
  return inrFull.format(paise / 100);
}

/** Grouped number without currency symbol. */
export function formatRupeesPlain(paise: Paise): string {
  return inrPlain.format(paise / 100);
}

/** Compact lakh/crore notation for KPI cards and chart axes: ₹12.4L, ₹1.2Cr. */
export function formatINRCompact(paise: Paise): string {
  const rupees = paise / 100;
  const abs = Math.abs(rupees);
  const sign = rupees < 0 ? "-" : "";
  if (abs >= 1_00_00_000) return `${sign}₹${trim(abs / 1_00_00_000)}Cr`;
  if (abs >= 1_00_000) return `${sign}₹${trim(abs / 1_00_000)}L`;
  if (abs >= 1_000) return `${sign}₹${trim(abs / 1_000)}K`;
  return `${sign}₹${Math.round(abs)}`;
}

function trim(n: number): string {
  return n.toFixed(n >= 100 ? 0 : n >= 10 ? 1 : 2).replace(/\.?0+$/, "");
}

export function sumPaise(values: readonly Paise[]): Paise {
  return values.reduce((acc, v) => acc + v, 0);
}
