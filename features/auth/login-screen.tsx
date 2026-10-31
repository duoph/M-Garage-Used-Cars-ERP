"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Info, ShieldCheck } from "lucide-react";
import { useData } from "@/components/providers/data-provider";
import { useSessionStore } from "@/lib/store/session";
import { ROLE_LABELS } from "@/lib/utils/labels";
import { Wordmark } from "@/components/shared/logo";
import { UserAvatar } from "@/components/shared/user-avatar";
import type { Role } from "@/types";

const ROLE_SUMMARY: Record<Role, string> = {
  admin: "Full access, including staff accounts and settings",
  manager: "Operations, purchasing, pricing and profit",
  office: "Papers, documents, vouchers and the cash book",
  sales: "Stock, reservations and sales — no cost or profit",
  accountant: "Payments, expenses and financial reports",
};

const ROLE_ORDER: Role[] = ["admin", "manager", "office", "sales", "accountant"];

export function LoginScreen() {
  const { ds } = useData();
  const router = useRouter();
  const signIn = useSessionStore((s) => s.signIn);
  const users = ds.users
    .filter((u) => u.status === "active")
    .sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || a.name.localeCompare(b.name));

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.1fr]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-[#050505] p-10 text-white lg:flex">
        <Wordmark dark className="-ml-6 w-80 [mask-image:radial-gradient(ellipse_at_center,black_55%,transparent_78%)]" />
        <div className="relative z-10 max-w-md">
          <h1 className="text-3xl font-semibold tracking-tight">Run M Garage from one place.</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-sidebar-foreground">
            Purchases, stock, papers, sales, cash book and accounts — with profit you can trust, down to the paisa.
          </p>
          <ul className="mt-8 grid gap-3 text-sm text-sidebar-foreground">
            {["Every car's landed cost and margin, automatically", "Cash & bank book, receipt and payment vouchers, P&L", "Insurance, PUC and hypothecation alerts with scanned papers"].map((t) => (
              <li key={t} className="flex items-center gap-2.5">
                <ShieldCheck className="size-4 text-[#ef4444]" /> {t}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative z-10 text-xs text-white/60">© {new Date().getFullYear()} M Garage · Pre Owned Cars</p>
      </aside>
      <main className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <Wordmark className="mx-auto mb-8 w-60 lg:hidden" />
          <h2 className="text-xl font-semibold tracking-tight">Sign in to {ds.settings.showroomName}</h2>
          <p className="mt-1 text-sm text-muted-foreground">Choose your account to continue.</p>
          <div className="mt-4 flex gap-2.5 rounded-lg border border-[#fde7b0] bg-warning-soft p-3 text-[13px] text-[#7a3e06]">
            <Info className="mt-0.5 size-4 shrink-0" />
            <p>
              <strong className="font-semibold">Not real authentication yet.</strong> There are no passwords and all data stays in
              this browser until the cloud database and secure sign-in are connected.
            </p>
          </div>
          <ul className="mt-4 grid gap-2">
            {users.map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  onClick={() => {
                    signIn(u.id);
                    router.replace("/");
                  }}
                  className="group flex w-full items-center gap-3 rounded-xl border bg-card p-3 text-left shadow-xs transition-colors hover:border-primary/40 hover:bg-primary-soft/40 focus-visible:ring-2 focus-visible:ring-ring/40 outline-none"
                >
                  <UserAvatar name={u.name} size="lg" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{u.name}</span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{ROLE_LABELS[u.role]}</span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{ROLE_SUMMARY[u.role]}</p>
                  </div>
                  <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </main>
    </div>
  );
}
