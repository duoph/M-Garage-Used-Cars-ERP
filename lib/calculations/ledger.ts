import type {
  AccountKind,
  ID,
  ISODate,
  MoneyAccount,
  Paise,
  PaymentMethod,
  Purchase,
  Voucher,
  VoucherHead,
} from "@/types";
import { EXPENSE_CATEGORY_LABELS, VOUCHER_HEAD_LABELS, vehicleTitle } from "@/lib/utils/labels";
import { inRange, type DateRange } from "@/lib/utils/dates";
import { sumPaise } from "@/lib/utils/money";
import { landedCost, purchaseBalance } from "./finance";
import { saleView, type Dataset, type DatasetIndex } from "./selectors";

/**
 * The cash book. Every rupee that moved is derived from the records that caused it — sale payments,
 * booking advances, seller payments, expenses and vouchers — so balances can never drift from the
 * transactions behind them. Nothing here is stored.
 */

export type EntrySource = "opening" | "sale_payment" | "booking" | "purchase_payment" | "expense" | "voucher";

export interface MoneyEntry {
  /** Unique per entry; a contra voucher yields two entries. */
  key: string;
  source: EntrySource;
  date: ISODate;
  /** Tie-breaker within a day. */
  createdAt: string;
  accountId: ID;
  direction: "in" | "out";
  amountPaise: Paise;
  /** Receipt / voucher / reference number. */
  number: string;
  /** "Sale receipt", "Payment to seller", "Rent"… */
  typeLabel: string;
  party: string;
  particulars: string;
  method: PaymentMethod | null;
  /** Staff member who handled the money. */
  handledBy: ID | null;
  href: string | null;
  /** Vouchers only, so they can be printed or cancelled. */
  voucherId?: ID;
  /** Contra legs: money moved between the showroom's own accounts, not received or spent. */
  transfer?: boolean;
}

/** Heads that count towards profit and loss (the rest are capital, loans, refunds and transfers). */
export const INCOME_HEADS: readonly VoucherHead[] = ["other_income", "commission_received", "service_charges", "misc_receipt"];
export const EXPENSE_HEADS: readonly VoucherHead[] = ["commission_paid", "misc_payment"];

function defaultOf(accounts: readonly MoneyAccount[], kind: AccountKind): MoneyAccount | undefined {
  const live = accounts.filter((a) => a.kind === kind && !a.archived);
  return live.find((a) => a.isDefault) ?? live[0] ?? accounts.find((a) => a.kind === kind);
}

/** Cash goes to the default cash account; UPI, cards, cheques, transfers and finance go to the default bank. */
export function accountForMethod(accounts: readonly MoneyAccount[], method: PaymentMethod): MoneyAccount | undefined {
  return defaultOf(accounts, method === "cash" ? "cash" : "bank") ?? accounts[0];
}

export function resolveAccountId(accounts: readonly MoneyAccount[], explicit: ID | null | undefined, method: PaymentMethod): ID {
  if (explicit && accounts.some((a) => a.id === explicit)) return explicit;
  return accountForMethod(accounts, method)?.id ?? "unassigned";
}

/** Seller payments made through vouchers, per purchase. */
export function sellerVoucherTotals(vouchers: readonly Voucher[]): Map<ID, Paise> {
  const totals = new Map<ID, Paise>();
  for (const v of vouchers)
    if (v.status === "active" && v.head === "seller_payment" && v.purchaseId)
      totals.set(v.purchaseId, (totals.get(v.purchaseId) ?? 0) + v.amountPaise);
  return totals;
}

/** What was paid on the purchase day itself: the purchase's paid amount minus later seller-payment vouchers. */
export function initialPurchasePayment(p: Purchase, voucherTotals: Map<ID, Paise>): Paise {
  return Math.max(0, p.amountPaidPaise - (voucherTotals.get(p.id) ?? 0));
}

