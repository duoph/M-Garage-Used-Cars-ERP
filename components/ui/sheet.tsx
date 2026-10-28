"use client";
import * as React from "react";
import { Dialog as P } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export const Sheet = P.Root;
export const SheetTrigger = P.Trigger;
export const SheetClose = P.Close;

export function SheetContent({
  className,
  children,
  side = "right",
  hideClose = false,
  ...props
}: React.ComponentProps<typeof P.Content> & { side?: "left" | "right"; hideClose?: boolean }) {
  return (
    <P.Portal>
      <P.Overlay className="fixed inset-0 z-50 bg-[#0b1220]/45 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
      <P.Content
        className={cn(
          "fixed inset-y-0 z-50 flex h-full w-full flex-col bg-card shadow-2xl outline-none transition data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:duration-300 data-[state=closed]:duration-200",
          side === "right"
            ? "right-0 border-l sm:max-w-xl data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right"
            : "left-0 border-r max-w-72 data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left",
          className,
        )}
        {...props}
      >
        {children}
        {!hideClose && (
          <P.Close className="absolute top-4 right-4 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
            <X className="size-4" />
            <span className="sr-only">Close</span>
          </P.Close>
        )}
      </P.Content>
    </P.Portal>
  );
}
export function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1 border-b px-4 py-4 pr-12", className)} {...props} />;
}
export function SheetBody({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("min-h-0 flex-1 overflow-y-auto px-4 py-4", className)} {...props} />;
}
export function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col-reverse gap-2 border-t bg-muted/40 px-4 py-3 sm:flex-row sm:justify-end", className)} {...props} />;
}
export function SheetTitle({ className, ...props }: React.ComponentProps<typeof P.Title>) {
  return <P.Title className={cn("text-base font-semibold", className)} {...props} />;
}
export function SheetDescription({ className, ...props }: React.ComponentProps<typeof P.Description>) {
  return <P.Description className={cn("text-sm text-muted-foreground", className)} {...props} />;
}
