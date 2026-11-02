import { addDays, addMonths, addWeeks, format, parseISO, startOfWeek, subDays } from "date-fns";
import type { AccountKind, ID, ISODate, MoneyAccount, Paise, PaymentMethod, Purchase, Sale } from "@/types";
import { EXPENSE_CATEGORY_LABELS, PAYMENT_METHOD_LABELS, VOUCHER_HEAD_LABELS, vehicleTitle } from "@/lib/utils/labels";
import { daysSince, inRange, type DateRange } from "@/lib/utils/dates";
import { sumPaise } from "@/lib/utils/money";
import { accountSummaries, entriesForBranches, runningLedger, type MoneyEntry } from "./ledger";
import { refundState } from "./returns";
import { purchaseBalance, purchaseRefundDue, saleTotals } from "./finance";
import type { Dataset, DatasetIndex } from "./selectors";

/**
 * Money reports. Balances and every cash / bank / payment figure come from the stored ledger
 * (`ds.ledger`); sales, purchases and returns lists come from their records. Nothing is recomputed per
 * report beyond filtering by period and branch.
 */

type Range = Pick<DateRange, "from" | "to">;
const branchOk = (b: ID | null | undefined, ids: readonly ID[] | null) => !ids || !b || ids.includes(b);
const car = (v: { year: number; make: string; model: string; registrationNumber: string } | undefined) => (v ? `${v.year} ${vehicleTitle(v)} · ${v.registrationNumber}` : "—");

// ─── a) Sales ──────────────────────────────────────────────────────────────────

export function salesReport(ds: Dataset, idx: DatasetIndex, range: Range, branchIds: readonly ID[] | null) {
  const rows = ds.sales
    .filter((s) => s.status === "completed" && inRange(s.saleDate, range) && branchOk(s.branchId, branchIds))
    .sort((a, b) => a.saleDate.localeCompare(b.saleDate) || a.reference.localeCompare(b.reference))
    .map((sale) => {
      const payments = idx.paymentsBySale.get(sale.id) ?? [];
      const t = saleTotals(sale, payments);
      return {
        sale,
        customer: idx.customers.get(sale.customerId)?.name ?? "—",
        vehicle: car(idx.vehicles.get(sale.vehicleId)),
        amountPaise: sale.salePricePaise,
        receivedPaise: t.receivedPaise,
        duePaise: t.balancePaise,
        modes: [...new Set(payments.map((p) => PAYMENT_METHOD_LABELS[p.method]))].join(", "),
        payments,
      };
    });
  const byMode = new Map<PaymentMethod, Paise>();
  for (const r of rows) for (const p of r.payments) byMode.set(p.method, (byMode.get(p.method) ?? 0) + p.amountPaise);
  return {
    rows,
    grossPaise: sumPaise(rows.map((r) => r.amountPaise)),
    receivedPaise: sumPaise(rows.map((r) => r.receivedPaise)),
    duePaise: sumPaise(rows.map((r) => r.duePaise)),
    byMode: [...byMode.entries()].map(([method, amountPaise]) => ({ method, amountPaise })).sort((a, b) => b.amountPaise - a.amountPaise),
  };
}

// ─── b, d) Returns ─────────────────────────────────────────────────────────────

function refundModes(ds: Dataset, idx: DatasetIndex, returnId: ID) {
  return (idx.refundsByReturn.get(returnId) ?? [])
    .map((f) => `${PAYMENT_METHOD_LABELS[f.method]} → ${ds.accounts.find((a) => a.id === f.accountId)?.name ?? "—"}`)
    .join(", ");
}

export function salesReturnReport(ds: Dataset, idx: DatasetIndex, range: Range, branchIds: readonly ID[] | null) {
  const rows = ds.salesReturns
    .filter((r) => inRange(r.date, range) && branchOk(r.branchId, branchIds))
    .sort((a, b) => a.date.localeCompare(b.date) || a.number.localeCompare(b.number))
    .map((ret) => {
      const state = refundState(ret, idx.refundsByReturn);
      return {
        ret,
        invoice: idx.sales.get(ret.saleId)?.reference ?? "—",
        customer: idx.customers.get(ret.customerId)?.name ?? "—",
        vehicle: car(idx.vehicles.get(ret.vehicleId)),
        paidPaise: state.paidPaise,
        pendingPaise: state.pendingPaise,
        modes: refundModes(ds, idx, ret.id) || (ret.financeAdjustmentPaise > 0 ? "Loan adjusted" : "—"),
      };
    });
  const returnsPaise = sumPaise(rows.map((r) => r.ret.returnAmountPaise));
  const salesPaise = salesReport(ds, idx, range, branchIds).grossPaise;
  return {
    rows,
    returnsPaise,
    deductionsPaise: sumPaise(rows.map((r) => r.ret.deductionPaise)),
    paidPaise: sumPaise(rows.map((r) => r.paidPaise)),
    pendingPaise: sumPaise(rows.map((r) => r.pendingPaise)),
    salesPaise,
    netSalesPaise: salesPaise - returnsPaise,
  };
}

