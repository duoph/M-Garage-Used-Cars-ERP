"use client";
import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { useAuth } from "@/hooks/use-auth";
import { useHydrated } from "@/hooks/use-hydrated";
import { useUiStore } from "@/lib/store/ui";
import { canAccessPath } from "@/lib/permissions";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Dialog as P } from "radix-ui";
import { AccessDenied } from "@/components/shared/access-denied";
import { BootScreen } from "@/components/shared/boot-screen";
import { ExpenseDialogHost } from "@/features/expenses/expense-dialog";
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

  React.useEffect(() => {
    if (hydrated && !user) router.replace("/login");
  }, [hydrated, user, router]);

  React.useEffect(() => setMobileNavOpen(false), [pathname, setMobileNavOpen]);

  if (!hydrated || !user) return <BootScreen />;

  return (
    <div className="min-h-dvh">
      <Sidebar />
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="w-64 border-none p-0" hideClose>
          <P.Title className="sr-only">Navigation</P.Title>
          <P.Description className="sr-only">Main navigation menu</P.Description>
          <SidebarNav onNavigate={() => setMobileNavOpen(false)} />
        </SheetContent>
      </Sheet>
      <div className={cn("flex min-h-dvh flex-col transition-[padding] duration-200", collapsed ? "lg:pl-[68px]" : "lg:pl-60")}>
        <Topbar />
        <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-4 sm:px-5 lg:px-6 lg:py-5">
          {/* Keyed by path so each page fades in gently on navigation. */}
          <div key={pathname} className="animate-in fade-in-0 slide-in-from-bottom-1 duration-300 ease-out motion-reduce:animate-none">
            {canAccessPath(user.role, pathname) ? children : <AccessDenied />}
          </div>
        </main>
        <footer className="no-print px-4 py-3 text-center text-[11px] text-muted-foreground/70 sm:px-6">
          Local mode · data stays in this browser
        </footer>
      </div>
      <GlobalSearch />
      <ExpenseDialogHost />
    </div>
  );
}
