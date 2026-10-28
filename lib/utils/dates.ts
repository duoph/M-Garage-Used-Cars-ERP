import { format, isValid, parseISO, startOfMonth, endOfMonth, subDays, subMonths, startOfYear, differenceInCalendarDays } from "date-fns";
import type { DateFormatPreference, ISODate } from "@/types";

/** Today as a local `YYYY-MM-DD` business date. */
export function todayISO(): ISODate {
  return format(new Date(), "yyyy-MM-dd");
}

export function toISODate(date: Date): ISODate {
  return format(date, "yyyy-MM-dd");
}

export function nowISO(): string {
  return new Date().toISOString();
}

/** Parses either a `YYYY-MM-DD` business date or an ISO timestamp as a local Date. */
export function parseDate(value: string): Date {
  return parseISO(value);
}

let preferredFormat: DateFormatPreference = "dd MMM yyyy";
export function setPreferredDateFormat(f: DateFormatPreference) {
  preferredFormat = f;
}

export function formatDate(value: string | null | undefined, pattern: string = preferredFormat): string {
  if (!value) return "—";
  const d = parseISO(value);
  return isValid(d) ? format(d, pattern) : "—";
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = parseISO(value);
  return isValid(d) ? format(d, `${preferredFormat}, h:mm a`) : "—";
}

export function daysSince(value: string, now: Date = new Date()): number {
  return Math.max(0, differenceInCalendarDays(now, parseISO(value)));
}

export const DATE_RANGE_PRESETS = [
  "this_month",
  "last_30",
  "last_3_months",
  "last_6_months",
  "this_year",
  "all",
  "custom",
] as const;
export type DateRangePreset = (typeof DATE_RANGE_PRESETS)[number];

export const DATE_RANGE_LABELS: Record<DateRangePreset, string> = {
  this_month: "This month",
  last_30: "Last 30 days",
  last_3_months: "Last 3 months",
  last_6_months: "Last 6 months",
  this_year: "This year",
  all: "All time",
  custom: "Custom range",
};

export interface DateRange {
  preset: DateRangePreset;
  /** Inclusive, `YYYY-MM-DD`; null means unbounded. */
  from: ISODate | null;
  to: ISODate | null;
}

export function resolvePreset(preset: DateRangePreset, now: Date = new Date()): DateRange {
  switch (preset) {
    case "this_month":
      return { preset, from: toISODate(startOfMonth(now)), to: toISODate(endOfMonth(now)) };
    case "last_30":
      return { preset, from: toISODate(subDays(now, 29)), to: toISODate(now) };
    case "last_3_months":
      return { preset, from: toISODate(startOfMonth(subMonths(now, 2))), to: toISODate(now) };
    case "last_6_months":
      return { preset, from: toISODate(startOfMonth(subMonths(now, 5))), to: toISODate(now) };
    case "this_year":
      return { preset, from: toISODate(startOfYear(now)), to: toISODate(now) };
    case "all":
    case "custom":
      return { preset, from: null, to: null };
  }
}

/** Inclusive range check on `YYYY-MM-DD` strings (lexicographic compare is safe for this format). */
export function inRange(date: ISODate, range: Pick<DateRange, "from" | "to">): boolean {
  const d = date.slice(0, 10);
  if (range.from && d < range.from) return false;
  if (range.to && d > range.to) return false;
  return true;
}

export function describeRange(range: DateRange): string {
  if (range.preset !== "custom") return DATE_RANGE_LABELS[range.preset];
  if (range.from && range.to) return `${formatDate(range.from)} – ${formatDate(range.to)}`;
  if (range.from) return `From ${formatDate(range.from)}`;
  if (range.to) return `Until ${formatDate(range.to)}`;
  return "All time";
}
