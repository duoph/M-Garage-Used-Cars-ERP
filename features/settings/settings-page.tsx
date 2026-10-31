"use client";
import * as React from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLiveQuery } from "dexie-react-hooks";
import { Check, Cloud, Database, Download, HardDrive, ImagePlus, RefreshCw, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { useData } from "@/components/providers/data-provider";
import { useCurrentUser } from "@/hooks/use-auth";
import { useUiStore } from "@/lib/store/ui";
import { THEMES } from "@/lib/themes";
import { cn } from "@/lib/utils/cn";
import { dealerService } from "@/lib/services/dealer-service";
import { reportError } from "@/hooks/use-commands";
import { settingsSchema, type SettingsInput } from "@/lib/validation/schemas";
import { getDb } from "@/lib/db/database";
import { clearBusinessData, exportBackup, importBackup } from "@/lib/db/backup";
import { formatBytes, prepareLogo } from "@/lib/images/process";
import { INVOICE_TEMPLATES, type InvoiceTemplateId } from "@/types";
import { INVOICE_TEMPLATE_INFO } from "@/features/sales/invoice-templates";
import { isR2Key } from "@/lib/images/r2-keys";
import { downloadFile } from "@/lib/utils/csv";
import { formatDate, todayISO } from "@/lib/utils/dates";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/shared/page-header";
import { Field } from "@/components/shared/form-field";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ShowroomLogo } from "@/components/shared/showroom-logo";

export function SettingsSection({ title, description, children, footer }: { title: string; description: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <Card className="overflow-hidden">
      <div className="grid gap-4 p-4 md:grid-cols-[240px_1fr] md:gap-6 md:p-5">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">{description}</p>
        </div>
        <div className="min-w-0">{children}</div>
      </div>
      {footer && <div className="flex justify-end gap-2 border-t bg-muted/40 px-4 py-3 md:px-6">{footer}</div>}
    </Card>
  );
}