// ─── c) Purchases ──────────────────────────────────────────────────────────────

export function purchaseReport(ds: Dataset, idx: DatasetIndex, range: Range, branchIds: readonly ID[] | null) {
  const rows = ds.purchases
    .filter((p) => p.status === "active" && inRange(p.purchaseDate, range) && branchOk(p.branchId, branchIds))
    .sort((a, b) => a.purchaseDate.localeCompare(b.purchaseDate) || a.reference.localeCompare(b.reference))
    .map((purchase) => ({
      purchase,
      vehicle: car(idx.vehicles.get(purchase.vehicleId)),
      amountPaise: purchase.purchasePricePaise,
      paidPaise: purchase.amountPaidPaise,
      payablePaise: purchaseBalance(purchase),
    }));
  return {
    rows,
    amountPaise: sumPaise(rows.map((r) => r.amountPaise)),
    paidPaise: sumPaise(rows.map((r) => r.paidPaise)),
    payablePaise: sumPaise(rows.map((r) => r.payablePaise)),
  };
}

export function purchaseReturnReport(ds: Dataset, idx: DatasetIndex, range: Range, branchIds: readonly ID[] | null) {
  const rows = ds.purchaseReturns
    .filter((r) => inRange(r.date, range) && branchOk(r.branchId, branchIds))
    .sort((a, b) => a.date.localeCompare(b.date) || a.number.localeCompare(b.number))
    .map((ret) => {
      const state = refundState(ret, idx.refundsByReturn);
      return {
        ret,
        original: idx.purchases.get(ret.purchaseId)?.reference ?? "—",
        vehicle: car(idx.vehicles.get(ret.vehicleId)),
        receivedPaise: state.paidPaise,
        pendingPaise: state.pendingPaise,
        modes: refundModes(ds, idx, ret.id) || "—",
      };
    });
  const returnsPaise = sumPaise(rows.map((r) => r.ret.returnAmountPaise));
  const purchasesPaise = purchaseReport(ds, idx, range, branchIds).amountPaise;
  return {
    rows,
    returnsPaise,
    deductionsPaise: sumPaise(rows.map((r) => r.ret.deductionPaise)),
    receivedPaise: sumPaise(rows.map((r) => r.receivedPaise)),
    pendingPaise: sumPaise(rows.map((r) => r.pendingPaise)),
    purchasesPaise,
    netPurchasesPaise: purchasesPaise - returnsPaise,
  };
}

// ─── e, f) Cash in hand, cash in bank ─────────────────────────────────────────

/** Opening on the From date, every movement with a running balance, and the closing on the To date. */
export function accountStatement(ledger: readonly MoneyEntry[], range: Range, accountIds: readonly ID[]) {
  return runningLedger(ledger, range, accountIds);
}

export function cashInHandReport(ds: Dataset, range: Range, branchIds: readonly ID[] | null) {
  const branches = ds.branches.filter((b) => !branchIds || branchIds.includes(b.id));
  const sections = branches
    .map((branch) => {
      const ids = ds.accounts.filter((a) => a.kind === "cash" && a.branchId === branch.id).map((a) => a.id);
      return { branch, accountIds: ids, ...accountStatement(ds.ledger, range, ids) };
    })
    .filter((s) => s.accountIds.length > 0);
  return {
    sections,
    openingPaise: sumPaise(sections.map((s) => s.openingPaise)),
    inPaise: sumPaise(sections.map((s) => s.inPaise)),
    outPaise: sumPaise(sections.map((s) => s.outPaise)),
    closingPaise: sumPaise(sections.map((s) => s.closingPaise)),
  };
}

