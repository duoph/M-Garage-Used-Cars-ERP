"use client";
import * as React from "react";
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight } from "lucide-react";
import { toast } from "sonner";
import { useData } from "@/components/providers/data-provider";
import { useAuth, useCurrentUser } from "@/hooks/use-auth";
import { useDialogStore } from "@/lib/store/dialogs";
import { dealerService } from "@/lib/services/dealer-service";
import { reportError } from "@/hooks/use-commands";
import { BusinessError } from "@/lib/repositories/contracts";
import { purchaseBalance, saleTotals } from "@/lib/calculations/finance";
import { resolveAccountId } from "@/lib/calculations/ledger";
import { PAYMENT_HEADS, PAYMENT_METHODS, RECEIPT_HEADS, type PaymentMethod, type VoucherType } from "@/types";
import { PAYMENT_METHOD_LABELS, VOUCHER_HEAD_LABELS, vehicleTitle } from "@/lib/utils/labels";
import { todayISO } from "@/lib/utils/dates";
import { formatINR } from "@/lib/utils/money";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/shared/form-field";
import { CurrencyInput } from "@/components/shared/currency-input";
import { DateField } from "@/components/shared/date-field";
import { AccountSelect, StaffSelect, useMoneyBook } from "./shared";

/** Receipt against a sale is recorded as a sale payment, so the buyer's balance and receipt stay in one place. */
const SALE_HEAD = "sale_payment";

const TYPES: { type: VoucherType; label: string; icon: typeof ArrowDownLeft; hint: string }[] = [
  { type: "receipt", label: "Receipt", icon: ArrowDownLeft, hint: "Money in" },
  { type: "payment", label: "Payment", icon: ArrowUpRight, hint: "Money out" },
  { type: "contra", label: "Contra", icon: ArrowLeftRight, hint: "Cash ⇄ bank" },
];

/** Single global voucher dialog, opened via `useDialogStore().openVoucher(...)`. */
export function VoucherDialogHost() {
  const { can } = useAuth();
  const state = useDialogStore((s) => s.voucher);
  const close = useDialogStore((s) => s.closeVoucher);
  if (!can("accounts.manage") && !can("payments.record")) return null;
  return (
    <Dialog open={state.open} onOpenChange={(o) => !o && close()}>
      {state.open && <VoucherForm initial={state} onDone={close} />}
    </Dialog>
  );
}

