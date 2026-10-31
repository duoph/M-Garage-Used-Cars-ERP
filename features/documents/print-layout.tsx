"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Printer, type LucideIcon } from "lucide-react";
import { useData } from "@/components/providers/data-provider";
import { useAuth } from "@/hooks/use-auth";
import { useHydrated } from "@/hooks/use-hydrated";
import type { Permission } from "@/lib/permissions";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { AccessDenied } from "@/components/shared/access-denied";
import { BootScreen } from "@/components/shared/boot-screen";
import { ShowroomLogo } from "@/components/shared/showroom-logo";
import { Wordmark } from "@/components/shared/logo";

/**
 * Shared pieces for the printable receipt and invoice: an A4 sheet on a grey page, a toolbar
 * that is hidden when printing, the showroom letterhead and the signature block.
 */

/** Sends signed-out visitors to the login page; returns a screen to show instead of the document, if any. */
export function usePrintGate(permission: Permission): React.ReactNode | null {
  const { user, can } = useAuth();
  const router = useRouter();
  const hydrated = useHydrated();
  React.useEffect(() => {
    if (hydrated && !user) router.replace("/login");
  }, [hydrated, user, router]);
  if (!hydrated || !user) return <BootScreen />;
  if (!can(permission)) return <AccessDenied />;
  return null;
}

export function DocumentNotFound({ icon, title, href, label }: { icon: LucideIcon; title: string; href: string; label: string }) {
  return (
    <EmptyState icon={icon} title={title} action={<Button asChild variant="outline"><Link href={href}>{label}</Link></Button>} className="py-24" />
  );
}

export function PrintPage({ back, actions, children }: { back: { href: string; label: string }; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-[#eef0f3] py-6 print:bg-white print:py-0">
      <div className="no-print mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center justify-between gap-2 px-4">
        <Button variant="ghost" asChild>
          <Link href={back.href}><ArrowLeft /> {back.label}</Link>
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          {actions}
          <Button onClick={() => window.print()}><Printer /> Print / Save as PDF</Button>
        </div>
      </div>
      <article className="mx-auto max-w-[210mm] bg-white px-6 py-8 text-sm leading-relaxed text-[#111827] sm:px-14 sm:py-14 print:max-w-none print:p-0">
        {children}
      </article>
    </div>
  );
}

/** Showroom name and contacts on the left, the document title and its numbers on the right. */
export function Letterhead({ title, children }: { title: string; children: React.ReactNode }) {
  const s = useData().ds.settings;
  return (
    <header className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
      <div className="flex items-start gap-4">
        {s.logoKey ? <ShowroomLogo className="size-14" /> : <Wordmark className="w-28" />}
        <div>
          <h1 className="text-base font-semibold">{s.showroomName}</h1>
          {/* Lines are skipped when empty so a half-filled profile never prints stray commas. */}
          <p className="text-xs text-[#6b7280]">
            {[[s.address, s.city].filter(Boolean).join(", "), [s.phone, s.email].filter(Boolean).join(", "), s.gstin && `GSTIN ${s.gstin}`]
              .filter(Boolean)
              .map((line, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <br />}
                  {line}
                </React.Fragment>
              ))}
          </p>
        </div>
      </div>
      <div className="sm:text-right">
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="text-xs text-[#6b7280]">{children}</p>
      </div>
    </header>
  );
}

export function Signature() {
  const s = useData().ds.settings;
  return (
    <div className="mt-16 text-right text-xs">
      <p>For {s.showroomName}</p>
      <p className="mt-12 text-[#6b7280]">Authorised signatory</p>
    </div>
  );
}

/** Label/amount rows; `strong` rows are bold, `gap` adds space above a row. */
export function AmountRows({ rows }: { rows: { label: React.ReactNode; value: React.ReactNode; strong?: boolean; gap?: boolean; note?: React.ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-[1fr_auto] gap-x-8 gap-y-2 tabular">
      {rows.map((r, i) => (
        <React.Fragment key={i}>
          <dt className={cn(r.strong ? "font-semibold" : "text-[#6b7280]", r.gap && "mt-4")}>{r.label}</dt>
          <dd className={cn("text-right", r.strong && "font-semibold", r.gap && "mt-4")}>{r.value}</dd>
          {r.note && <dd className="col-span-2 -mt-1.5 text-xs text-[#6b7280]">{r.note}</dd>}
        </React.Fragment>
      ))}
    </dl>
  );
}
