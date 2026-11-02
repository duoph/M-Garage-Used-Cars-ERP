import type {
  AccountKind,
  ID,
  ISODate,
  LedgerEntry,
  LedgerSource,
  MoneyAccount,
  Paise,
  PaymentMethod,
  Purchase,
  Voucher,
  VoucherHead,
} from "@/types";
import { EXPENSE_CATEGORY_LABELS, VOUCHER_HEAD_LABELS, vehicleTitle } from "@/lib/utils/labels";
import { inRange, type DateRange } from "@/lib/utils/dates";
import { formatINR, sumPaise } from "@/lib/utils/money";
import { financePending, landedCost, purchaseBalance, purchaseRefundDue, saleTotals } from "./finance";
import { netSalePrice, saleView, type Dataset, type DatasetIndex } from "./selectors";

/**
 * The cash book.
 *
 * `moneyEntries` holds the posting rules: what every sale payment, booking advance, seller payment,
 * expense, voucher, return refund and loan receipt does to which account. The business commands run
 * these rules inside their own transaction and store the result in the `ledgerEntries` table (see
 * `syncLedger` in lib/services/ledger-posting.ts). Screens and reports read only that stored table —
 * `ds.ledger` — and every balance below is a sum over it.
 */

export type EntrySource = LedgerSource;
export type MoneyEntry = LedgerEntry;

/** Pseudo account for older expenses saved before "Paid from" was required. */
export const UNASSIGNED_ACCOUNT_ID = "unassigned";

/** Heads that count towards profit and loss (the rest are capital, loans, refunds and transfers). */
export const INCOME_HEADS: readonly VoucherHead[] = ["other_income", "commission_received", "service_charges", "misc_receipt"];
export const EXPENSE_HEADS: readonly VoucherHead[] = ["commission_paid", "misc_payment"];

/** Accounts that hold the business's own money (owner drawings and lender receivables are separate). */
export const MONEY_KINDS: readonly AccountKind[] = ["cash", "bank"];

function defaultOf(accounts: readonly MoneyAccount[], kind: AccountKind, branchId?: ID | null): MoneyAccount | undefined {
  const live = accounts.filter((a) => a.kind === kind && !a.archived);
  if (kind === "cash" && branchId) {
    const local = live.filter((a) => a.branchId === branchId);
    const pick = local.find((a) => a.isDefault) ?? local[0];
    if (pick) return pick;
  }
  return live.find((a) => a.isDefault) ?? live[0] ?? accounts.find((a) => a.kind === kind);
}

/** Cash goes to the branch's cash in hand; UPI, cards, cheques and transfers go to the default bank. */
export function accountForMethod(accounts: readonly MoneyAccount[], method: PaymentMethod, branchId?: ID | null): MoneyAccount | undefined {
  return defaultOf(accounts, method === "cash" ? "cash" : "bank", branchId) ?? accounts.find((a) => MONEY_KINDS.includes(a.kind));
}

