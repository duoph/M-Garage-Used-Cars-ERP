"use client";
import * as React from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Pencil, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth, useCurrentUser } from "@/hooks/use-auth";
import { dealerService } from "@/lib/services/dealer-service";
import { reportError } from "@/hooks/use-commands";
import { emptyPapers, paperChecks, type PaperCheck } from "@/lib/calculations/papers";
import { papersSchema, type PapersInput } from "@/lib/validation/schemas";
import { INSURANCE_TYPE_LABELS } from "@/lib/utils/labels";
import { formatDate } from "@/lib/utils/dates";
import { cn } from "@/lib/utils/cn";
import { INSURANCE_TYPES, type Vehicle } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/shared/form-field";
import { DateField } from "@/components/shared/date-field";

function StatusBadge({ check }: { check: PaperCheck }) {
  if (check.key === "noc") return check.status === "valid" ? <Badge tone="success">Received</Badge> : <Badge tone="danger">Pending</Badge>;
  if (check.status === "unknown") return <Badge>Not entered</Badge>;
  if (check.status === "expired") return <Badge tone="danger">Expired {formatDate(check.date)}</Badge>;
  if (check.status === "expiring") return <Badge tone="warning">{check.days === 0 ? "Expires today" : `${check.days} days left`}</Badge>;
  return <Badge tone="success">Till {formatDate(check.date)}</Badge>;
}

/** Insurance, pollution, RC validity, hypothecation and the papers in the showroom's hands. */
export function PapersCard({ vehicle }: { vehicle: Vehicle }) {
  const { can } = useAuth();
  const [editing, setEditing] = React.useState(false);
  const p = vehicle.papers;
  const canEdit = !vehicle.archivedAt && (can("inventory.edit") || can("documents.manage"));
  const checks = paperChecks(vehicle);

  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="flex items-center gap-1.5"><ShieldCheck className="size-4 text-muted-foreground" /> Papers & validity</CardTitle>
        {canEdit && <Button variant="ghost" size="sm" onClick={() => setEditing(true)}><Pencil /> {p ? "Edit" : "Add"}</Button>}
      </CardHeader>
      <CardContent>
        {!p ? (
          <p className="text-[13px] text-muted-foreground">Insurance, PUC, RC validity and hypothecation haven&apos;t been entered for this car yet.</p>
        ) : (
          <dl className="divide-y text-[13px]">
            {checks.map((c) => (
              <div key={c.key} className="flex items-center justify-between gap-3 py-2">
                <dt className="text-muted-foreground">{c.label}</dt>
                <dd><StatusBadge check={c} /></dd>
              </div>
            ))}
            {p.insuranceType !== "none" && (p.insuranceCompany || p.insurancePolicyNumber) && (
              <div className="flex items-center justify-between gap-3 py-2">
                <dt className="text-muted-foreground">Policy</dt>
                <dd className="text-right">{INSURANCE_TYPE_LABELS[p.insuranceType]} · {[p.insuranceCompany, p.insurancePolicyNumber].filter(Boolean).join(" · ")}</dd>
              </div>
            )}
            <div className="flex items-center justify-between gap-3 py-2">
              <dt className="text-muted-foreground">Hypothecation</dt>
              <dd>{p.hypothecated ? p.financierName : "None"}</dd>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 pt-2">
              {([["Original RC", p.rcInHand], ["Spare key", p.spareKey], ["Service records", p.serviceRecords]] as const).map(([label, ok]) => (
                <span key={label} className={cn("flex items-center gap-1", ok ? "text-foreground" : "text-muted-foreground")}>
                  {ok ? <Check className="size-3.5 text-success" /> : <X className="size-3.5" />} {label}
                </span>
              ))}
            </div>
            {p.notes && <p className="pt-2 text-muted-foreground">{p.notes}</p>}
          </dl>
        )}
      </CardContent>
      <Dialog open={editing} onOpenChange={setEditing}>{editing && <PapersForm vehicle={vehicle} onDone={() => setEditing(false)} />}</Dialog>
    </Card>
  );
}