export function SettingsPage() {
  const { ds } = useData();
  const user = useCurrentUser();
  const s = ds.settings;
  const form = useForm<SettingsInput>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      showroomName: s.showroomName,
      legalName: s.legalName,
      address: s.address,
      city: s.city,
      phone: s.phone,
      email: s.email,
      gstin: s.gstin,
      dateFormat: s.dateFormat,
      defaultInventoryView: s.defaultInventoryView,
      receiptFooter: s.receiptFooter,
      receiptTerms: s.receiptTerms,
      maxUploadMb: s.maxUploadMb,
      maxPhotosPerVehicle: s.maxPhotosPerVehicle,
    },
  });
  const { errors, isSubmitting, isDirty } = form.formState;

  async function onSubmit(values: SettingsInput) {
    try {
      await dealerService.updateSettings(user, values);
      form.reset(values);
      toast.success("Settings saved");
    } catch (e) {
      reportError(e);
    }
  }

  const saveBar = (
    <>
      <Button type="button" variant="outline" disabled={!isDirty || isSubmitting} onClick={() => form.reset()}>Discard</Button>
      <Button type="submit" loading={isSubmitting} disabled={!isDirty}>Save changes</Button>
    </>
  );

  return (
    <>
      <PageHeader title="Settings" description="Showroom profile, preferences, storage and backups." />
      <div className="mb-4">
        <AppearanceSection />
        <InvoiceTemplateSection />
      </div>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="grid gap-4">
        <SettingsSection title="Showroom profile" description="Shown on receipts and across the app." footer={saveBar}>
          <div className="grid gap-4 sm:grid-cols-2">
            <LogoField />
            <Field label="Business name" htmlFor="s-name" error={errors.showroomName?.message} required>
              <Input id="s-name" {...form.register("showroomName")} aria-invalid={!!errors.showroomName} />
            </Field>
            <Field label="Legal name" htmlFor="s-legal" error={errors.legalName?.message}>
              <Input id="s-legal" {...form.register("legalName")} />
            </Field>
            <Field label="Address" htmlFor="s-address" error={errors.address?.message} required className="sm:col-span-2">
              <Input id="s-address" {...form.register("address")} aria-invalid={!!errors.address} />
            </Field>
            <Field label="City, state & PIN" htmlFor="s-city" error={errors.city?.message}>
              <Input id="s-city" {...form.register("city")} />
            </Field>
            <Field label="GSTIN" htmlFor="s-gstin" error={errors.gstin?.message} hint="Optional; printed on receipts">
              <Input id="s-gstin" className="uppercase" {...form.register("gstin")} aria-invalid={!!errors.gstin} />
            </Field>
            <Field label="Contact number" htmlFor="s-phone" error={errors.phone?.message} required>
              <Input id="s-phone" type="tel" {...form.register("phone")} aria-invalid={!!errors.phone} />
            </Field>
            <Field label="Email" htmlFor="s-email" error={errors.email?.message} required>
              <Input id="s-email" type="email" {...form.register("email")} aria-invalid={!!errors.email} />
            </Field>
          </div>
        </SettingsSection>

        <SettingsSection title="Application preferences" description="Display and receipt options for everyone in the showroom." footer={saveBar}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Currency" htmlFor="s-currency" hint="Amounts are stored in paise for exact arithmetic">
              <Input id="s-currency" value="Indian Rupee (₹ INR)" disabled />
            </Field>
            <Field label="Date display format" htmlFor="s-datefmt">
              <Controller control={form.control} name="dateFormat" render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="s-datefmt"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(["dd MMM yyyy", "dd/MM/yyyy", "yyyy-MM-dd"] as const).map((f) => (
                      <SelectItem key={f} value={f}>{formatDate(todayISO(), f)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )} />
            </Field>
            <Field label="Default inventory view" htmlFor="s-view">
              <Controller control={form.control} name="defaultInventoryView" render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="s-view"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="grid">Grid (photo cards)</SelectItem>
                    <SelectItem value="table">List</SelectItem>
                  </SelectContent>
                </Select>
              )} />
            </Field>
            <div className="hidden sm:block" />
            <Field label="Max photo size (MB)" htmlFor="s-maxmb" error={errors.maxUploadMb?.message}>
              <Input id="s-maxmb" type="number" min={1} max={25} {...form.register("maxUploadMb", { valueAsNumber: true })} />
            </Field>
            <Field label="Max photos per vehicle" htmlFor="s-maxphotos" error={errors.maxPhotosPerVehicle?.message}>
              <Input id="s-maxphotos" type="number" min={1} max={40} {...form.register("maxPhotosPerVehicle", { valueAsNumber: true })} />
            </Field>
            <Field label="Receipt footer" htmlFor="s-footer" error={errors.receiptFooter?.message} className="sm:col-span-2">
              <Input id="s-footer" {...form.register("receiptFooter")} />
            </Field>
            <Field label="Receipt terms" htmlFor="s-terms" error={errors.receiptTerms?.message} className="sm:col-span-2">
              <Textarea id="s-terms" rows={3} {...form.register("receiptTerms")} />
            </Field>
          </div>
        </SettingsSection>
      </form>

      <div className="mt-4 grid gap-4">
        <StorageSection />
        <DataSection />
      </div>
    </>
  );
}

function AppearanceSection() {
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  return (
    <SettingsSection title="Appearance" description="Colour theme for the sidebar, buttons and charts. Applies instantly on this device.">
      <div role="radiogroup" aria-label="Colour theme" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {THEMES.map((t) => {
          const selected = t.id === theme;
          return (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setTheme(t.id)}
              className={cn(
                "group overflow-hidden rounded-lg border text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                selected ? "border-primary ring-1 ring-primary" : "hover:border-foreground/20",
              )}
            >
              {/* Mini preview: coloured sidebar + white page with a primary button. */}
              <div className="flex h-16">
                <div className="flex w-1/3 flex-col gap-1 p-1.5" style={{ background: t.sidebar }}>
                  <span className="h-1.5 w-full rounded-sm bg-white/30" />
                  <span className="h-1.5 w-3/4 rounded-sm bg-white/15" />
                  <span className="h-1.5 w-3/4 rounded-sm bg-white/15" />
                </div>
                <div className="flex flex-1 flex-col justify-between bg-[#f7f9fc] p-1.5">
                  <span className="h-1.5 w-2/3 rounded-sm bg-[#dde3ee]" />
                  <span className="h-3 w-10 self-end rounded-sm" style={{ background: t.primary }} />
                </div>
              </div>
              <div className="flex items-center justify-between border-t bg-card px-2.5 py-2 text-[13px] font-medium">
                {t.label}
                {selected && <Check className="size-3.5 text-primary" aria-hidden />}
              </div>
            </button>
          );
        })}
      </div>
    </SettingsSection>
  );
}