export function bankSummary(ds: Dataset, range: Range, branchIds: readonly ID[] | null) {
  const ledger = entriesForBranches(ds.ledger, branchIds);
  return ds.accounts
    .filter((a) => a.kind === "bank")
    .map((account) => ({ account, ...accountStatement(ledger, range, [account.id]) }))
    .filter((r) => !r.account.archived || r.openingPaise !== 0 || r.rows.length > 0);
}

// ─── g) Payments & expenses ────────────────────────────────────────────────────

export interface OutgoingRow {
  entry: MoneyEntry;
  category: string;
  account: string;
}

/** Every rupee paid out: supplier payments, expenses, refunds, cash handed to the owner and other payments. */
export function paymentsReport(ds: Dataset, idx: DatasetIndex, range: Range, branchIds: readonly ID[] | null) {
  const ledger = entriesForBranches(ds.ledger, branchIds);
  const rows: OutgoingRow[] = [];
  for (const e of ledger) {
    if (e.direction !== "out" || e.source === "opening" || !inRange(e.date, range)) continue;
    let category: string | null = null;
    if (e.source === "purchase_payment") category = "Supplier payments";
    else if (e.source === "expense") {
      const exp = ds.expenses.find((x) => `exp-${x.id}` === e.key);
      category = `Expense · ${exp ? EXPENSE_CATEGORY_LABELS[exp.category] : e.typeLabel}`;
    } else if (e.source === "sales_refund") category = "Sales return refunds";
    else if (e.source === "voucher" && !e.transfer) {
      const v = e.voucherId ? ds.vouchers.find((x) => x.id === e.voucherId) : undefined;
      category = v?.head === "seller_payment" ? "Supplier payments" : v?.head === "owner_drawings" ? "Cash paid to owner" : v ? VOUCHER_HEAD_LABELS[v.head] : "Other payments";
    } else if (e.source === "voucher" && e.transfer) {
      // Only hand-overs to the owner leave the business; deposits and branch transfers don't.
      const v = e.voucherId ? ds.vouchers.find((x) => x.id === e.voucherId) : undefined;
      if (v?.toAccountId && idx.accounts.get(v.toAccountId)?.kind === "owner") category = "Cash paid to owner";
    }
    if (!category) continue;
    rows.push({ entry: e, category, account: idx.accounts.get(e.accountId)?.name ?? (e.accountId === "unassigned" ? "Unassigned" : "—") });
  }
  const group = (key: (r: OutgoingRow) => string) => {
    const m = new Map<string, Paise>();
    for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + r.entry.amountPaise);
    return [...m.entries()].map(([label, amountPaise]) => ({ label, amountPaise })).sort((a, b) => b.amountPaise - a.amountPaise);
  };
  return { rows, byCategory: group((r) => r.category), byAccount: group((r) => r.account), totalPaise: sumPaise(rows.map((r) => r.entry.amountPaise)) };
}

// ─── h) Payables & receivables ─────────────────────────────────────────────────

export interface DueRow {
  side: "receivable" | "payable";
  kind: string;
  party: string;
  reference: string;
  date: ISODate;
  totalPaise: Paise;
  settledPaise: Paise;
  outstandingPaise: Paise;
  daysPending: number;
  href: string;
}

const upTo = (d: ISODate, asOf: ISODate) => d <= asOf;

/**
 * What the showroom should get and what it owes, as of a date: buyer balances, loans pending from lenders,
 * refunds due from sellers; seller balances, refunds due to buyers and loans taken. `created` limits which
 * transactions are listed (by their original date).
 */