function PapersForm({ vehicle, onDone }: { vehicle: Vehicle; onDone: () => void }) {
  const user = useCurrentUser();
  const form = useForm<PapersInput>({ resolver: zodResolver(papersSchema), defaultValues: vehicle.papers ?? emptyPapers() });
  const { errors, isSubmitting } = form.formState;
  const hypothecated = useWatch({ control: form.control, name: "hypothecated" });
  const insured = useWatch({ control: form.control, name: "insuranceType" }) !== "none";

  async function onSubmit(values: PapersInput) {
    try {
      await dealerService.updateVehiclePapers(user, vehicle.id, values);
      toast.success("Papers updated");
      onDone();
    } catch (e) {
      reportError(e);
    }
  }

  const toggle = (name: "hypothecated" | "nocReceived" | "rcInHand" | "spareKey" | "serviceRecords", label: string, hint?: string) => (
    <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
      <div>
        <Label htmlFor={`pp-${name}`}>{label}</Label>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <Controller control={form.control} name={name} render={({ field }) => <Switch id={`pp-${name}`} checked={field.value} onCheckedChange={field.onChange} />} />
    </div>
  );

  return (
    <DialogContent className="sm:max-w-2xl">
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex min-h-0 flex-col" noValidate>
        <DialogHeader>
          <DialogTitle>Papers & validity</DialogTitle>
          <DialogDescription>{vehicle.registrationNumber}. Leave a date empty if you don&apos;t know it yet. Cars with papers expiring within 30 days are flagged on the dashboard.</DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Insurance" htmlFor="pp-ins-type">
            <Controller control={form.control} name="insuranceType" render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="pp-ins-type"><SelectValue /></SelectTrigger>
                <SelectContent>{INSURANCE_TYPES.map((t) => <SelectItem key={t} value={t}>{INSURANCE_TYPE_LABELS[t]}</SelectItem>)}</SelectContent>
              </Select>
            )} />
          </Field>
          <Field label="Insurance valid till" htmlFor="pp-ins-date" error={errors.insuranceValidTill?.message}>
            <DateField id="pp-ins-date" {...form.register("insuranceValidTill")} />
          </Field>
          {insured && (
            <>
              <Field label="Insurer" htmlFor="pp-ins-co" error={errors.insuranceCompany?.message}>
                <Input id="pp-ins-co" placeholder="e.g. ICICI Lombard" {...form.register("insuranceCompany")} />
              </Field>
              <Field label="Policy number" htmlFor="pp-ins-no" error={errors.insurancePolicyNumber?.message}>
                <Input id="pp-ins-no" {...form.register("insurancePolicyNumber")} />
              </Field>
            </>
          )}
          <Field label="Pollution (PUC) valid till" htmlFor="pp-puc" error={errors.pucValidTill?.message}>
            <DateField id="pp-puc" {...form.register("pucValidTill")} />
          </Field>
          <Field label="RC valid till" htmlFor="pp-rc" error={errors.rcValidTill?.message} hint="Registration validity printed on the RC.">
            <DateField id="pp-rc" {...form.register("rcValidTill")} />
          </Field>
          <Field label="Fitness valid till" htmlFor="pp-fit" error={errors.fitnessValidTill?.message} hint="Commercial or older cars only.">
            <DateField id="pp-fit" {...form.register("fitnessValidTill")} />
          </Field>
          <div className="sm:col-span-2">{toggle("hypothecated", "Hypothecated", "The RC shows a bank or financier lien.")}</div>
          {hypothecated && (
            <>
              <Field label="Financier" htmlFor="pp-fin" error={errors.financierName?.message} required>
                <Input id="pp-fin" placeholder="e.g. HDFC Bank" aria-invalid={!!errors.financierName} {...form.register("financierName")} />
              </Field>
              {toggle("nocReceived", "NOC received", "Loan closed and NOC / Form 35 collected.")}
            </>
          )}
          {toggle("rcInHand", "Original RC with us")}
          {toggle("spareKey", "Spare key")}
          {toggle("serviceRecords", "Service records")}
          <Field label="Notes" htmlFor="pp-notes" className="sm:col-span-2">
            <Textarea id="pp-notes" rows={2} {...form.register("notes")} />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onDone} disabled={isSubmitting}>Cancel</Button>
          <Button type="submit" loading={isSubmitting}>Save papers</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