function InvoiceTemplateSection() {
  const { ds } = useData();
  const user = useCurrentUser();
  const current = ds.settings.invoiceTemplate ?? "classic";
  const [saving, setSaving] = React.useState<InvoiceTemplateId | null>(null);
  async function choose(t: InvoiceTemplateId) {
    setSaving(t);
    try {
      await dealerService.setInvoiceTemplate(user, t);
      toast.success(`${INVOICE_TEMPLATE_INFO[t].label} invoice template selected`);
    } catch (e) {
      reportError(e);
    } finally {
      setSaving(null);
    }
  }
  return (
    <SettingsSection title="Invoice template" description="Layout used when printing sale invoices. It can also be switched from the invoice's toolbar.">
      <div role="radiogroup" aria-label="Invoice template" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {INVOICE_TEMPLATES.map((t) => {
          const selected = t === current;
          return (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={saving !== null}
              onClick={() => choose(t)}
              className={cn(
                "overflow-hidden rounded-lg border text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-70",
                selected ? "border-primary ring-1 ring-primary" : "hover:border-foreground/20",
              )}
            >
              <InvoiceThumb template={t} />
              <div className="border-t bg-card px-2.5 py-2">
                <div className="flex items-center justify-between text-[13px] font-medium">
                  {INVOICE_TEMPLATE_INFO[t].label}
                  {selected && <Check className="size-3.5 text-primary" aria-hidden />}
                </div>
                <p className="text-xs text-muted-foreground">{INVOICE_TEMPLATE_INFO[t].description}</p>
              </div>
            </button>
          );
        })}
      </div>
    </SettingsSection>
  );
}

/** Tiny schematic of each invoice layout for the picker. */
function InvoiceThumb({ template }: { template: InvoiceTemplateId }) {
  const line = "h-1 rounded-sm bg-[#d0d5dd]";
  return (
    <div className="flex h-24 flex-col gap-1.5 bg-[#f7f9fc] p-2.5">
      {template === "modern" && <div className="-mx-2.5 -mt-2.5 mb-0.5 h-5 bg-primary" />}
      {template === "bold" && <div className="h-3 w-1/2 rounded-sm bg-[#111827]" />}
      {template === "compact" && <div className="h-1.5 w-full border-b-2 border-[#111827]" />}
      {template === "classic" && (
        <div className="flex justify-between">
          <span className="h-1.5 w-1/3 rounded-sm bg-[#98a2b3]" />
          <span className="h-1.5 w-1/5 rounded-sm bg-[#98a2b3]" />
        </div>
      )}
      {template === "bold" ? (
        <div className="grid grid-cols-3 gap-px rounded-sm bg-[#111827] p-px">
          <span className="h-3 bg-white" />
          <span className="h-3 bg-white" />
          <span className="h-3 bg-[#111827]" />
        </div>
      ) : template === "compact" ? (
        <div className="grid gap-px border border-[#d0d5dd] bg-[#d0d5dd]">
          {[0, 1, 2, 3].map((i) => <span key={i} className="h-1.5 bg-white" />)}
        </div>
      ) : (
        <>
          <span className={cn(line, "w-3/4")} />
          <span className={cn(line, "w-1/2")} />
        </>
      )}
      <span className={cn(line, "mt-auto w-full")} />
      <span className={cn("h-2 w-1/3 self-end rounded-sm", template === "modern" ? "bg-primary" : "bg-[#98a2b3]")} />
    </div>
  );
}