export function moneyEntries(ds: Dataset, idx: DatasetIndex): MoneyEntry[] {
  const accounts = ds.accounts;
  const acc = (explicit: ID | null | undefined, method: PaymentMethod) => resolveAccountId(accounts, explicit, method);
  const entries: MoneyEntry[] = [];

  for (const a of accounts) {
    if (a.openingBalancePaise === 0) continue;
    entries.push({
      key: `open-${a.id}`,
      source: "opening",
      date: a.openingDate,
      createdAt: "",
      accountId: a.id,
      direction: a.openingBalancePaise > 0 ? "in" : "out",
      amountPaise: Math.abs(a.openingBalancePaise),
      number: "—",
      typeLabel: "Opening balance",
      party: "",
      particulars: `Opening balance of ${a.name}`,
      method: null,
      handledBy: null,
      href: null,
    });
  }

  for (const p of ds.payments) {
    const sale = idx.sales.get(p.saleId);
    const vehicle = sale ? idx.vehicles.get(sale.vehicleId) : undefined;
    const customer = sale ? idx.customers.get(sale.customerId) : undefined;
    entries.push({
      key: `pay-${p.id}`,
      source: "sale_payment",
      date: p.date,
      createdAt: p.createdAt,
      accountId: acc(p.accountId, p.method),
      direction: "in",
      amountPaise: p.amountPaise,
      number: p.receiptNumber,
      typeLabel: p.kind === "booking" ? "Booking advance" : "Sale receipt",
      party: customer?.name ?? "",
      particulars: `${sale?.reference ?? ""}${vehicle ? ` · ${vehicle.year} ${vehicleTitle(vehicle)} ${vehicle.registrationNumber}` : ""}`,
      method: p.method,
      handledBy: p.receivedBy ?? p.recordedBy,
      href: sale ? `/sales/${sale.id}` : null,
    });
  }

  // Advances on cars still reserved. Once sold they come back as booking payments on the sale.
  for (const r of ds.reservations) {
    if (r.status !== "active" || r.bookingAmountPaise <= 0) continue;
    const vehicle = idx.vehicles.get(r.vehicleId);
    entries.push({
      key: `res-${r.id}`,
      source: "booking",
      date: r.reservationDate,
      createdAt: r.createdAt,
      accountId: acc(null, r.bookingMethod),
      direction: "in",
      amountPaise: r.bookingAmountPaise,
      number: r.reference,
      typeLabel: "Booking advance",
      party: idx.customers.get(r.customerId)?.name ?? "",
      particulars: vehicle ? `${vehicle.year} ${vehicleTitle(vehicle)} ${vehicle.registrationNumber}` : "",
      method: r.bookingMethod,
      handledBy: r.createdBy,
      href: `/inventory/${r.vehicleId}`,
    });
  }

  const voucherTotals = sellerVoucherTotals(ds.vouchers);
  for (const p of ds.purchases) {
    const amount = initialPurchasePayment(p, voucherTotals);
    if (amount <= 0) continue;
    const vehicle = idx.vehicles.get(p.vehicleId);
    entries.push({
      key: `pur-${p.id}`,
      source: "purchase_payment",
      date: p.purchaseDate,
      createdAt: p.createdAt,
      accountId: acc(null, p.paymentMethod),
      direction: "out",
      amountPaise: amount,
      number: p.reference,
      typeLabel: "Car purchase",
      party: p.sellerName,
      particulars: `${vehicle ? `${vehicle.year} ${vehicleTitle(vehicle)} ${vehicle.registrationNumber}` : ""}${p.status === "cancelled" ? " (purchase cancelled)" : ""}`,
      method: p.paymentMethod,
      handledBy: p.createdBy,
      href: `/purchases/${p.id}`,
    });
  }

  for (const e of ds.expenses) {
    const vehicle = e.vehicleId ? idx.vehicles.get(e.vehicleId) : undefined;
    entries.push({
      key: `exp-${e.id}`,
      source: "expense",
      date: e.date,
      createdAt: e.createdAt,
      accountId: acc(e.accountId, e.paymentMethod),
      direction: "out",
      amountPaise: e.amountPaise,
      number: e.reference,
      typeLabel: EXPENSE_CATEGORY_LABELS[e.category],
      party: e.vendor,
      particulars: `${e.description}${vehicle ? ` · ${vehicleTitle(vehicle)} ${vehicle.registrationNumber}` : ""}`,
      method: e.paymentMethod,
      handledBy: e.createdBy,
      href: vehicle ? `/inventory/${vehicle.id}` : "/expenses",
    });
  }

  for (const v of ds.vouchers) {
    if (v.status !== "active") continue;
    const base = {
      source: "voucher" as const,
      date: v.date,
      createdAt: v.createdAt,
      amountPaise: v.amountPaise,
      number: v.number,
      typeLabel: VOUCHER_HEAD_LABELS[v.head],
      party: v.partyName,
      particulars: v.narration,
      method: v.method,
      handledBy: v.handledBy,
      href: `/voucher/${v.id}`,
      voucherId: v.id,
    };
    if (v.type === "contra") {
      const from = accounts.find((a) => a.id === v.accountId)?.name ?? "account";
      const to = accounts.find((a) => a.id === v.toAccountId)?.name ?? "account";
      entries.push({ ...base, transfer: true, key: `v-${v.id}-out`, accountId: v.accountId, direction: "out", party: to, particulars: v.narration || `Moved to ${to}` });
      if (v.toAccountId)
        entries.push({ ...base, transfer: true, key: `v-${v.id}-in`, accountId: v.toAccountId, direction: "in", party: from, particulars: v.narration || `Moved from ${from}` });
    } else {
      entries.push({ ...base, key: `v-${v.id}`, accountId: v.accountId, direction: v.type === "receipt" ? "in" : "out" });
    }
  }

  return entries.sort(compareEntries);
}

