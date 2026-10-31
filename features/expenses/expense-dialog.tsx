"use client";
import * as React from "react";
import { useData } from "@/components/providers/data-provider";
import { useCurrentUser, useAuth } from "@/hooks/use-auth";
import { useDialogStore } from "@/lib/store/dialogs";
import { dealerService } from "@/lib/services/dealer-service";
import { reportError } from "@/hooks/use-commands";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EXPENSE_FORM_ID, ExpenseForm } from "./expense-form";
import type { ExpenseInput } from "@/lib/validation/schemas";

/** Single global expense dialog, opened via `useDialogStore().openExpense(...)`. */
export function ExpenseDialogHost() {
  const { can } = useAuth();
  const state = useDialogStore((s) => s.expense);
  const close = useDialogStore((s) => s.closeExpense);
  if (!can("expenses.manage")) return null;
  return (
    <Dialog open={state.open} onOpenChange={(o) => !o && close()}>
      {state.open && <ExpenseDialogBody expenseId={state.expenseId} vehicleId={state.vehicleId} onDone={close} />}
    </Dialog>
  );
}

function ExpenseDialogBody({ expenseId, vehicleId, onDone }: { expenseId: string | null; vehicleId: string | null; onDone: () => void }) {
  const { ds } = useData();
  const user = useCurrentUser();
  const [saving, setSaving] = React.useState(false);
  const existing = expenseId ? ds.expenses.find((e) => e.id === expenseId) : undefined;

  const defaults: Partial<ExpenseInput> | undefined = existing
    ? {
        category: existing.category,
        amountPaise: existing.amountPaise,
        date: existing.date,
        description: existing.description,
        vendor: existing.vendor,
        paymentMethod: existing.paymentMethod,
        vehicleId: existing.vehicleId,
        notes: existing.notes,
        accountId: existing.accountId ?? null,
      }
    : vehicleId
      ? { vehicleId, category: "repair" }
      : undefined;

  async function submit(values: ExpenseInput) {
    setSaving(true);
    try {
      if (existing) {
        await dealerService.updateExpense(user, existing.id, values);
        toast.success("Expense updated");
      } else {
        await dealerService.createExpense(user, values);
        toast.success("Expense recorded");
      }
      onDone();
    } catch (e) {
      reportError(e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <DialogContent className="sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>{existing ? `Edit expense ${existing.reference}` : "Add expense"}</DialogTitle>
        <DialogDescription>
          Vehicle expenses add to that car&apos;s landed cost. General expenses count as showroom operating costs.
        </DialogDescription>
      </DialogHeader>
      <DialogBody>
        <ExpenseForm defaultValues={defaults} lockVehicle={!existing && !!vehicleId} onSubmit={submit} />
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={onDone} disabled={saving}>Cancel</Button>
        <Button type="submit" form={EXPENSE_FORM_ID} loading={saving}>
          {existing ? "Save changes" : "Add expense"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
