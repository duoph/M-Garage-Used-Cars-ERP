"use client";
import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { useAuth } from "@/hooks/use-auth";
import { useHydrated } from "@/hooks/use-hydrated";
import { useUiStore } from "@/lib/store/ui";
import { useSessionStore } from "@/lib/store/session";
import { supabaseConfigured } from "@/lib/supabase/env";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { canAccessPath } from "@/lib/permissions";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Dialog as P } from "radix-ui";
import { AccessDenied } from "@/components/shared/access-denied";
import { BootScreen } from "@/components/shared/boot-screen";
import { ExpenseDialogHost } from "@/features/expenses/expense-dialog";
import { VoucherDialogHost } from "@/features/accounts/voucher-dialog";
import { Sidebar, SidebarNav } from "./sidebar";
import { Topbar } from "./topbar";
import { GlobalSearch } from "./global-search";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const mobileNavOpen = useUiStore((s) => s.mobileNavOpen);
  const setMobileNavOpen = useUiStore((s) => s.setMobileNavOpen);
  // Session lives in localStorage; wait for the client before deciding to redirect.
  const hydrated = useHydrated();
  const authUserId = useSessionStore((s) => s.authUserId);
  // With Supabase, the live Supabase session must belong to the profile this browser remembers.
  const [authChecked, setAuthChecked] = React.useState(!supabaseConfigured);

  React.useEffect(() => {
    if (!supabaseConfigured || !hydrated) return;
    const supabase = getSupabaseBrowserClient();
    let cancelled = false;
    const reject = () => {
      useSessionStore.getState().signOut();
      router.replace("/login");
    };
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (!data.session || data.session.user.id !== authUserId) reject();
      else setAuthChecked(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || (session && session.user.id !== authUserId)) reject();
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [hydrated, authUserId, router]);

  React.useEffect(() => {
    if (hydrated && !user) router.replace("/login");
  }, [hydrated, user, router]);

  React.useEffect(() => setMobileNavOpen(false), [pathname, setMobileNavOpen]);

  if (!hydrated || !user || !authChecked) return <BootScreen />;

  return (
    <div className="min-h-dvh">
      <Sidebar />
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="w-[min(18rem,85vw)] border-none p-0" hideClose>
          <P.Title className="sr-only">Navigation</P.Title>
          <P.Description className="sr-only">Main navigation menu</P.Description>
          <SidebarNav mobile onNavigate={() => setMobileNavOpen(false)} />
        </SheetContent>
      </Sheet>
      <div className={cn("flex min-h-dvh flex-col transition-[padding] duration-200 print:pl-0!", collapsed ? "lg:pl-[68px]" : "lg:pl-60")}>
        <Topbar />
        <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-4 sm:px-5 lg:px-6 lg:py-5">
          {/* Keyed by path so each page fades in gently on navigation. */}
          <div key={pathname} className="animate-in fade-in-0 slide-in-from-bottom-1 duration-300 ease-out motion-reduce:animate-none">
            {canAccessPath(user, pathname) ? children : <AccessDenied />}
          </div>
        </main>
        <footer className="no-print px-4 py-3 text-center text-[11px] text-muted-foreground/70 sm:px-6">
          {supabaseConfigured ? "Signed in with Supabase · records are still saved in this browser" : "Local mode · data stays in this browser"}
        </footer>
      </div>
      <GlobalSearch />
      <ExpenseDialogHost />
      <VoucherDialogHost />
    </div>
  );
}