export function duesReport(ds: Dataset, idx: DatasetIndex, asOf: ISODate, created: Range, branchIds: readonly ID[] | null) {
  const rows: DueRow[] = [];
  const asOfDate = new Date(`${asOf}T00:00:00`);
  const days = (d: ISODate) => daysSince(d, asOfDate);

  for (const sale of ds.sales) {
    if (sale.status !== "completed" || !upTo(sale.saleDate, asOf) || !inRange(sale.saleDate, created) || !branchOk(sale.branchId, branchIds)) continue;
    const payments = (idx.paymentsBySale.get(sale.id) ?? []).filter((p) => upTo(p.date, asOf));
    const returns = (idx.salesReturnsBySale.get(sale.id) ?? []).filter((r) => upTo(r.date, asOf));
    const refunds = returns.flatMap((r) => idx.refundsByReturn.get(r.id) ?? []).filter((f) => upTo(f.date, asOf));
    const asAt: Sale = {
      ...sale,
      returnedPaise: sumPaise(returns.map((r) => r.returnAmountPaise - r.deductionPaise)),
      financeAdjustedPaise: sumPaise(returns.map((r) => r.financeAdjustmentPaise)),
      refundedPaise: sumPaise(refunds.map((f) => f.amountPaise)),
    };
    const t = saleTotals(asAt, payments);
    const customer = idx.customers.get(sale.customerId)?.name ?? "Buyer";
    const href = `/sales/${sale.id}`;
    if (t.balancePaise > 0)
      rows.push({ side: "receivable", kind: "Buyer balance", party: customer, reference: sale.reference, date: sale.saleDate, totalPaise: t.netPricePaise, settledPaise: t.netPricePaise - t.balancePaise, outstandingPaise: t.balancePaise, daysPending: days(sale.saleDate), href });
    if (t.refundDuePaise > 0)
      rows.push({ side: "payable", kind: "Refund due to buyer", party: customer, reference: returns.map((r) => r.number).join(", ") || sale.reference, date: returns[0]?.date ?? sale.saleDate, totalPaise: t.refundDuePaise + sumPaise(refunds.map((f) => f.amountPaise)), settledPaise: sumPaise(refunds.map((f) => f.amountPaise)), outstandingPaise: t.refundDuePaise, daysPending: days(returns[0]?.date ?? sale.saleDate), href: returns[0] ? `/sales/returns/${returns[0].id}` : href });
    for (const p of payments) {
      if (p.method !== "finance") continue;
      const adjusted = sumPaise(returns.filter((r) => r.financePaymentId === p.id).map((r) => r.financeAdjustmentPaise));
      const received = p.settledOn && upTo(p.settledOn, asOf) ? p.amountPaise - (p.adjustedPaise ?? 0) : 0;
      const pending = Math.max(0, p.amountPaise - adjusted - received);
      if (pending > 0)
        rows.push({ side: "receivable", kind: "Loan pending from lender", party: p.lenderName || "Lender", reference: `${sale.reference}${p.loanReference ? ` · ${p.loanReference}` : ""}`, date: p.date, totalPaise: p.amountPaise - adjusted, settledPaise: received, outstandingPaise: pending, daysPending: days(p.date), href });
    }
  }

  for (const purchase of ds.purchases) {
    if (purchase.status !== "active" || !upTo(purchase.purchaseDate, asOf) || !inRange(purchase.purchaseDate, created) || !branchOk(purchase.branchId, branchIds)) continue;
    const paid =
      sumPaise((idx.purchasePaymentsByPurchase.get(purchase.id) ?? []).filter((p) => upTo(p.date, asOf)).map((p) => p.amountPaise)) +
      sumPaise(ds.vouchers.filter((v) => v.status === "active" && v.head === "seller_payment" && v.purchaseId === purchase.id && upTo(v.date, asOf)).map((v) => v.amountPaise));
    const returns = (idx.purchaseReturnsByPurchase.get(purchase.id) ?? []).filter((r) => upTo(r.date, asOf));
    const refunds = returns.flatMap((r) => idx.refundsByReturn.get(r.id) ?? []).filter((f) => upTo(f.date, asOf));
    const asAt: Purchase = {
      ...purchase,
      amountPaidPaise: paid,
      returnedPaise: sumPaise(returns.map((r) => r.returnAmountPaise - r.deductionPaise)),
      refundReceivedPaise: sumPaise(refunds.map((f) => f.amountPaise)),
    };
    const balance = purchaseBalance(asAt);
    const refundDue = purchaseRefundDue(asAt);
    const net = purchase.purchasePricePaise - (asAt.returnedPaise ?? 0);
    if (balance > 0)
      rows.push({ side: "payable", kind: "Seller balance", party: purchase.sellerName, reference: purchase.reference, date: purchase.purchaseDate, totalPaise: net, settledPaise: net - balance, outstandingPaise: balance, daysPending: days(purchase.purchaseDate), href: `/purchases/${purchase.id}` });
    if (refundDue > 0) {
      const received = sumPaise(refunds.map((f) => f.amountPaise));
      rows.push({ side: "receivable", kind: "Refund due from seller", party: purchase.sellerName, reference: returns.map((r) => r.number).join(", "), date: returns[0]?.date ?? purchase.purchaseDate, totalPaise: refundDue + received, settledPaise: received, outstandingPaise: refundDue, daysPending: days(returns[0]?.date ?? purchase.purchaseDate), href: returns[0] ? `/purchases/returns/${returns[0].id}` : `/purchases/${purchase.id}` });
    }
  }

  // Other dues: loans the showroom has taken and not yet repaid.
  const loanVouchers = ds.vouchers.filter((v) => v.status === "active" && (v.head === "loan_received" || v.head === "loan_repayment") && upTo(v.date, asOf) && branchOk(v.branchId, branchIds));
  const lenders = new Map<string, { in: Paise; out: Paise; first: ISODate; number: string }>();
  for (const v of loanVouchers) {
    const key = v.partyName || "Lender";
    const l = lenders.get(key) ?? { in: 0, out: 0, first: v.date, number: v.number };
    if (v.head === "loan_received") l.in += v.amountPaise;
    else l.out += v.amountPaise;
    if (v.date < l.first) l.first = v.date;
    lenders.set(key, l);
  }
  for (const [party, l] of lenders)
    if (l.in - l.out > 0 && inRange(l.first, created))
      rows.push({ side: "payable", kind: "Loan taken", party, reference: l.number, date: l.first, totalPaise: l.in, settledPaise: l.out, outstandingPaise: l.in - l.out, daysPending: days(l.first), href: "/accounts/receipts" });

  rows.sort((a, b) => a.side.localeCompare(b.side) || a.party.localeCompare(b.party) || a.date.localeCompare(b.date));
  const partyTotals = (side: DueRow["side"]) => {
    const m = new Map<string, Paise>();
    for (const r of rows.filter((x) => x.side === side)) m.set(r.party, (m.get(r.party) ?? 0) + r.outstandingPaise);
    return [...m.entries()].map(([party, amountPaise]) => ({ party, amountPaise })).sort((a, b) => b.amountPaise - a.amountPaise);
  };
  const receivablePaise = sumPaise(rows.filter((r) => r.side === "receivable").map((r) => r.outstandingPaise));
  const payablePaise = sumPaise(rows.filter((r) => r.side === "payable").map((r) => r.outstandingPaise));
  return { rows, receivablePaise, payablePaise, netPaise: receivablePaise - payablePaise, partyTotals };
}

