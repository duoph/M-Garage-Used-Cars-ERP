"use client";
import * as React from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * Confirmation for destructive or financially significant actions. Optionally requires a
 * written reason (kept in the activity log). `onConfirm` returning `false` keeps it open.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  tone = "default",
  requireReason = false,
  reasonLabel = "Reason",
  reasonPlaceholder,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  tone?: "default" | "destructive";
  requireReason?: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  onConfirm: (reason: string) => Promise<boolean | void> | boolean | void;
  children?: React.ReactNode;
}) {
  const [reason, setReason] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const id = React.useId();

  const setOpen = (o: boolean) => {
    if (!o) setReason("");
    onOpenChange(o);
  };

  const disabled = pending || (requireReason && reason.trim().length < 5);

  async function handleConfirm() {
    setPending(true);
    try {
      const result = await onConfirm(reason.trim());
      if (result !== false) setOpen(false);
    } finally {
      setPending(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription asChild><div>{description}</div></AlertDialogDescription>}
        </AlertDialogHeader>
        {children}
        {requireReason && (
          <div className="grid gap-1.5">
            <Label htmlFor={id}>
              {reasonLabel} <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id={id}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={reasonPlaceholder ?? "Explain why (min. 5 characters)"}
              rows={3}
              autoFocus
            />
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <Button variant={tone === "destructive" ? "destructive" : "default"} onClick={handleConfirm} disabled={disabled} loading={pending}>
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
