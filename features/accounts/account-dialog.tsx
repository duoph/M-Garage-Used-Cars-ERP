"use client";
import * as React from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { useCurrentUser } from "@/hooks/use-auth";
import { dealerService } from "@/lib/services/dealer-service";
import { reportError } from "@/hooks/use-commands";
import { BusinessError } from "@/lib/repositories/contracts";
import { accountSchema, type AccountInput } from "@/lib/validation/schemas";
import { todayISO } from "@/lib/utils/dates";
import type { MoneyAccount } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/shared/form-field";
import { CurrencyInput } from "@/components/shared/currency-input";
import { DateField } from "@/components/shared/date-field";
import { StaffSelect } from "./shared";
import { BranchSelect, useMyBranches } from "@/features/branches/branch-select";

export function AccountDialog({
  open,
  onOpenChange,
  account,
  kind = "bank",
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Editing this account; absent = adding a new one of `kind`. */
  account?: MoneyAccount;
  kind?: MoneyAccount["kind"];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && <AccountForm account={account} kind={account?.kind ?? kind} onDone={() => onOpenChange(false)} />}
    </Dialog>
  );
}

function AccountForm({ account, kind, onDone }: { account?: MoneyAccount; kind: MoneyAccount["kind"]; onDone: () => void }) {
  const user = useCurrentUser();
  const form = useForm<AccountInput>({
    resolver: zodResolver(accountSchema),
    defaultValues: account
      ? { ...account }
      : {
          name: kind === "cash" ? "Cash — " : "",
          kind,
          bankName: "",
          accountNumber: "",
          ifsc: "",
          upiId: "",
          custodianId: kind === "cash" ? user.id : null,
          openingBalancePaise: 0,
          openingDate: todayISO(),
          isDefault: false,
          archived: false,
          notes: "",
          branchId: kind === "cash" ? (user.branchId ?? null) : null,
        },
  });
  const branches = useMyBranches();
  const { errors, isSubmitting } = form.formState;
  const isBank = kind === "bank";
  const isCash = kind === "cash";
  const title = isBank ? "bank account" : isCash ? "cash account" : kind === "owner" ? "owner account" : "lender account";
  const isDefault = useWatch({ control: form.control, name: "isDefault" });

  async function onSubmit(values: AccountInput) {
    try {
      if (account) await dealerService.updateAccount(user, account.id, values);
      else await dealerService.createAccount(user, values);
      toast.success(account ? "Account updated" : "Account added");
      onDone();
    } catch (e) {
      if (e instanceof BusinessError && e.field) form.setError(e.field as keyof AccountInput, { message: e.message });
      reportError(e);
    }
  }

  return (
    <DialogContent className="sm:max-w-xl">
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex min-h-0 flex-col" noValidate>
        <DialogHeader>
          <DialogTitle>{account ? `Edit ${account.name}` : `Add ${title}`}</DialogTitle>
          <DialogDescription>
            {isBank
              ? "UPI, card, cheque and bank-transfer money lands in the default bank account unless you pick another."
              : isCash
                ? "Each branch keeps its own cash in hand. Give each drawer or cash holder its own account to see who holds how much."
                : kind === "owner"
                  ? "Cash handed over to the owner or a partner moves here with a cash transfer."
                  : "Loan amounts on financed sales wait here until the lender pays them into a bank."}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Account name" htmlFor="acc-name" error={errors.name?.message} required className="sm:col-span-2">
            <Input id="acc-name" placeholder={isBank ? "e.g. HDFC current account" : "e.g. Cash — showroom counter"} aria-invalid={!!errors.name} {...form.register("name")} />
          </Field>
          {isBank ? (
            <>
              <Field label="Bank" htmlFor="acc-bank" error={errors.bankName?.message}>
                <Input id="acc-bank" placeholder="e.g. HDFC Bank" {...form.register("bankName")} />
              </Field>
              <Field label="Account number" htmlFor="acc-number" error={errors.accountNumber?.message}>
                <Input id="acc-number" inputMode="numeric" {...form.register("accountNumber")} />
              </Field>
              <Field label="IFSC" htmlFor="acc-ifsc" error={errors.ifsc?.message}>
                <Input id="acc-ifsc" className="uppercase" {...form.register("ifsc")} />
              </Field>
              <Field label="UPI ID" htmlFor="acc-upi" error={errors.upiId?.message}>
                <Input id="acc-upi" placeholder="mgarage@okhdfc" {...form.register("upiId")} />
              </Field>
            </>
          ) : isCash ? (
            <>
              <Field label="Branch" htmlFor="acc-branch" error={errors.branchId?.message} required hint={branches.length > 1 ? "Whose cash drawer this is." : undefined}>
                <Controller control={form.control} name="branchId" render={({ field }) => (
                  <BranchSelect id="acc-branch" value={field.value ?? ""} onChange={field.onChange} />
                )} />
              </Field>
              <Field label="Cash held by" htmlFor="acc-custodian" hint="The cash receiver responsible for this cash.">
                <Controller control={form.control} name="custodianId" render={({ field }) => (
                  <StaffSelect id="acc-custodian" value={field.value} onChange={field.onChange} allowNone />
                )} />
              </Field>
            </>
          ) : null}
          <Field label="Opening balance" htmlFor="acc-opening" error={errors.openingBalancePaise?.message} hint="Money already in the account before you started using M Garage.">
            <Controller control={form.control} name="openingBalancePaise" render={({ field }) => (
              <CurrencyInput id="acc-opening" value={field.value} onChange={(v) => field.onChange(v ?? 0)} onBlur={field.onBlur} invalid={!!errors.openingBalancePaise} />
            )} />
          </Field>
          <Field label="As on" htmlFor="acc-opening-date" error={errors.openingDate?.message}>
            <DateField id="acc-opening-date" {...form.register("openingDate")} />
          </Field>
          <Field label="Notes" htmlFor="acc-notes" className="sm:col-span-2">
            <Textarea id="acc-notes" rows={2} {...form.register("notes")} />
          </Field>
          {(isBank || isCash) && <div className="flex items-center justify-between gap-3 rounded-lg border p-3 sm:col-span-2">
            <div>
              <Label htmlFor="acc-default">Default {isBank ? "bank" : "cash"} account</Label>
              <p className="text-xs text-muted-foreground">
                {isBank ? "Takes UPI, card, cheque and transfer payments by default." : "Takes this branch's cash payments by default."}
              </p>
              {errors.isDefault && <p className="text-xs text-destructive">{errors.isDefault.message}</p>}
            </div>
            <Controller control={form.control} name="isDefault" render={({ field }) => (
              <Switch id="acc-default" checked={field.value} onCheckedChange={field.onChange} />
            )} />
          </div>}
          {account && (
            <div className="flex items-center justify-between gap-3 rounded-lg border p-3 sm:col-span-2">
              <div>
                <Label htmlFor="acc-archived">Archived</Label>
                <p className="text-xs text-muted-foreground">Hidden from pickers. Past entries and the balance are kept.</p>
                {errors.archived && <p className="text-xs text-destructive">{errors.archived.message}</p>}
              </div>
              <Controller control={form.control} name="archived" render={({ field }) => (
                <Switch id="acc-archived" checked={field.value} onCheckedChange={field.onChange} disabled={isDefault} />
              )} />
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onDone} disabled={isSubmitting}>Cancel</Button>
          <Button type="submit" loading={isSubmitting}>{account ? "Save changes" : "Add account"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