function VoucherForm({
  initial,
  onDone,
}: {
  initial: { type: VoucherType; purchaseId: string | null; saleId: string | null; accountId: string | null };
  onDone: () => void;
}) {
  const { ds, idx } = useData();
  const { can } = useAuth();
  const user = useCurrentUser();
  const { balanceOf } = useMoneyBook();
  const canVoucher = can("accounts.manage");

  const [type, setType] = React.useState<VoucherType>(canVoucher ? initial.type : "receipt");
  const [head, setHead] = React.useState<string>(
    initial.purchaseId ? "seller_payment" : initial.saleId && initial.type === "receipt" ? SALE_HEAD : initial.saleId ? "refund_to_buyer" : initial.type === "receipt" ? SALE_HEAD : initial.type === "payment" ? "seller_payment" : "transfer",
  );
  const [saleId, setSaleId] = React.useState<string | null>(initial.saleId);
  const [purchaseId, setPurchaseId] = React.useState<string | null>(initial.purchaseId);
  const [date, setDate] = React.useState(todayISO());
  const [method, setMethod] = React.useState<PaymentMethod>("cash");
  const [accountId, setAccountId] = React.useState<string | null>(initial.accountId);
  const [toAccountId, setToAccountId] = React.useState<string | null>(null);
  const saleBalanceOf = (id: string | null) => {
    const s = id ? idx.sales.get(id) : undefined;
    return s ? saleTotals(s, idx.paymentsBySale.get(s.id) ?? []).balancePaise : 0;
  };
  const purchaseOwedOf = (id: string | null) => {
    const p = id ? idx.purchases.get(id) : undefined;
    return p ? purchaseBalance(p) : 0;
  };
  // Suggest the outstanding amount of the linked sale or purchase.
  const [amount, setAmount] = React.useState<number | null>(() =>
    initial.purchaseId ? purchaseOwedOf(initial.purchaseId) : initial.saleId && initial.type === "receipt" ? saleBalanceOf(initial.saleId) : null,
  );
  const [partyName, setPartyName] = React.useState("");
  const [partyPhone, setPartyPhone] = React.useState("");
  const [handledBy, setHandledBy] = React.useState<string>(user.id);
  const [reference, setReference] = React.useState("");
  const [narration, setNarration] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);

  const isSale = type === "receipt" && head === SALE_HEAD;
  const isSeller = type === "payment" && head === "seller_payment";
  const isRefund = type === "payment" && head === "refund_to_buyer";

  const openSales = ds.sales
    .filter((s) => s.status === "completed")
    .map((s) => ({ sale: s, totals: saleTotals(s, idx.paymentsBySale.get(s.id) ?? []) }))
    .filter((r) => r.totals.balancePaise > 0 || r.sale.id === saleId);
  const owedPurchases = ds.purchases.filter((p) => p.status === "active" && (purchaseBalance(p) > 0 || p.id === purchaseId));
  const cancelledSales = ds.sales.filter((s) => s.status === "cancelled");

  const sale = saleId ? idx.sales.get(saleId) : undefined;
  const saleBalance = saleBalanceOf(saleId);
  const purchase = purchaseId ? idx.purchases.get(purchaseId) : undefined;
  const purchaseOwed = purchaseOwedOf(purchaseId);

  const effectiveAccount = accountId ?? resolveAccountId(ds.accounts, null, method);
  const outgoing = type !== "receipt";
  const available = balanceOf(effectiveAccount);
  const overdraw = outgoing && amount !== null && amount > available;

  function switchType(next: VoucherType) {
    setType(next);
    setHead(next === "receipt" ? SALE_HEAD : next === "payment" ? "seller_payment" : "transfer");
    setErrors({});
    setAmount(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (!amount || amount <= 0) local.amountPaise = "Enter the amount";
    if (isSale && !saleId) local.saleId = "Select the sale this payment is for";
    if (type === "contra" && !toAccountId) local.toAccountId = "Select the account the money goes to";
    if (Object.keys(local).length) return setErrors(local);
    setSaving(true);
    try {
      if (isSale && saleId) {
        const id = await dealerService.recordPayment(user, saleId, {
          amountPaise: amount!,
          date,
          method,
          reference,
          notes: narration,
          accountId: effectiveAccount,
          receivedBy: handledBy,
        });
        toast.success(`Received ${formatINR(amount!)}`, {
          action: can("receipts.print") ? { label: "Print receipt", onClick: () => window.open(`/receipt/${id}`, "_blank") } : undefined,
          duration: 8000,
        });
      } else {
        const id = await dealerService.createVoucher(user, {
          type,
          head,
          date,
          amountPaise: amount!,
          method: type === "contra" ? "bank_transfer" : method,
          accountId: effectiveAccount,
          toAccountId: type === "contra" ? toAccountId : null,
          partyName: isRefund && sale ? idx.customers.get(sale.customerId)?.name ?? partyName : partyName,
          partyPhone: isRefund && sale ? idx.customers.get(sale.customerId)?.phone ?? partyPhone : partyPhone,
          reference,
          narration,
          purchaseId: isSeller ? purchaseId : null,
          saleId: isRefund ? saleId : null,
          handledBy,
        });
        toast.success(`${type === "receipt" ? "Receipt" : type === "payment" ? "Payment" : "Transfer"} of ${formatINR(amount!)} saved`, {
          action: { label: "Print voucher", onClick: () => window.open(`/voucher/${id}`, "_blank") },
          duration: 8000,
        });
      }
      onDone();
    } catch (err) {
      if (err instanceof BusinessError && err.field) setErrors({ [err.field]: err.message });
      reportError(err);
    } finally {
      setSaving(false);
    }
  }

  const heads = type === "receipt" ? RECEIPT_HEADS : PAYMENT_HEADS;

  return (
    <DialogContent className="sm:max-w-2xl">
      <form onSubmit={submit} className="flex min-h-0 flex-col" noValidate>
        <DialogHeader>
          <DialogTitle>{type === "receipt" ? "Receive money" : type === "payment" ? "Pay money" : "Move money between accounts"}</DialogTitle>
          <DialogDescription>
            {type === "receipt"
              ? "Writes a receipt voucher, or a sale receipt when a buyer pays against a car."
              : type === "payment"
                ? "Writes a payment voucher. Rent, salaries and repairs go under Expenses."
                : "Cash deposited in the bank, withdrawn from it, or moved between accounts."}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-4 sm:grid-cols-2">
          {canVoucher && (
            <div className="grid grid-cols-3 gap-2 sm:col-span-2" role="radiogroup" aria-label="Voucher type">
              {TYPES.map((t) => (
                <button
                  key={t.type}
                  type="button"
                  role="radio"
                  aria-checked={type === t.type}
                  onClick={() => switchType(t.type)}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                    type === t.type ? "border-primary bg-primary-soft/60 font-medium" : "hover:bg-muted/60",
                  )}
                >
                  <t.icon className={cn("size-4", t.type === "receipt" ? "text-success" : t.type === "payment" ? "text-destructive" : "text-[#2948b8]")} />
                  <span className="leading-tight">
                    {t.label}
                    <span className="block text-[11px] font-normal text-muted-foreground">{t.hint}</span>
                  </span>
                </button>
              ))}
            </div>
          )}

          {type !== "contra" && (
            <Field label={type === "receipt" ? "Received for" : "Paid for"} htmlFor="v-head" error={errors.head} required className="sm:col-span-2">
              <Select value={head} onValueChange={(v) => { setHead(v); setErrors({}); }}>
                <SelectTrigger id="v-head"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {type === "receipt" && (
                    <>
                      <SelectItem value={SALE_HEAD}>Buyer payment against a car sale</SelectItem>
                      {canVoucher && <SelectSeparator />}
                    </>
                  )}
                  {canVoucher && (
                    <SelectGroup>
                      <SelectLabel>{type === "receipt" ? "Other receipts" : "Payments"}</SelectLabel>
                      {heads.map((h) => <SelectItem key={h} value={h}>{VOUCHER_HEAD_LABELS[h]}</SelectItem>)}
                    </SelectGroup>
                  )}
                </SelectContent>
              </Select>
            </Field>
          )}

          {isSale && (
            <Field label="Sale" htmlFor="v-sale" error={errors.saleId} required className="sm:col-span-2" hint={sale ? `Balance due ${formatINR(saleBalance)}` : openSales.length === 0 ? "No sale has a balance due." : undefined}>
              <Select value={saleId ?? ""} onValueChange={(v) => { setSaleId(v); setAmount(saleBalanceOf(v)); }}>
                <SelectTrigger id="v-sale" aria-invalid={!!errors.saleId}><SelectValue placeholder="Select sale" /></SelectTrigger>
                <SelectContent>
                  {openSales.map(({ sale: s, totals }) => {
                    const v = idx.vehicles.get(s.vehicleId);
                    return (
                      <SelectItem key={s.id} value={s.id}>
                        {s.reference} · {idx.customers.get(s.customerId)?.name} · {v ? vehicleTitle(v) : ""}
                        <span className="ml-1.5 text-xs text-muted-foreground">due {formatINR(totals.balancePaise)}</span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </Field>
          )}

          {isSeller && (
            <Field label="Purchase" htmlFor="v-purchase" error={errors.purchaseId} required className="sm:col-span-2" hint={purchase ? `Still owed to ${purchase.sellerName}: ${formatINR(purchaseOwed)}` : owedPurchases.length === 0 ? "Every seller has been paid in full." : undefined}>
              <Select value={purchaseId ?? ""} onValueChange={(v) => { setPurchaseId(v); setAmount(purchaseOwedOf(v)); }}>
                <SelectTrigger id="v-purchase" aria-invalid={!!errors.purchaseId}><SelectValue placeholder="Select purchase" /></SelectTrigger>
                <SelectContent>
                  {owedPurchases.map((p) => {
                    const v = idx.vehicles.get(p.vehicleId);
                    return (
                      <SelectItem key={p.id} value={p.id}>
                        {p.reference} · {p.sellerName} · {v ? vehicleTitle(v) : ""}
                        <span className="ml-1.5 text-xs text-muted-foreground">owed {formatINR(purchaseBalance(p))}</span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </Field>
          )}

          {isRefund && (
            <Field label="Cancelled sale" htmlFor="v-refund-sale" hint="Optional: link the refund to the cancelled sale." className="sm:col-span-2">
              <Select value={saleId ?? "none"} onValueChange={(v) => setSaleId(v === "none" ? null : v)}>
                <SelectTrigger id="v-refund-sale"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not linked</SelectItem>
                  {cancelledSales.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.reference} · {idx.customers.get(s.customerId)?.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}

          <Field
            label="Amount"
            htmlFor="v-amount"
            error={errors.amountPaise}
            required
            hint={overdraw ? `More than the ${formatINR(available)} in this account — it will go negative.` : undefined}
          >
            <CurrencyInput id="v-amount" value={amount} onChange={setAmount} invalid={!!errors.amountPaise} />
          </Field>
          <Field label="Date" htmlFor="v-date" error={errors.date} required>
            <DateField id="v-date" max={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} invalid={!!errors.date} />
          </Field>

          {type !== "contra" && (
            <Field label="Mode" htmlFor="v-method">
              <Select value={method} onValueChange={(v) => { setMethod(v as PaymentMethod); setAccountId(null); }}>
                <SelectTrigger id="v-method"><SelectValue /></SelectTrigger>
                <SelectContent>{PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          )}
          <Field label={type === "receipt" ? "Deposit into" : type === "payment" ? "Pay from" : "From account"} htmlFor="v-account" error={errors.accountId} required>
            <AccountSelect id="v-account" value={effectiveAccount} onChange={setAccountId} exclude={type === "contra" ? toAccountId : undefined} invalid={!!errors.accountId} />
          </Field>
          {type === "contra" && (
            <Field label="To account" htmlFor="v-to" error={errors.toAccountId} required>
              <AccountSelect id="v-to" value={toAccountId} onChange={setToAccountId} exclude={effectiveAccount} invalid={!!errors.toAccountId} />
            </Field>
          )}

          {type !== "contra" && !isSale && !isSeller && !(isRefund && sale) && (
            <>
              <Field label={type === "receipt" ? "Received from" : "Paid to"} htmlFor="v-party" error={errors.partyName} required>
                <Input id="v-party" value={partyName} onChange={(e) => setPartyName(e.target.value)} aria-invalid={!!errors.partyName} placeholder="Name" />
              </Field>
              <Field label="Phone" htmlFor="v-phone" error={errors.partyPhone}>
                <Input id="v-phone" inputMode="tel" value={partyPhone} onChange={(e) => setPartyPhone(e.target.value)} placeholder="Optional" />
              </Field>
            </>
          )}

          <Field label={type === "receipt" ? "Cash received by" : type === "payment" ? "Paid by" : "Handled by"} htmlFor="v-handled" error={errors.handledBy}>
            <StaffSelect id="v-handled" value={handledBy} onChange={(v) => setHandledBy(v ?? user.id)} />
          </Field>
          <Field label="Reference" htmlFor="v-ref" error={errors.reference}>
            <Input id="v-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Cheque / UTR / UPI no." />
          </Field>
          <Field label="Narration" htmlFor="v-narration" error={errors.narration} className="sm:col-span-2">
            <Textarea id="v-narration" rows={2} value={narration} onChange={(e) => setNarration(e.target.value)} placeholder="Optional" />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onDone} disabled={saving}>Cancel</Button>
          <Button type="submit" loading={saving}>
            {type === "receipt" ? "Save receipt" : type === "payment" ? "Save payment" : "Save transfer"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
