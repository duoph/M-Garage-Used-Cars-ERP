"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Info, ShieldCheck } from "lucide-react";
import { useData } from "@/components/providers/data-provider";
import { useSessionStore } from "@/lib/store/session";
import { ROLE_LABELS } from "@/lib/utils/labels";
import { Logo } from "@/components/shared/logo";
import { UserAvatar } from "@/components/shared/user-avatar";
import type { Role } from "@/types";

const ROLE_SUMMARY: Record<Role, string> = {
  admin: "Full access, including staff accounts and settings",
  manager: "Operations, purchasing, pricing and profit",
  sales: "Stock, reservations and sales — no cost or profit",
  accountant: "Payments, expenses and financial reports",
};

const ROLE_ORDER: Role[] = ["admin", "manager", "sales", "accountant"];

export function LoginScreen() {
  const { ds } = useData();
  const router = useRouter();
  const signIn = useSessionStore((s) => s.signIn);
  const users = ds.users
    .filter((u) => u.status === "active")
    .sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || a.name.localeCompare(b.name));

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.1fr]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-sidebar p-10 text-white lg:flex">
        <Logo dark tagline />
        <div className="relative z-10 max-w-md">
          <h1 className="text-3xl font-semibold tracking-tight">Run your showroom from one place.</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-sidebar-foreground">
            Purchases, stock, photos, sales, payments and expenses — with profit you can trust, down to the paisa.
          </p>
          <ul className="mt-8 grid gap-3 text-sm text-sidebar-foreground">
            {["Every car's landed cost and margin, automatically", "Role-based access for owners, managers, sales and accounts", "Printable sale receipts and clean CSV exports"].map((t) => (
              <li key={t} className="flex items-center gap-2.5">
                <ShieldCheck className="size-4 text-sidebar-highlight" /> {t}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative z-10 text-xs text-sidebar-muted">© {new Date().getFullYear()} Duoph Technologies</p>
        <div className="pointer-events-none absolute -right-32 -bottom-40 size-[520px] rounded-full border border-white/5" />
        <div className="pointer-events-none absolute -right-16 -bottom-24 size-[360px] rounded-full border border-white/5" />
      </aside>
      <main className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <Logo tagline className="mb-8 lg:hidden" />
          <h2 className="text-xl font-semibold tracking-tight">Sign in to {ds.settings.showroomName}</h2>
          <p className="mt-1 text-sm text-muted-foreground">Choose a demo employee to explore DealerOS with that role&apos;s permissions.</p>
          <div className="mt-4 flex gap-2.5 rounded-lg border border-[#fde7b0] bg-warning-soft p-3 text-[13px] text-[#7a3e06]">
            <Info className="mt-0.5 size-4 shrink-0" />
            <p>
              <strong className="font-semibold">Demo access, not real authentication.</strong> There are no passwords and all data stays in
              this browser. Production will use secure, server-enforced sign-in.
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