function LogoField() {
  const { ds } = useData();
  const user = useCurrentUser();
  const ref = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      await dealerService.setLogo(user, await prepareLogo(file));
      toast.success("Logo updated");
    } catch (e) {
      if (e instanceof Error && !(e.name === "BusinessError")) toast.error(e.message);
      else reportError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-4 sm:col-span-2">
      <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-card p-1">
        <ShowroomLogo className="size-full" />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" loading={busy} onClick={() => ref.current?.click()}>
          <ImagePlus /> {ds.settings.logoKey ? "Change logo" : "Upload logo"}
        </Button>
        {ds.settings.logoKey && (
          <Button type="button" variant="ghost" size="sm" onClick={() => dealerService.setLogo(user, null).then(() => toast.success("Logo removed"), reportError)}>
            Remove
          </Button>
        )}
        <p className="w-full text-xs text-muted-foreground">Your company logo, printed on every receipt. A square PNG with a transparent background works best.</p>
      </div>
      <input ref={ref} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
    </div>
  );
}

type CloudUsage = { bytes: number; objects: number; quotaBytes: number };

async function fetchCloudUsage(): Promise<{ usage: CloudUsage } | { error: string }> {
  try {
    const res = await fetch("/api/storage", { cache: "no-store" });
    const body = (await res.json()) as CloudUsage & { error?: string };
    return res.ok ? { usage: body } : { error: body.error ?? "Could not read cloud storage usage." };
  } catch {
    return { error: "Could not read cloud storage usage." };
  }
}