// ─── j) Date-wise summary ──────────────────────────────────────────────────────

export type DateGrouping = "day" | "week" | "month";

export interface DateWiseRow {
  /** First day of the period. */
  key: ISODate;
  /** Last day of the period, clipped to the range. */
  end: ISODate;
  carsSold: number;
  salesPaise: Paise;
  returnsPaise: Paise;
  carsBought: number;
  purchasesPaise: Paise;
  expensesPaise: Paise;
  /** Ledger money in / out, excluding opening balances and transfers between own accounts (as the Day Book). */
  inPaise: Paise;
  outPaise: Paise;
}

function periodStart(d: ISODate, by: DateGrouping): ISODate {
  if (by === "day") return d;
  if (by === "month") return `${d.slice(0, 7)}-01`;
  // Indian business week starts on Monday.
  return format(startOfWeek(parseISO(d), { weekStartsOn: 1 }), "yyyy-MM-dd");
}

function nextPeriod(d: ISODate, by: DateGrouping): ISODate {
  const date = parseISO(d);
  return format(by === "day" ? addDays(date, 1) : by === "week" ? addWeeks(date, 1) : addMonths(date, 1), "yyyy-MM-dd");
}

/**
 * Sales, returns, purchases, expenses and money in / out per day, week or month. Periods with no activity
 * are listed too (unless `skipEmpty`), from the range start (or first activity) to its end (or today).
 */