export function compareEntries(a: MoneyEntry, b: MoneyEntry): number {
  return a.date.localeCompare(b.date) || (a.source === "opening" ? -1 : b.source === "opening" ? 1 : 0) || a.createdAt.localeCompare(b.createdAt);
}

export const signed = (e: MoneyEntry): Paise => (e.direction === "in" ? e.amountPaise : -e.amountPaise);

export interface AccountSummary {
  account: MoneyAccount;
  inPaise: Paise;
  outPaise: Paise;
  balancePaise: Paise;
}

export function accountSummaries(accounts: readonly MoneyAccount[], entries: readonly MoneyEntry[], upTo?: ISODate): AccountSummary[] {
  return accounts.map((account) => {
    const own = entries.filter((e) => e.accountId === account.id && (!upTo || e.date <= upTo));
    const inPaise = sumPaise(own.filter((e) => e.direction === "in").map((e) => e.amountPaise));
    const outPaise = sumPaise(own.filter((e) => e.direction === "out").map((e) => e.amountPaise));
    return { account, inPaise, outPaise, balancePaise: inPaise - outPaise };
  });
}

/** Ledger rows of one account (or all) within a range, with the balance carried in and after each row. */
export function runningLedger(entries: readonly MoneyEntry[], range: Pick<DateRange, "from" | "to">, accountId?: ID) {
  const own = accountId ? entries.filter((e) => e.accountId === accountId) : entries;
  const before = own.filter((e) => range.from && e.date < range.from);
  const opening = sumPaise(before.map(signed));
  let running = opening;
  const rows = own
    .filter((e) => inRange(e.date, range))
    .map((e) => {
      running += signed(e);
      return { entry: e, balancePaise: running };
    });
  const inPaise = sumPaise(rows.filter((r) => r.entry.direction === "in").map((r) => r.entry.amountPaise));
  const outPaise = sumPaise(rows.filter((r) => r.entry.direction === "out").map((r) => r.entry.amountPaise));
  return { openingPaise: opening, rows, inPaise, outPaise, closingPaise: running };
}

/** Money received in a range, split by payment mode (cash, UPI, cheque…). */
export function receiptsByMethod(entries: readonly MoneyEntry[], range: Pick<DateRange, "from" | "to">) {
  const totals = new Map<PaymentMethod, Paise>();
  for (const e of entries) {
    if (e.direction !== "in" || !e.method || e.transfer || !inRange(e.date, range)) continue;
    totals.set(e.method, (totals.get(e.method) ?? 0) + e.amountPaise);
  }
  return [...totals.entries()].map(([method, amountPaise]) => ({ method, amountPaise })).sort((a, b) => b.amountPaise - a.amountPaise);
}

// ─── Profit & loss ─────────────────────────────────────────────────────────────

export interface ProfitAndLoss {
  salesPaise: Paise;
  carsSold: number;
  purchaseCostPaise: Paise;
  reconditioningPaise: Paise;
  grossProfitPaise: Paise;
  otherIncome: { label: string; amountPaise: Paise }[];
  otherIncomePaise: Paise;
  expenses: { label: string; amountPaise: Paise }[];
  expensesPaise: Paise;
  netProfitPaise: Paise;
}

function groupTotals<T>(items: readonly T[], label: (t: T) => string, amount: (t: T) => Paise) {
  const map = new Map<string, Paise>();
  for (const i of items) map.set(label(i), (map.get(label(i)) ?? 0) + amount(i));
  return [...map.entries()].map(([l, a]) => ({ label: l, amountPaise: a })).sort((a, b) => b.amountPaise - a.amountPaise);
}

/**
 * Trading view: a car's cost (purchase + its own repairs) is charged when it is sold, so unsold stock
 * is never an expense. Showroom running costs and voucher income/expense heads fall in the period they occur.
 */
