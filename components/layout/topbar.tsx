"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, Check, FileText, LogOut, Menu, Palette, Plus, Receipt, Settings, ShoppingCart, UserRoundCog, Wallet } from "lucide-react";
import { THEMES } from "@/lib/themes";
import { cn } from "@/lib/utils/cn";
import { useAuth } from "@/hooks/use-auth";
import { useData } from "@/components/providers/data-provider";
import { useSessionStore } from "@/lib/store/session";
import { useUiStore } from "@/lib/store/ui";
import { useDialogStore } from "@/lib/store/dialogs";
import { ROLE_LABELS } from "@/lib/utils/labels";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { UserAvatar } from "@/components/shared/user-avatar";
import { ActivityFeed } from "@/features/activity/activity-feed";
import { GlobalSearchTrigger } from "./global-search";
import { toast } from "sonner";

export function Topbar() {
  const { user, can } = useAuth();
  const { ds } = useData();
  const router = useRouter();
  const signIn = useSessionStore((s) => s.signIn);
  const signOut = useSessionStore((s) => s.signOut);
  const setMobileNavOpen = useUiStore((s) => s.setMobileNavOpen);
  const openExpense = useDialogStore((s) => s.openExpense);
  const [lastSeen, setLastSeen] = React.useState<string | null>(null);

  const canQuickAdd = can("purchases.manage") || can("sales.create") || can("expenses.manage");
  const latest = ds.activity[0]?.timestamp ?? null;
  const unread = latest !== null && latest !== lastSeen;
  const personas = ds.users.filter((u) => u.status === "active");

  return (
    <header className="sticky top-0 z-20 flex h-12 items-center gap-2 border-b bg-background/90 px-4 backdrop-blur lg:px-6">
      <Button variant="ghost" size="icon" className="lg:hidden -ml-1.5" onClick={() => setMobileNavOpen(true)} aria-label="Open navigation">
        <Menu />
      </Button>
      <div className="min-w-0 flex-1">
        <GlobalSearchTrigger />
      </div>
      {canQuickAdd && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" className="gap-1.5">
              <Plus />
              <span className="hidden sm:inline">New</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-52">
            {can("purchases.manage") && (
              <DropdownMenuItem onSelect={() => router.push("/purchases/new")}>
                <ShoppingCart /> Add purchase / vehicle
              </DropdownMenuItem>
            )}
            {can("sales.create") && (
              <DropdownMenuItem onSelect={() => router.push("/quotes/new")}>
                <FileText /> New quote
              </DropdownMenuItem>
            )}
            {can("sales.create") && (
              <DropdownMenuItem onSelect={() => router.push("/sales/new")}>
                <Receipt /> Record sale
              </DropdownMenuItem>
            )}
            {can("expenses.manage") && (
              <DropdownMenuItem onSelect={() => openExpense()}>
                <Wallet /> Add expense
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <Popover onOpenChange={(o) => o && setLastSeen(latest)}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="relative" aria-label="Recent activity">
            <Bell />
            {unread && <span className="absolute top-2 right-2 size-2 rounded-full bg-primary ring-2 ring-card" />}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[min(380px,calc(100vw-2rem))] p-0">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <p className="text-sm font-semibold">Recent activity</p>
            {can("activity.view") && (
              <Link href="/activity" className="text-xs font-medium text-primary hover:underline">
                View all
              </Link>
            )}
          </div>
          <div className="max-h-[420px] overflow-y-auto px-4">
            <ActivityFeed limit={10} compact />
          </div>
        </PopoverContent>
      </Popover>
      {user && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center rounded-full p-0.5 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/30 outline-none"
              aria-label="Account menu"
            >
              <UserAvatar name={user.name} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-64">
            <DropdownMenuLabel className="font-normal">
              <div className="text-sm font-medium text-foreground">{user.name}</div>
              <div className="text-xs">{ROLE_LABELS[user.role]}{user.email && ` · ${user.email}`}</div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="flex items-center gap-1.5">
              <UserRoundCog className="size-3.5" /> Switch account
            </DropdownMenuLabel>
            {personas.map((p) => (
              <DropdownMenuItem
                key={p.id}
                disabled={p.id === user.id}
                onSelect={() => {
                  signIn(p.id);
                  toast.success(`Now viewing as ${p.name} (${ROLE_LABELS[p.role]})`);
                }}
              >
                <UserAvatar name={p.name} size="sm" />
                <span className="flex-1 truncate">{p.name}</span>
                <span className="text-[11px] text-muted-foreground">{ROLE_LABELS[p.role]}</span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <ThemeSwatches />
            <DropdownMenuSeparator />
            {can("settings.manage") && (
              <DropdownMenuItem onSelect={() => router.push("/settings")}>
                <Settings /> Settings
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onSelect={() => {
                signOut();
                router.replace("/login");
              }}
            >
              <LogOut /> Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </header>
  );
}

/** Quick colour-theme picker for everyone (Settings → Appearance is admin-only). */
function ThemeSwatches() {
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  return (
    <div className="px-2 py-1.5">
      <p className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground"><Palette className="size-3.5" /> Theme</p>
      <div role="radiogroup" aria-label="Colour theme" className="flex flex-wrap gap-1.5">
        {THEMES.map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={t.id === theme}
            aria-label={t.label}
            title={t.label}
            onClick={() => setTheme(t.id)}
            className={cn(
              "flex size-6 items-center justify-center rounded-full ring-offset-2 ring-offset-popover outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              t.id === theme && "ring-2 ring-foreground/70",
            )}
            style={{ background: `linear-gradient(135deg, ${t.sidebar} 50%, ${t.primary} 50%)` }}
          >
            {t.id === theme && <Check className="size-3 text-white" aria-hidden />}
          </button>
        ))}
      </div>
    </div>
  );
}