export function resolveAccountId(accounts: readonly MoneyAccount[], explicit: ID | null | undefined, method: PaymentMethod, branchId?: ID | null): ID {
  if (explicit && accounts.some((a) => a.id === explicit)) return explicit;
  return accountForMethod(accounts, method, branchId)?.id ?? UNASSIGNED_ACCOUNT_ID;
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

const carText = (v: { year: number; make: string; model: string; registrationNumber: string } | undefined) =>
  v ? `${v.year} ${vehicleTitle(v)} ${v.registrationNumber}` : "";

/** The posting rules: every money movement the records imply, oldest first. */
export function moneyEntries(ds: Dataset, idx: DatasetIndex): MoneyEntry[] {
  const accounts = ds.accounts;
  const acc = (explicit: ID | null | undefined, method: PaymentMethod, branchId?: ID | null) => resolveAccountId(accounts, explicit, method, branchId);
  // Cash belongs to the branch whose drawer holds it; other accounts take the branch of the transaction.
  const branchOf = (accountId: ID, fallback: ID | null | undefined): ID | null => idx.accounts.get(accountId)?.branchId ?? fallback ?? null;
  const entries: MoneyEntry[] = [];
  const push = (e: Omit<MoneyEntry, "branchId"> & { branchId?: ID | null }) =>
    entries.push({ ...e, branchId: branchOf(e.accountId, e.branchId) });

  for (const a of accounts) {
    if (a.openingBalancePaise === 0) continue;
    push({
      key: `open-${a.id}`,
      source: "opening",
      date: a.openingDate,
      createdAt: "",
      accountId: a.id,
      branchId: a.branchId,
      direction: a.openingBalancePaise > 0 ? "in" : "out",
      amountPaise: Math.abs(a.openingBalancePaise),
      number: "—",
      typeLabel: "Opening balance",
      party: "",
      particulars: `Opening balance of ${a.name}`,
      method: null,
      handledBy: null,
      enteredBy: null,
      href: null,
    });
  }

  for (const p of ds.payments) {
    const sale = idx.sales.get(p.saleId);
    const vehicle = sale ? idx.vehicles.get(sale.vehicleId) : undefined;
    const customer = sale ? idx.customers.get(sale.customerId) : undefined;
    const finance = p.method === "finance";
    const accountId = acc(p.accountId, p.method, sale?.branchId);
    const particulars = `${sale?.reference ?? ""}${vehicle ? ` · ${carText(vehicle)}` : ""}`;
    push({
      key: `pay-${p.id}`,
      source: "sale_payment",
      date: p.date,
      createdAt: p.createdAt,
      accountId,
      branchId: sale?.branchId,
      direction: "in",
      amountPaise: p.amountPaise,
      number: p.receiptNumber,
      typeLabel: finance ? "Loan due from lender" : p.kind === "booking" ? "Booking advance" : "Sale receipt",
      party: finance ? p.lenderName || customer?.name || "" : customer?.name ?? "",
      particulars: finance ? `${particulars}${p.loanReference ? ` · Loan ${p.loanReference}` : ""} · for ${customer?.name ?? "buyer"}` : particulars,
      method: p.method,
      handledBy: p.receivedBy ?? p.recordedBy,
      enteredBy: p.recordedBy,
      href: sale ? `/sales/${sale.id}` : null,
    });
    // The lender pays the loan into a bank: it leaves the lender's receivable and lands in that account.
    if (finance && p.settledOn && p.settledAccountId) {
      const amount = Math.max(0, p.amountPaise - (p.adjustedPaise ?? 0));
      if (amount > 0) {
        const base = {
          source: "finance_settlement" as const,
          date: p.settledOn,
          createdAt: p.updatedAt,
          branchId: sale?.branchId,
          amountPaise: amount,
          number: p.receiptNumber,
          typeLabel: "Loan received",
          party: p.lenderName ?? "",
          particulars: `${particulars}${p.settledReference ? ` · Ref ${p.settledReference}` : ""}`,
          method: "bank_transfer" as const,
          handledBy: p.settledBy ?? null,
          enteredBy: p.settledBy ?? null,
          href: sale ? `/sales/${sale.id}` : null,
          transfer: true,
        };
        push({ ...base, key: `loan-${p.id}-out`, accountId, direction: "out" });
        push({ ...base, key: `loan-${p.id}-in`, accountId: p.settledAccountId, direction: "in" });
      }
    }
  }

  // Advances on cars still reserved. Once sold they come back as booking payments on the sale.
  for (const r of ds.reservations) {
    if (r.status !== "active" || r.bookingAmountPaise <= 0) continue;
    const vehicle = idx.vehicles.get(r.vehicleId);
    push({
      key: `res-${r.id}`,
      source: "booking",
      date: r.reservationDate,
      createdAt: r.createdAt,
      accountId: acc(null, r.bookingMethod, vehicle?.branchId),
      branchId: vehicle?.branchId,
      direction: "in",
      amountPaise: r.bookingAmountPaise,
      number: r.reference,
      typeLabel: "Booking advance",
      party: idx.customers.get(r.customerId)?.name ?? "",
      particulars: carText(vehicle),
      method: r.bookingMethod,
      handledBy: r.createdBy,
      enteredBy: r.createdBy,
      href: `/inventory/${r.vehicleId}`,
    });
  }

  for (const pp of ds.purchasePayments) {
    const p = idx.purchases.get(pp.purchaseId);
    const vehicle = p ? idx.vehicles.get(p.vehicleId) : undefined;
    push({
      key: `ppy-${pp.id}`,
      source: "purchase_payment",
      date: pp.date,
      createdAt: pp.createdAt,
      accountId: pp.accountId,
      branchId: p?.branchId,
      direction: "out",
      amountPaise: pp.amountPaise,
      number: pp.number,
      typeLabel: pp.kind === "at_purchase" ? "Car purchase" : "Payment to seller",
      party: p?.sellerName ?? "",
      particulars: `${p?.reference ?? ""} · ${carText(vehicle)}${p?.status === "cancelled" ? " (purchase cancelled)" : ""}`,
      method: pp.method,
      handledBy: pp.recordedBy,
      enteredBy: pp.recordedBy,
      href: p ? `/purchases/${p.id}` : null,
    });
  }

  for (const e of ds.expenses) {
    const vehicle = e.vehicleId ? idx.vehicles.get(e.vehicleId) : undefined;
    push({
      key: `exp-${e.id}`,
      source: "expense",
      date: e.date,
      createdAt: e.createdAt,
      // No silent fallback: an expense without "Paid from" stays Unassigned until someone picks the account.
      accountId: e.accountId && idx.accounts.has(e.accountId) ? e.accountId : UNASSIGNED_ACCOUNT_ID,
      branchId: e.branchId,
      direction: "out",
      amountPaise: e.amountPaise,
      number: e.reference,
      typeLabel: EXPENSE_CATEGORY_LABELS[e.category],
      party: e.vendor,
      particulars: `${e.description}${vehicle ? ` · ${vehicleTitle(vehicle)} ${vehicle.registrationNumber}` : ""}`,
      method: e.paymentMethod,
      handledBy: e.createdBy,
      enteredBy: e.createdBy,
      href: `/expenses?expense=${e.id}`,
    });
  }

  for (const v of ds.vouchers) {
    if (v.status !== "active") continue;
    const base = {
      source: "voucher" as const,
      date: v.date,
      createdAt: v.createdAt,
      branchId: v.branchId,
      amountPaise: v.amountPaise,
      number: v.number,
      typeLabel: VOUCHER_HEAD_LABELS[v.head],
      party: v.partyName,
      particulars: v.narration,
      method: v.method,
      handledBy: v.handledBy,
      enteredBy: v.createdBy,
      href: `/voucher/${v.id}`,
      voucherId: v.id,
    };
    if (v.type === "contra") {
      const from = idx.accounts.get(v.accountId);
      const to = v.toAccountId ? idx.accounts.get(v.toAccountId) : undefined;
      const label = to?.kind === "owner" ? "Cash to owner" : from?.kind === "cash" && to?.kind === "bank" ? "Bank deposit" : from?.kind === "bank" && to?.kind === "cash" ? "Bank withdrawal" : "Cash transfer";
      push({ ...base, typeLabel: label, transfer: true, key: `v-${v.id}-out`, accountId: v.accountId, direction: "out", party: to?.name ?? "account", particulars: v.narration || `Moved to ${to?.name ?? "account"}` });
      if (v.toAccountId)
        push({ ...base, typeLabel: label, transfer: true, key: `v-${v.id}-in`, accountId: v.toAccountId, direction: "in", party: from?.name ?? "account", particulars: v.narration || `Moved from ${from?.name ?? "account"}` });
    } else {
      push({ ...base, key: `v-${v.id}`, accountId: v.accountId, direction: v.type === "receipt" ? "in" : "out" });
    }
  }

  for (const r of ds.salesReturns) {
    const sale = idx.sales.get(r.saleId);
    const vehicle = idx.vehicles.get(r.vehicleId);
    const customer = idx.customers.get(r.customerId);
    const line = r.financePaymentId ? ds.payments.find((p) => p.id === r.financePaymentId) : undefined;
    if (line && r.financeAdjustmentPaise > 0)
      push({
        key: `rfa-${r.id}`,
        source: "finance_adjustment",
        date: r.date,
        createdAt: r.createdAt,
        accountId: acc(line.accountId, "finance", r.branchId),
        branchId: r.branchId,
        direction: "out",
        amountPaise: r.financeAdjustmentPaise,
        number: r.number,
        typeLabel: "Loan cancelled on return",
        party: line.lenderName ?? "",
        particulars: `${sale?.reference ?? ""} · ${carText(vehicle)} · for ${customer?.name ?? "buyer"}`,
        method: "finance",
        handledBy: r.createdBy,
        enteredBy: r.createdBy,
        href: `/sales/returns/${r.id}`,
      });
    for (const f of idx.refundsByReturn.get(r.id) ?? [])
      push({
        key: `srf-${f.id}`,
        source: "sales_refund",
        date: f.date,
        createdAt: f.createdAt,
        accountId: f.accountId,
        branchId: r.branchId,
        direction: "out",
        amountPaise: f.amountPaise,
        number: f.number,
        typeLabel: "Sales return refund",
        party: customer?.name ?? "",
        particulars: `${r.number} · ${sale?.reference ?? ""} · ${carText(vehicle)}`,
        method: f.method,
        handledBy: f.recordedBy,
        enteredBy: f.recordedBy,
        href: `/sales/returns/${r.id}`,
      });
  }

  for (const r of ds.purchaseReturns) {
    const p = idx.purchases.get(r.purchaseId);
    const vehicle = idx.vehicles.get(r.vehicleId);
    for (const f of idx.refundsByReturn.get(r.id) ?? [])
      push({
        key: `prf-${f.id}`,
        source: "purchase_refund",
        date: f.date,
        createdAt: f.createdAt,
        accountId: f.accountId,
        branchId: r.branchId,
        direction: "in",
        amountPaise: f.amountPaise,
        number: f.number,
        typeLabel: "Purchase return refund",
        party: r.sellerName,
        particulars: `${r.number} · ${p?.reference ?? ""} · ${carText(vehicle)}`,
        method: f.method,
        handledBy: f.recordedBy,
        enteredBy: f.recordedBy,
        href: `/purchases/returns/${r.id}`,
      });
  }

  return entries.sort(compareEntries);
}

export function compareEntries(a: MoneyEntry, b: MoneyEntry): number {
  return a.date.localeCompare(b.date) || (a.source === "opening" ? -1 : b.source === "opening" ? 1 : 0) || a.createdAt.localeCompare(b.createdAt) || a.key.localeCompare(b.key);
}

export const signed = (e: MoneyEntry): Paise => (e.direction === "in" ? e.amountPaise : -e.amountPaise);

/** Entries visible under a branch filter: null = all branches. */
export function entriesForBranches(entries: readonly MoneyEntry[], branchIds: readonly ID[] | null): MoneyEntry[] {
  if (!branchIds) return entries as MoneyEntry[];
  return entries.filter((e) => e.branchId !== null && branchIds.includes(e.branchId));
}

export interface AccountSummary {
  account: MoneyAccount;
  inPaise: Paise;
  outPaise: Paise;
  balancePaise: Paise;
}

/** Shown wherever older expenses still have no "Paid from" account. */
export function unassignedAccount(): MoneyAccount {
  return {
    id: UNASSIGNED_ACCOUNT_ID, name: "Unassigned", kind: "cash", bankName: "", accountNumber: "", ifsc: "", upiId: "", custodianId: null,
    openingBalancePaise: 0, openingDate: "", isDefault: false, archived: false, notes: "Expenses saved before “Paid from” was required", branchId: null,
    createdAt: "", updatedAt: "",
  };
}

export function accountSummaries(accounts: readonly MoneyAccount[], entries: readonly MoneyEntry[], upTo?: ISODate): AccountSummary[] {
  const totals = new Map<ID, { in: Paise; out: Paise }>();
  for (const e of entries) {
    if (upTo && e.date > upTo) continue;
    const t = totals.get(e.accountId) ?? { in: 0, out: 0 };
    if (e.direction === "in") t.in += e.amountPaise;
    else t.out += e.amountPaise;
    totals.set(e.accountId, t);
  }
  const list = [...accounts];
  if (totals.has(UNASSIGNED_ACCOUNT_ID) && !list.some((a) => a.id === UNASSIGNED_ACCOUNT_ID)) list.push(unassignedAccount());
  return list.map((account) => {
    const t = totals.get(account.id) ?? { in: 0, out: 0 };
    return { account, inPaise: t.in, outPaise: t.out, balancePaise: t.in - t.out };
  });
}

/** Ledger rows of one account (or all) within a range, with the balance carried in and after each row. */
export function runningLedger(entries: readonly MoneyEntry[], range: Pick<DateRange, "from" | "to">, accountId?: ID | readonly ID[]) {
  const ids = accountId === undefined ? null : typeof accountId === "string" ? [accountId] : accountId;
  const own = ids ? entries.filter((e) => ids.includes(e.accountId)) : entries;
  // Opening balance on the From date = everything posted before it.
  const opening = sumPaise(own.filter((e) => range.from && e.date < range.from).map(signed));
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
 * is never an expense. Sales are net of returns; a car that came back is stock again and carries no cost.
 * Showroom running costs and voucher income/expense heads fall in the period they occur.
 */
export function profitAndLoss(ds: Dataset, idx: DatasetIndex, range: Pick<DateRange, "from" | "to">): ProfitAndLoss {
  const sold = ds.sales.filter((s) => s.status === "completed" && inRange(s.saleDate, range)).map((s) => saleView(s, idx));
  const kept = sold.filter((s) => s.sale.returnStatus !== "returned");
  const salesPaise = sumPaise(sold.map((s) => netSalePrice(s.sale)));
  const purchaseCostPaise = sumPaise(kept.map((s) => s.purchasePricePaise));
  const reconditioningPaise = sumPaise(kept.map((s) => s.vehicleExpensesPaise));
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
    carsSold: kept.length,
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
  /** Loans still due from lenders on financed sales. */
  financeReceivablePaise: Paise;
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
  const ofKind = (k: AccountKind) => sumPaise(balances.filter((b) => b.account.kind === k && b.account.id !== UNASSIGNED_ACCOUNT_ID).map((b) => b.balancePaise));
  const unassigned = balances.find((b) => b.account.id === UNASSIGNED_ACCOUNT_ID)?.balancePaise ?? 0;
  // Unassigned expenses were paid from somewhere; count them against cash until they are assigned.
  const cashPaise = ofKind("cash") + unassigned;
  const bankPaise = ofKind("bank");
  const financeReceivablePaise = ofKind("finance");
  const completed = ds.sales.filter((s) => s.status === "completed").map((s) => saleTotals(s, idx.paymentsBySale.get(s.id) ?? []));
  const activePurchases = ds.purchases.filter((p) => p.status === "active");
  const receivablesPaise = sumPaise(completed.map((t) => t.balancePaise)) + sumPaise(activePurchases.map(purchaseRefundDue));
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
  const payablesPaise = sumPaise(activePurchases.map(purchaseBalance)) + sumPaise(completed.map((t) => t.refundDuePaise));
  const loansPaise = Math.max(0, total("loan_received") - total("loan_repayment"));
  const customerAdvancesPaise = sumPaise(ds.reservations.filter((r) => r.status === "active").map((r) => r.bookingAmountPaise));
  const assetsPaise = cashPaise + bankPaise + receivablesPaise + financeReceivablePaise + stockPaise + advancesPaise;
  const liabilitiesPaise = payablesPaise + loansPaise + customerAdvancesPaise;
  return {
    cashPaise,
    bankPaise,
    receivablesPaise,
    financeReceivablePaise,
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
  /** Buyers: still to receive. Sellers: still to pay. Negative = the other way round (a refund is due). */
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
      lines.push({ date: s.saleDate, number: s.reference, description: `Sale${v ? ` of ${carText(v)}` : ""}`, debitPaise: s.salePricePaise, creditPaise: 0, href: `/sales/${s.id}` });
      for (const p of idx.paymentsBySale.get(s.id) ?? [])
        lines.push({
          date: p.date,
          number: p.receiptNumber,
          description: p.method === "finance" ? `Loan from ${p.lenderName || "lender"}` : p.kind === "booking" ? "Booking advance" : "Payment received",
          debitPaise: 0,
          creditPaise: p.amountPaise,
          href: `/receipt/${p.id}`,
        });
      for (const r of idx.salesReturnsBySale.get(s.id) ?? []) {
        lines.push({ date: r.date, number: r.number, description: `Sales return${r.deductionPaise ? ` (less ${formatINR(r.deductionPaise)} charges)` : ""}`, debitPaise: 0, creditPaise: r.returnAmountPaise - r.deductionPaise, href: `/sales/returns/${r.id}` });
        if (r.financeAdjustmentPaise > 0)
          lines.push({ date: r.date, number: r.number, description: "Loan cancelled with the lender", debitPaise: r.financeAdjustmentPaise, creditPaise: 0, href: `/sales/returns/${r.id}` });
        for (const f of idx.refundsByReturn.get(r.id) ?? [])
          lines.push({ date: f.date, number: f.number, description: "Refund paid", debitPaise: f.amountPaise, creditPaise: 0, href: `/sales/returns/${r.id}` });
      }
    }
    lines.sort((a, b) => a.date.localeCompare(b.date));
    const billedPaise = sumPaise(lines.map((l) => l.debitPaise));
    const settledPaise = sumPaise(lines.map((l) => l.creditPaise));
    result.push({ key: `b-${c.id}`, kind: "buyer", name: c.name, phone: c.phone, billedPaise, settledPaise, balancePaise: billedPaise - settledPaise, lastDate: lines.at(-1)?.date ?? "", lines });
  }

  const sellers = new Map<string, Party>();
  for (const p of ds.purchases.filter((x) => x.status === "active")) {
    const key = `s-${phoneKey(p.sellerContact) || p.sellerName.toLowerCase()}`;
    const party = sellers.get(key) ?? { key, kind: "seller" as const, name: p.sellerName, phone: p.sellerContact, billedPaise: 0, settledPaise: 0, balancePaise: 0, lastDate: "", lines: [] };
    const v = idx.vehicles.get(p.vehicleId);
    party.lines.push({ date: p.purchaseDate, number: p.reference, description: `Bought ${v ? carText(v) : "car"}`, debitPaise: 0, creditPaise: p.purchasePricePaise, href: `/purchases/${p.id}` });
    for (const pp of idx.purchasePaymentsByPurchase.get(p.id) ?? [])
      party.lines.push({ date: pp.date, number: pp.number, description: pp.kind === "at_purchase" ? "Paid at purchase" : "Payment to seller", debitPaise: pp.amountPaise, creditPaise: 0, href: `/purchases/${p.id}` });
    for (const vch of ds.vouchers)
      if (vch.status === "active" && vch.head === "seller_payment" && vch.purchaseId === p.id)
        party.lines.push({ date: vch.date, number: vch.number, description: "Payment to seller", debitPaise: vch.amountPaise, creditPaise: 0, href: `/voucher/${vch.id}` });
    for (const r of idx.purchaseReturnsByPurchase.get(p.id) ?? []) {
      party.lines.push({ date: r.date, number: r.number, description: "Purchase return", debitPaise: r.returnAmountPaise - r.deductionPaise, creditPaise: 0, href: `/purchases/returns/${r.id}` });
      for (const f of idx.refundsByReturn.get(r.id) ?? [])
        party.lines.push({ date: f.date, number: f.number, description: "Refund received", debitPaise: 0, creditPaise: f.amountPaise, href: `/purchases/returns/${r.id}` });
    }
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

export { financePending };
