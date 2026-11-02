"use client";
import * as React from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Building2, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { useData } from "@/components/providers/data-provider";
import { useCurrentUser } from "@/hooks/use-auth";
import { reportError } from "@/hooks/use-commands";
import { dealerService } from "@/lib/services/dealer-service";
import { branchSchema, type BranchInput } from "@/lib/validation/schemas";
import type { Branch } from "@/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/shared/form-field";

/** Settings → Branches: each branch keeps its own cash in hand; staff are assigned to one. */
export function BranchesSection() {
  const { ds } = useData();
  const [editing, setEditing] = React.useState<Branch | "new" | null>(null);
  return (
    <Card className="overflow-hidden">
      <div className="grid gap-4 p-4 md:grid-cols-[240px_1fr] md:gap-6 md:p-5">
        <div>
          <h2 className="text-sm font-semibold">Branches</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">Each shop keeps its own cash in hand. Staff see only their branch unless they are given access to all.</p>
        </div>
        <div className="min-w-0">
          <ul className="divide-y rounded-lg border">
            {ds.branches.map((b) => {
              const cash = ds.accounts.filter((a) => a.kind === "cash" && a.branchId === b.id).length;
              const staff = ds.users.filter((u) => u.branchId === b.id && u.status === "active").length;
              return (
                <li key={b.id} className="flex items-center gap-3 px-3 py-2.5">
                  <Building2 className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium">{b.name} <span className="font-mono text-xs text-muted-foreground">{b.code}</span> {b.archived && <Badge tone="neutral">Archived</Badge>}</div>
                    <div className="text-xs text-muted-foreground">{cash} cash account{cash === 1 ? "" : "s"} · {staff} staff{b.address && ` · ${b.address}`}</div>
                  </div>
                  <Button variant="ghost" size="icon-sm" onClick={() => setEditing(b)} aria-label={`Edit ${b.name}`}><Pencil /></Button>
                </li>
              );
            })}
          </ul>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => setEditing("new")}><Plus /> Add branch</Button>
        </div>
      </div>
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && <BranchForm branch={editing === "new" ? null : editing} onDone={() => setEditing(null)} />}
      </Dialog>
    </Card>
  );
}

function BranchForm({ branch, onDone }: { branch: Branch | null; onDone: () => void }) {
  const user = useCurrentUser();
  const form = useForm<BranchInput>({
    resolver: zodResolver(branchSchema),
    defaultValues: branch ? { name: branch.name, code: branch.code, address: branch.address, phone: branch.phone, archived: branch.archived } : { name: "", code: "", address: "", phone: "", archived: false },
  });
  const { errors, isSubmitting } = form.formState;

  async function onSubmit(values: BranchInput) {
    try {
      if (branch) await dealerService.updateBranch(user, branch.id, values);
      else await dealerService.createBranch(user, values);
      toast.success(branch ? "Branch updated" : `${values.name} added with its own cash in hand`);
      onDone();
    } catch (e) {
      reportError(e);
    }
  }

  return (
    <DialogContent>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex min-h-0 flex-col" noValidate>
        <DialogHeader>
          <DialogTitle>{branch ? `Edit ${branch.name}` : "Add branch"}</DialogTitle>
          <DialogDescription>{branch ? "Name, code and contact details." : "A cash-in-hand account is created for the new branch."}</DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Branch name" htmlFor="br-name" error={errors.name?.message} required>
            <Input id="br-name" placeholder="e.g. Kochi" aria-invalid={!!errors.name} {...form.register("name")} />
          </Field>
          <Field label="Code" htmlFor="br-code" error={errors.code?.message} required>
            <Input id="br-code" className="uppercase" placeholder="KOC" aria-invalid={!!errors.code} {...form.register("code")} />
          </Field>
          <Field label="Address" htmlFor="br-address" error={errors.address?.message} className="sm:col-span-2">
            <Input id="br-address" {...form.register("address")} />
          </Field>
          <Field label="Phone" htmlFor="br-phone" error={errors.phone?.message}>
            <Input id="br-phone" type="tel" {...form.register("phone")} />
          </Field>
          {branch && (
            <div className="flex items-center justify-between gap-3 rounded-lg border p-3 sm:col-span-2">
              <div>
                <Label htmlFor="br-archived">Archived</Label>
                <p className="text-xs text-muted-foreground">Hidden from branch pickers; its history is kept.</p>
              </div>
              <Controller control={form.control} name="archived" render={({ field }) => <Switch id="br-archived" checked={field.value} onCheckedChange={field.onChange} />} />
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onDone} disabled={isSubmitting}>Cancel</Button>
          <Button type="submit" loading={isSubmitting}>{branch ? "Save" : "Add branch"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
