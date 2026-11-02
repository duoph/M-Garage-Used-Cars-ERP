"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, Menu, Plus, Receipt, ShoppingCart, Wallet } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useData } from "@/components/providers/data-provider";
import { useUiStore } from "@/lib/store/ui";
import { useDialogStore } from "@/lib/store/dialogs";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ActivityFeed } from "@/features/activity/activity-feed";
import { GlobalSearchTrigger } from "./global-search";

export function Topbar() {
  const { can } = useAuth();
  const { ds } = useData();
  const router = useRouter();
  const setMobileNavOpen = useUiStore((s) => s.setMobileNavOpen);
  const openExpense = useDialogStore((s) => s.openExpense);
  const [lastSeen, setLastSeen] = React.useState<string | null>(null);

  const canQuickAdd = can("purchases.manage") || can("sales.create") || can("expenses.manage");
  const latest = ds.activity[0]?.timestamp ?? null;
  const unread = latest !== null && latest !== lastSeen;

  return (
    <header className="no-print sticky top-0 z-20 flex h-12 items-center gap-2 border-b bg-background/90 px-4 backdrop-blur lg:px-6">
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
    </header>
  );
}