export function dateWiseReport(ds: Dataset, range: Range, branchIds: readonly ID[] | null, by: DateGrouping, skipEmpty: boolean) {
  const map = new Map<ISODate, DateWiseRow>();
  const bucket = (date: ISODate) => {
    const key = periodStart(date.slice(0, 10), by);
    let row = map.get(key);
    if (!row) {
      row = { key, end: key, carsSold: 0, salesPaise: 0, returnsPaise: 0, carsBought: 0, purchasesPaise: 0, expensesPaise: 0, inPaise: 0, outPaise: 0 };
      map.set(key, row);
    }
    return row;
  };
  const dates: ISODate[] = [];
  const take = (date: ISODate, branchId: ID | null | undefined) => {
    if (!inRange(date, range) || !branchOk(branchId, branchIds)) return null;
    dates.push(date.slice(0, 10));
    return bucket(date);
  };

  for (const s of ds.sales) {
    if (s.status !== "completed") continue;
    const row = take(s.saleDate, s.branchId);
    if (row) { row.carsSold += 1; row.salesPaise += s.salePricePaise; }
  }
  for (const r of ds.salesReturns) {
    const row = take(r.date, r.branchId);
    if (row) row.returnsPaise += r.returnAmountPaise;
  }
  for (const p of ds.purchases) {
    if (p.status !== "active") continue;
    const row = take(p.purchaseDate, p.branchId);
    if (row) { row.carsBought += 1; row.purchasesPaise += p.purchasePricePaise; }
  }
  for (const e of ds.expenses) {
    const row = take(e.date, e.branchId);
    if (row) row.expensesPaise += e.amountPaise;
  }
  for (const e of entriesForBranches(ds.ledger, branchIds)) {
    if (e.source === "opening" || e.transfer) continue;
    const row = take(e.date, null);
    if (!row) continue;
    if (e.direction === "in") row.inPaise += e.amountPaise;
    else row.outPaise += e.amountPaise;
  }

  // Fill the gaps so every day / week / month in the range shows, even when nothing happened.
  if (!skipEmpty && dates.length + (range.from ? 1 : 0) > 0) {
    const sorted = [...dates].sort();
    const today = format(new Date(), "yyyy-MM-dd");
    const first = range.from ?? sorted[0];
    const lastActivity = sorted.at(-1) ?? first;
    // Ranges that run into the future ("This month") stop at today, unless something is dated later.
    const end = range.to ?? today;
    const last = end > today ? (lastActivity > today ? lastActivity : today) : end;
    let cursor = periodStart(first, by);
    // A guard so an "All time" daily view of many years can't build thousands of empty rows.
    for (let n = 0; cursor <= last && n < 3700; n++, cursor = nextPeriod(cursor, by)) bucket(cursor);
  }

  const rows = [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
  for (const r of rows) {
    const end = by === "day" ? r.key : format(subDays(parseISO(nextPeriod(r.key, by)), 1), "yyyy-MM-dd");
    r.end = range.to && end > range.to ? range.to : end;
    if (range.from && r.key < range.from) r.key = range.from;
  }
  const total = (k: keyof Omit<DateWiseRow, "key" | "end">) => rows.reduce((s, r) => s + r[k], 0);
  return {
    rows,
    carsSold: total("carsSold"),
    salesPaise: total("salesPaise"),
    returnsPaise: total("returnsPaise"),
    carsBought: total("carsBought"),
    purchasesPaise: total("purchasesPaise"),
    expensesPaise: total("expensesPaise"),
    inPaise: total("inPaise"),
    outPaise: total("outPaise"),
    activeDays: new Set(dates).size,
  };
}

// ─── i) Account balance summary ────────────────────────────────────────────────

export const KIND_GROUP_LABELS: Record<AccountKind, string> = {
  cash: "Cash in hand",
  bank: "Bank accounts",
  finance: "Loans pending from lenders",
  owner: "With the owner",
};

/** Where all the money is, as of a date: each branch's cash, each bank, lender receivables and the owner. */
export function balanceSummary(ds: Dataset, asOf: ISODate, branchIds: readonly ID[] | null) {
  const ledger = entriesForBranches(ds.ledger, branchIds);
  const accounts: MoneyAccount[] = ds.accounts.filter((a) => a.kind !== "cash" || branchOk(a.branchId, branchIds));
  const summaries = accountSummaries(accounts, ledger, asOf).filter((s) => !s.account.archived || s.balancePaise !== 0);
  const total = (kinds: AccountKind[]) => sumPaise(summaries.filter((s) => kinds.includes(s.account.kind)).map((s) => s.balancePaise));
  return {
    summaries,
    cashPaise: total(["cash"]),
    bankPaise: total(["bank"]),
    financePaise: total(["finance"]),
    ownerPaise: total(["owner"]),
    /** The business's money: cash + bank + loans still to come in. */
    grandTotalPaise: total(["cash", "bank", "finance"]),
  };
}