export function profitAndLoss(ds: Dataset, idx: DatasetIndex, range: Pick<DateRange, "from" | "to">): ProfitAndLoss {
  const sold = ds.sales.filter((s) => s.status === "completed" && inRange(s.saleDate, range)).map((s) => saleView(s, idx));
  const salesPaise = sumPaise(sold.map((s) => s.sale.salePricePaise));
  const purchaseCostPaise = sumPaise(sold.map((s) => s.purchasePricePaise));
  const reconditioningPaise = sumPaise(sold.map((s) => s.vehicleExpensesPaise));
  const grossProfitPaise = salesPaise - purchaseCostPaise - reconditioningPaise;
  const vouchers = ds.vouchers.filter((v) => v.status === "active" && inRange(v.date, range));
  const otherIncome = groupTotals(vouchers.filter((v) => INCOME_HEADS.includes(v.head)), (v) => VOUCHER_HEAD_LABELS[v.head], (v) => v.amountPaise);
  const general = ds.expenses.filter((e) => !e.vehicleId && inRange(e.date, range));
  const expenses = [
    ...groupTotals(general, (e) => EXPENSE_CATEGORY_LABELS[e.category], (e) => e.amountPaise),
    ...groupTotals(vouchers.filter((v) => EXPENSE_HEADS.includes(v.head)), (v) => VOUCHER_HEAD_LABELS[v.head], (v) => v.amountPaise),
  ].sort((a, b) => b.amountPaise - a.amountPaise);
  const otherIncomePaise = sumPaise(otherIncome.map((i) => i.amountPaise));
  const expensesPaise = sumPaise(expenses.map((e) => e.amountPaise));
  return {
    salesPaise,
    carsSold: sold.length,
    purchaseCostPaise,
    reconditioningPaise,
    grossProfitPaise,
    otherIncome,
    otherIncomePaise,
    expenses,
    expensesPaise,
    netProfitPaise: grossProfitPaise + otherIncomePaise - expensesPaise,
  };
}

// ─── Financial position ────────────────────────────────────────────────────────

export interface FinancialPosition {
  cashPaise: Paise;
  bankPaise: Paise;
  receivablesPaise: Paise;
  stockPaise: Paise;
  advancesPaise: Paise;
  payablesPaise: Paise;
  loansPaise: Paise;
  /** Advances held on cars still reserved; owed back or adjusted on sale. */
  customerAdvancesPaise: Paise;
  assetsPaise: Paise;
  liabilitiesPaise: Paise;
  netWorthPaise: Paise;
}

export function financialPosition(ds: Dataset, idx: DatasetIndex, entries: readonly MoneyEntry[]): FinancialPosition {
  const balances = accountSummaries(ds.accounts, entries);
  const cashPaise = sumPaise(balances.filter((b) => b.account.kind === "cash").map((b) => b.balancePaise));
  const bankPaise = sumPaise(balances.filter((b) => b.account.kind === "bank").map((b) => b.balancePaise));
  const receivablesPaise = sumPaise(
    ds.sales.filter((s) => s.status === "completed").map((s) => saleView(s, idx).totals.balancePaise),
  );
  const stockPaise = sumPaise(
    ds.vehicles
      .filter((v) => !v.archivedAt && v.status !== "sold")
      .map((v) => {
        const p = idx.purchases.get(v.purchaseId);
        return landedCost(p?.purchasePricePaise ?? 0, sumPaise((idx.expensesByVehicle.get(v.id) ?? []).map((e) => e.amountPaise)));
      }),
  );
  const active = ds.vouchers.filter((v) => v.status === "active");
  const total = (head: VoucherHead) => sumPaise(active.filter((v) => v.head === head).map((v) => v.amountPaise));
  const advancesPaise = total("staff_advance");
  const payablesPaise = sumPaise(ds.purchases.filter((p) => p.status === "active").map(purchaseBalance));
  const loansPaise = Math.max(0, total("loan_received") - total("loan_repayment"));
  const customerAdvancesPaise = sumPaise(ds.reservations.filter((r) => r.status === "active").map((r) => r.bookingAmountPaise));
  const assetsPaise = cashPaise + bankPaise + receivablesPaise + stockPaise + advancesPaise;
  const liabilitiesPaise = payablesPaise + loansPaise + customerAdvancesPaise;
  return {
    cashPaise,
    bankPaise,
    receivablesPaise,
    stockPaise,
    advancesPaise,
    payablesPaise,
    loansPaise,
    customerAdvancesPaise,
    assetsPaise,
    liabilitiesPaise,
    netWorthPaise: assetsPaise - liabilitiesPaise,
  };
}