function useCloudUsage() {
  const [usage, setUsage] = React.useState<CloudUsage | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [version, setVersion] = React.useState(0);
  React.useEffect(() => {
    let active = true;
    fetchCloudUsage().then((r) => {
      if (!active) return;
      if ("usage" in r) {
        setUsage(r.usage);
        setError(null);
      } else setError(r.error);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [version]);
  const refresh = () => {
    setLoading(true);
    setVersion((v) => v + 1);
  };
  return { usage, error, loading, refresh };
}

function UsageMeter({ used, quota, label, detail }: { used: number | null; quota: number; label: string; detail: React.ReactNode }) {
  const pct = used != null ? (used / quota) * 100 : 0;
  const left = used != null ? Math.max(0, quota - used) : null;
  return (
    <div className="flex-1">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-xs text-muted-foreground tabular">{formatBytes(quota)} total</span>
      </div>
      <Progress value={Math.min(100, Math.max(pct, used ? 0.5 : 0))} className="mt-2 h-2" indicatorClassName={pct >= 90 ? "bg-destructive" : undefined} />
      <div className="mt-2 flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs tabular">
        <span>
          <span className="font-medium text-foreground">{used != null ? formatBytes(used) : "…"}</span>
          <span className="text-muted-foreground"> used ({pct.toFixed(pct < 10 ? 1 : 0)}%)</span>
        </span>
        <span>
          <span className="font-medium text-foreground">{left != null ? formatBytes(left) : "…"}</span>
          <span className="text-muted-foreground"> left</span>
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground tabular">{detail}</p>
    </div>
  );
}

function StorageSection() {
  const { ds } = useData();
  const local = useLiveQuery(async () => {
    let bytes = 0;
    let count = 0;
    await getDb().imageBlobs.each((b) => {
      bytes += b.size;
      count++;
    });
    return { bytes, count };
  }, []);
  const cloud = useCloudUsage();
  const cloudPhotos = ds.images.filter((i) => isR2Key(i.storageKey)).length;
  const localPhotos = ds.images.length - cloudPhotos;
  return (
    <SettingsSection
      title="Photo storage"
      description="Photos are resized and compressed in the browser, then uploaded to Cloudflare R2. Business records stay on this device until the cloud database is connected."
    >
      <div className="grid gap-5">
        <div className="flex items-start gap-3">
          <Cloud className="mt-0.5 size-5 text-muted-foreground" />
          {cloud.error && !cloud.usage ? (
            <div className="flex-1 text-sm">
              <p className="font-medium">Cloud storage (Cloudflare R2)</p>
              <p className="mt-1 text-xs text-destructive">{cloud.error}</p>
            </div>
          ) : (
            <UsageMeter
              label="Cloud storage (Cloudflare R2)"
              used={cloud.usage?.bytes ?? null}
              quota={cloud.usage?.quotaBytes ?? 10 * 1024 ** 3}
              detail={`${cloudPhotos} vehicle photos · ${cloud.usage?.objects ?? 0} files in the bucket incl. thumbnails`}
            />
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            className="-mt-1.5"
            onClick={cloud.refresh}
            disabled={cloud.loading}
            aria-label="Refresh cloud storage usage"
          >
            <RefreshCw className={cn("size-4", cloud.loading && "animate-spin")} />
          </Button>
        </div>
        {(local?.count ?? 0) > 0 && (
          <div className="flex items-start gap-3">
            <HardDrive className="mt-0.5 size-5 text-muted-foreground" />
            <UsageMeter
              label="This browser (older photos, not used for new uploads)"
              used={local?.bytes ?? null}
              quota={ds.settings.storageQuotaGb * 1024 ** 3}
              detail={`${localPhotos} vehicle photos (${local?.count ?? 0} stored files incl. thumbnails) · avg ${localPhotos ? formatBytes(Math.round((local?.bytes ?? 0) / Math.max(1, localPhotos))) : "—"} per photo`}
            />
            <span className="w-8" />
          </div>
        )}
      </div>
    </SettingsSection>
  );
}

function DataSection() {
  const user = useCurrentUser();
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [confirm, setConfirm] = React.useState<"clear" | { importJson: string; name: string } | null>(null);

  async function doExport() {
    setBusy("export");
    try {
      const json = await exportBackup(getDb());
      downloadFile(`m-garage-backup-${todayISO()}.json`, json, "application/json");
      toast.success("Backup downloaded");
    } catch (e) {
      reportError(e);
    } finally {
      setBusy(null);
    }
  }

  return (
    <SettingsSection title="Data & backups" description="Records live in this browser's IndexedDB until the cloud database is connected. Back up before clearing browser data.">
      <div className="grid gap-3">
        {[
          { icon: Download, title: "Export local backup", desc: "Download all records and photos as a JSON file.", action: <Button variant="outline" size="sm" onClick={doExport} loading={busy === "export"}>Export</Button> },
          { icon: Upload, title: "Import local backup", desc: "Replace all data with a validated M Garage backup file.", action: <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>Import</Button> },
          { icon: Trash2, title: "Clear all business data", desc: "Delete all vehicles, sales, expenses and history. Staff and settings are kept.", action: <Button variant="destructive" size="sm" onClick={() => setConfirm("clear")}>Clear data</Button> },
        ].map((r) => (
          <div key={r.title} className="flex items-center gap-3 rounded-lg border p-3">
            <r.icon className="size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium">{r.title}</div>
              <div className="text-xs text-muted-foreground">{r.desc}</div>
            </div>
            {r.action}
          </div>
        ))}
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Database className="size-3.5" /> Not a production backup. Real deployments need server-side backups and recovery.</p>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          setConfirm({ importJson: await f.text(), name: f.name });
        }}
      />
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm === "clear" ? "Clear all business data?" : "Import backup?"}
        description={
          confirm === "clear"
            ? "Every vehicle, purchase, sale, payment, expense, photo and activity entry will be permanently deleted from this browser."
            : confirm && typeof confirm === "object"
              ? `All current data will be replaced with the contents of ${confirm.name}. The file is validated first; if it's invalid, nothing changes.`
              : undefined
        }
        confirmLabel={confirm === "clear" ? "Clear everything" : "Import and replace"}
        tone="destructive"
        onConfirm={async () => {
          try {
            if (confirm === "clear") {
              await clearBusinessData(getDb(), user);
              toast.success("Business data cleared");
            } else if (confirm && typeof confirm === "object") {
              const result = await importBackup(getDb(), confirm.importJson, user);
              if (!result.ok) {
                toast.error(result.message);
                return false;
              }
              toast.success(`Backup imported: ${result.counts.vehicles} vehicles, ${result.counts.sales} sales, ${result.counts.photos} photos`);
            }
          } catch (e) {
            reportError(e);
            return false;
          }
        }}
      />
    </SettingsSection>
  );
}
