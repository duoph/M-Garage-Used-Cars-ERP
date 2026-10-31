"use client";
import * as React from "react";
import { CheckCircle2, CircleDashed, FileText, Paperclip, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { useData } from "@/components/providers/data-provider";
import { useAuth, useCurrentUser } from "@/hooks/use-auth";
import { dealerService } from "@/lib/services/dealer-service";
import { reportError } from "@/hooks/use-commands";
import { ACCEPTED_DOCUMENT_TYPES, R2_MAX_OBJECT_BYTES, r2ImageUrl } from "@/lib/images/r2-keys";
import { DOCUMENT_KIND_LABELS } from "@/lib/utils/labels";
import { formatDate } from "@/lib/utils/dates";
import { cn } from "@/lib/utils/cn";
import { DOCUMENT_KINDS, type DocumentKind, type DocumentOwner, type StoredDocument } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/shared/form-field";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";

const formatSize = (bytes: number) => (bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

/**
 * Scanned papers for a purchase, sale or car: ID proofs, sale letters, RC, insurance… stored in R2.
 * `checklist` lists the papers this record should have; each shows as collected or missing.
 */
export function DocumentsCard({
  ownerType,
  ownerId,
  title = "Documents",
  description,
  checklist = [],
  includeVehicleId,
  className,
}: {
  ownerType: DocumentOwner;
  ownerId: string;
  title?: string;
  description?: string;
  checklist?: DocumentKind[];
  /** Also list papers attached to this car's purchase and sale. */
  includeVehicleId?: string;
  className?: string;
}) {
  const { ds, idx } = useData();
  const { can } = useAuth();
  const user = useCurrentUser();
  const [uploading, setUploading] = React.useState<DocumentKind | null>(null);
  const [removing, setRemoving] = React.useState<StoredDocument | null>(null);
  if (!can("documents.view")) return null;
  const canManage = can("documents.manage");

  const docs = ds.documents
    .filter((d) => (d.ownerType === ownerType && d.ownerId === ownerId) || (includeVehicleId && d.vehicleId === includeVehicleId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const has = (k: DocumentKind) => docs.some((d) => d.kind === k);

  return (
    <Card className={className}>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-1.5"><Paperclip className="size-4 text-muted-foreground" /> {title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        {canManage && <Button variant="outline" size="sm" onClick={() => setUploading(checklist.find((k) => !has(k)) ?? "other")}><Upload /> Upload</Button>}
      </CardHeader>
      {checklist.length > 0 && (
        <ul className="flex flex-wrap gap-2 px-4 pb-3">
          {checklist.map((k) => {
            const done = has(k);
            return (
              <li key={k}>
                <button
                  type="button"
                  disabled={done || !canManage}
                  onClick={() => setUploading(k)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs",
                    done ? "border-[#c6eedb] bg-success-soft text-success" : "border-dashed text-muted-foreground enabled:hover:border-primary/40 enabled:hover:text-foreground",
                  )}
                >
                  {done ? <CheckCircle2 className="size-3.5" /> : <CircleDashed className="size-3.5" />}
                  {DOCUMENT_KIND_LABELS[k]}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {docs.length === 0 ? (
        <p className="border-t px-4 py-4 text-[13px] text-muted-foreground">No documents uploaded yet. PDF, JPEG, PNG or WebP up to {R2_MAX_OBJECT_BYTES / 1024 / 1024} MB.</p>
      ) : (
        <ul className="divide-y border-t">
          {docs.map((d) => {
            const url = r2ImageUrl(d.storageKey);
            const image = d.mimeType.startsWith("image/");
            const from = d.ownerType !== ownerType || d.ownerId !== ownerId ? (d.ownerType === "purchase" ? "From purchase" : d.ownerType === "sale" ? "From sale" : "On the car") : null;
            return (
              <li key={d.id} className="flex items-center gap-3 px-4 py-2.5">
                <a href={url} target="_blank" rel="noreferrer" className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
                  {image ? (
                    // eslint-disable-next-line @next/next/no-img-element -- signed R2 redirect
                    <img src={url} alt="" className="size-full object-cover" loading="lazy" />
                  ) : (
                    <FileText className="size-5 text-[#b42318]" />
                  )}
                </a>
                <div className="min-w-0 flex-1">
                  <a href={url} target="_blank" rel="noreferrer" className="block truncate text-sm font-medium hover:underline">{d.title}</a>
                  <p className="truncate text-xs text-muted-foreground">
                    {DOCUMENT_KIND_LABELS[d.kind]} · {formatSize(d.size)} · {formatDate(d.createdAt)} by {idx.users.get(d.uploadedBy)?.name ?? "—"}
                    {from && <> · {from}</>}
                  </p>
                </div>
                {canManage && (
                  <Button variant="ghost" size="icon-sm" onClick={() => setRemoving(d)} aria-label={`Remove ${d.title}`}><Trash2 /></Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {uploading && <UploadDialog ownerType={ownerType} ownerId={ownerId} kind={uploading} onClose={() => setUploading(null)} />}
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="Remove this document?"
        description={removing && <><strong>{removing.title}</strong> ({removing.fileName}) will be deleted from storage. This is recorded in the activity log.</>}
        confirmLabel="Remove"
        tone="destructive"
        onConfirm={async () => {
          if (!removing) return;
          try {
            await dealerService.removeDocument(user, removing.id);
            toast.success("Document removed");
          } catch (e) {
            reportError(e);
            return false;
          }
        }}
      />
    </Card>
  );
}

function UploadDialog({ ownerType, ownerId, kind: initialKind, onClose }: { ownerType: DocumentOwner; ownerId: string; kind: DocumentKind; onClose: () => void }) {
  const user = useCurrentUser();
  const [kind, setKind] = React.useState<DocumentKind>(initialKind);
  const [title, setTitle] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  function pick(f: File | undefined) {
    setError(null);
    if (!f) return setFile(null);
    if (!ACCEPTED_DOCUMENT_TYPES.includes(f.type)) return setError("Use a PDF, JPEG, PNG or WebP file.");
    if (f.size > R2_MAX_OBJECT_BYTES) return setError(`This file is ${formatSize(f.size)}. The limit is ${R2_MAX_OBJECT_BYTES / 1024 / 1024} MB.`);
    setFile(f);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return setError("Choose a file to upload.");
    setSaving(true);
    try {
      await dealerService.uploadDocument(user, { ownerType, ownerId, kind, title: title.trim() }, file, file.name);
      toast.success(`${DOCUMENT_KIND_LABELS[kind]} uploaded`);
      onClose();
    } catch (err) {
      reportError(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form onSubmit={submit} className="flex min-h-0 flex-col" noValidate>
          <DialogHeader>
            <DialogTitle>Upload document</DialogTitle>
            <DialogDescription>Scan or photograph the paper. It is stored privately and only staff with document access can open it.</DialogDescription>
          </DialogHeader>
          <DialogBody className="grid gap-4">
            <Field label="Document" htmlFor="doc-kind" required>
              <Select value={kind} onValueChange={(v) => setKind(v as DocumentKind)}>
                <SelectTrigger id="doc-kind"><SelectValue /></SelectTrigger>
                <SelectContent>{DOCUMENT_KINDS.map((k) => <SelectItem key={k} value={k}>{DOCUMENT_KIND_LABELS[k]}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Label" htmlFor="doc-title" hint="Optional, e.g. “Aadhaar — front and back”.">
              <Input id="doc-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder={DOCUMENT_KIND_LABELS[kind]} />
            </Field>
            <Field label="File" htmlFor="doc-file" error={error ?? undefined} required hint={file ? `${file.name} · ${formatSize(file.size)}` : "PDF, JPEG, PNG or WebP"}>
              <Input id="doc-file" type="file" accept={ACCEPTED_DOCUMENT_TYPES.join(",")} onChange={(e) => pick(e.target.files?.[0])} className="pt-1.5" />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button type="submit" loading={saving}><Upload /> Upload</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