// ─── Parties ───────────────────────────────────────────────────────────────────

export interface PartyLine {
  date: ISODate;
  number: string;
  description: string;
  /** What the party owes the showroom goes up (sale) or down (payment received). */
  debitPaise: Paise;
  creditPaise: Paise;
  href: string | null;
}

export interface Party {
  key: string;
  kind: "buyer" | "seller";
  name: string;
  phone: string;
  /** Buyers: amount billed. Sellers: amount bought for. */
  billedPaise: Paise;
  settledPaise: Paise;
  /** Buyers: still to receive. Sellers: still to pay. */
  balancePaise: Paise;
  lastDate: ISODate;
  lines: PartyLine[];
}

const phoneKey = (phone: string) => phone.replace(/\D/g, "").slice(-10);

/** Buyers (receivable) and sellers (payable), each with a running statement. */
export function parties(ds: Dataset, idx: DatasetIndex): Party[] {
  const result: Party[] = [];

  for (const c of ds.customers) {
    const sales = ds.sales.filter((s) => s.customerId === c.id && s.status === "completed");
    if (sales.length === 0) continue;
    const lines: PartyLine[] = [];
    for (const s of sales) {
      const v = idx.vehicles.get(s.vehicleId);
      lines.push({ date: s.saleDate, number: s.reference, description: `Sale${v ? ` of ${v.year} ${vehicleTitle(v)} ${v.registrationNumber}` : ""}`, debitPaise: s.salePricePaise, creditPaise: 0, href: `/sales/${s.id}` });
      for (const p of idx.paymentsBySale.get(s.id) ?? [])
        lines.push({ date: p.date, number: p.receiptNumber, description: p.kind === "booking" ? "Booking advance" : "Payment received", debitPaise: 0, creditPaise: p.amountPaise, href: `/receipt/${p.id}` });
    }
    lines.sort((a, b) => a.date.localeCompare(b.date));
    const billedPaise = sumPaise(lines.map((l) => l.debitPaise));
    const settledPaise = sumPaise(lines.map((l) => l.creditPaise));
    result.push({ key: `b-${c.id}`, kind: "buyer", name: c.name, phone: c.phone, billedPaise, settledPaise, balancePaise: billedPaise - settledPaise, lastDate: lines.at(-1)?.date ?? "", lines });
  }

  const vouchersByPurchase = new Map<ID, Voucher[]>();
  for (const v of ds.vouchers)
    if (v.status === "active" && v.head === "seller_payment" && v.purchaseId)
      vouchersByPurchase.set(v.purchaseId, [...(vouchersByPurchase.get(v.purchaseId) ?? []), v]);
  const totals = sellerVoucherTotals(ds.vouchers);
  const sellers = new Map<string, Party>();
  for (const p of ds.purchases.filter((x) => x.status === "active")) {
    const key = `s-${phoneKey(p.sellerContact) || p.sellerName.toLowerCase()}`;
    const party = sellers.get(key) ?? { key, kind: "seller" as const, name: p.sellerName, phone: p.sellerContact, billedPaise: 0, settledPaise: 0, balancePaise: 0, lastDate: "", lines: [] };
    const v = idx.vehicles.get(p.vehicleId);
    party.lines.push({ date: p.purchaseDate, number: p.reference, description: `Bought ${v ? `${v.year} ${vehicleTitle(v)} ${v.registrationNumber}` : "car"}`, debitPaise: 0, creditPaise: p.purchasePricePaise, href: `/purchases/${p.id}` });
    const initial = initialPurchasePayment(p, totals);
    if (initial > 0) party.lines.push({ date: p.purchaseDate, number: p.reference, description: "Paid at purchase", debitPaise: initial, creditPaise: 0, href: `/purchases/${p.id}` });
    for (const vch of vouchersByPurchase.get(p.id) ?? [])
      party.lines.push({ date: vch.date, number: vch.number, description: "Payment to seller", debitPaise: vch.amountPaise, creditPaise: 0, href: `/voucher/${vch.id}` });
    sellers.set(key, party);
  }
  for (const party of sellers.values()) {
    party.lines.sort((a, b) => a.date.localeCompare(b.date));
    party.billedPaise = sumPaise(party.lines.map((l) => l.creditPaise));
    party.settledPaise = sumPaise(party.lines.map((l) => l.debitPaise));
    party.balancePaise = party.billedPaise - party.settledPaise;
    party.lastDate = party.lines.at(-1)?.date ?? "";
    result.push(party);
  }

  return result.sort((a, b) => b.lastDate.localeCompare(a.lastDate));
}
