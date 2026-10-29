export function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // Fallback for older environments: RFC4122 v4 from getRandomValues.
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** PUR-2026-0007 style references. */
export function formatReference(prefix: string, year: number, seq: number): string {
  return `${prefix}-${year}-${String(seq).padStart(4, "0")}`;
}

/** Invoice number for a sale: SAL-2026-0012 → INV-2026-0012. */
export function invoiceNumber(saleReference: string): string {
  return saleReference.replace(/^SAL/, "INV");
}

/** Normalises registration numbers for duplicate detection: "KL 07 cd-4521" → "KL07CD4521". */
export function normalizeRegistration(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function normalizeChassis(value: string): string {
  return value.toUpperCase().replace(/\s/g, "");
}

/** Pretty registration: "KL07CD4521" → "KL 07 CD 4521" when it matches the standard pattern. */
export function formatRegistration(value: string): string {
  const n = normalizeRegistration(value);
  const m = n.match(/^([A-Z]{2})(\d{1,2})([A-Z]{0,3})(\d{1,4})$/);
  if (m) return [m[1], m[2].padStart(2, "0"), m[3], m[4]].filter(Boolean).join(" ");
  const bh = n.match(/^(\d{2})(BH)(\d{4})([A-Z]{1,2})$/);
  if (bh) return `${bh[1]} BH ${bh[3]} ${bh[4]}`;
  return value.toUpperCase().trim();
}
