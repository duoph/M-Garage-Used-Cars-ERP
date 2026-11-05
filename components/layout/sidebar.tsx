"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronsLeft, LogOut, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { NAV_ITEMS, NAV_SECTIONS, isActivePath } from "@/lib/navigation";
import { activeVehicles, outstandingBalances, vehicleView } from "@/lib/calculations/selectors";
import { purchaseBalance } from "@/lib/calculations/finance";
import { ROLE_LABELS } from "@/lib/utils/labels";
import { useAuth } from "@/hooks/use-auth";
import { useData } from "@/components/providers/data-provider";
import { useUiStore } from "@/lib/store/ui";
import { signOutEverywhere } from "@/features/auth/supabase-auth";
import { ShowroomLogo } from "@/components/shared/showroom-logo";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AGING_DAYS } from "@/features/dashboard/needs-attention";

type Badge = { value: number; title: string; tone: "warning" | "info" };

/** Counts shown next to nav items — only when something needs action, and only to people who can act on it. */
function useNavBadges(): Record<string, Badge | undefined> {
  const { ds, idx } = useData();
  const { can } = useAuth();
  const badges: Record<string, Badge | undefined> = {};

  const due = can("sales.viewAll") ? outstandingBalances(ds, idx).count : 0;
  if (due) badges["/sales"] = { value: due, title: `${due} sale${due > 1 ? "s" : ""} with a balance due`, tone: "warning" };

  if (can("inventory.view")) {
    const aging = activeVehicles(ds).filter((v) => v.status !== "sold" && vehicleView(v, idx).stockAgeDays > AGING_DAYS).length;
    if (aging) badges["/inventory"] = { value: aging, title: `${aging} car${aging > 1 ? "s" : ""} in stock over ${AGING_DAYS} days`, tone: "info" };
  }

  if (can("finance.viewCost")) {
    const owed = ds.purchases.filter((p) => p.status === "active" && purchaseBalance(p) > 0).length;
    if (owed) badges["/purchases"] = { value: owed, title: `${owed} seller${owed > 1 ? "s" : ""} still to be paid`, tone: "info" };
  }
  return badges;
}

/**
 * The navigation panel, shared by the desktop sidebar and the phone drawer. `mobile` makes rows taller for
 * thumbs and adds a close button; `collapsed` (desktop only) shows icons with tooltips.
 */
export function SidebarNav({ collapsed = false, mobile = false, onNavigate }: { collapsed?: boolean; mobile?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const { can } = useAuth();
  const { ds } = useData();
  const items = NAV_ITEMS.filter((i) => can(i.permission));
  const badges = useNavBadges();

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className={cn("flex shrink-0 items-center gap-2.5 border-b border-sidebar-border", collapsed ? "h-12 justify-center px-2" : "h-12 px-3", mobile && "h-16")}>
        <ShowroomLogo className={cn("size-8 shrink-0 rounded-lg text-xs ring-1 ring-white/10", mobile && "size-9")} />
        {!collapsed && (
          <div className="min-w-0 flex-1 leading-tight">
            <div className={cn("truncate font-semibold text-white", mobile ? "text-[15px]" : "text-sm")} title={ds.settings.showroomName}>
              {ds.settings.showroomName}
            </div>
            <div className="text-[10px] font-medium tracking-[0.14em] text-sidebar-muted uppercase">Pre Owned Cars</div>
          </div>
        )}
        {mobile && (
          <button
            type="button"
            onClick={onNavigate}
            className="-mr-1 flex size-9 items-center justify-center rounded-md text-sidebar-muted hover:bg-sidebar-accent hover:text-white focus-visible:ring-2 focus-visible:ring-sidebar-highlight/60 outline-none"
            aria-label="Close navigation"
          >
            <X className="size-5" />
          </button>
        )}
      </div>

      <nav aria-label="Main" className="flex-1 overflow-y-auto px-2 py-2 [scrollbar-color:var(--sidebar-accent)_transparent] [scrollbar-width:thin]">
        {NAV_SECTIONS.map((section, si) => {
          const sectionItems = items.filter((i) => i.section === section);
          if (sectionItems.length === 0) return null;
          return (
            <div key={section} className="mb-3 last:mb-0">
              {/* Overview holds only the dashboard, so it needs no heading. */}
              {si > 0 &&
                (collapsed ? (
                  <div className="mx-3 mb-2 border-t border-sidebar-border" aria-hidden />
                ) : (
                  <p className="mb-1 px-2.5 text-[10.5px] font-semibold tracking-wider text-sidebar-muted/80 uppercase">{section}</p>
                ))}
              <ul className="grid gap-px">
                {sectionItems.map((item) => {
                  const active = isActivePath(pathname, item.href);
                  const badge = badges[item.href];
                  const link = (
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "relative flex items-center gap-2.5 rounded-md px-2.5 transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-sidebar-highlight/60",
                        mobile ? "h-10 text-[15px]" : "h-8 text-[13px]",
                        active ? "bg-sidebar-accent font-medium text-white" : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-white",
                        collapsed && "justify-center px-0",
                      )}
                    >
                      {active && !collapsed && <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-r-full bg-sidebar-highlight" aria-hidden />}
                      <item.icon className={cn("shrink-0", mobile ? "size-5" : "size-[18px]", active ? "text-sidebar-highlight" : "text-sidebar-muted")} />
                      {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                      {!collapsed && badge && (
                        <span
                          className={cn(
                            "rounded-full px-1.5 text-[11px] font-medium tabular",
                            badge.tone === "warning" ? "bg-[#f59e0b]/20 text-[#fcd34d]" : "bg-white/10 text-sidebar-foreground",
                          )}
                          title={badge.title}
                        >
                          {badge.value}
                        </span>
                      )}
                      {collapsed && badge && (
                        <span className={cn("absolute top-1.5 right-2 size-1.5 rounded-full", badge.tone === "warning" ? "bg-[#fbbf24]" : "bg-sidebar-highlight")} aria-hidden />
                      )}
                    </Link>
                  );
                  return (
                    <li key={item.href}>
                      {collapsed ? (
                        <Tooltip>
                          <TooltipTrigger asChild>{link}</TooltipTrigger>
                          <TooltipContent side="right">
                            {item.label}
                            {badge && <span className="text-muted-foreground"> · {badge.title}</span>}
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        link
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      <UserCard collapsed={collapsed} mobile={mobile} />
    </div>
  );
}

/** Who is signed in, with a log-out button, pinned to the bottom of the sidebar. */
function UserCard({ collapsed, mobile }: { collapsed: boolean; mobile: boolean }) {
  const { user } = useAuth();
  const router = useRouter();
  if (!user) return null;
  const subtitle = user.designation || ROLE_LABELS[user.role];
  const logOut = () => {
    void signOutEverywhere();
    router.replace("/login");
  };

  if (collapsed)
    return (
      <div className="flex shrink-0 justify-center border-t border-sidebar-border py-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" onClick={logOut} className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-sidebar-highlight/60" aria-label={`${user.name} — log out`}>
              <UserAvatar name={user.name} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">
            {user.name} · {subtitle}
            <span className="block text-muted-foreground">Click to log out</span>
          </TooltipContent>
        </Tooltip>
      </div>
    );

  return (
    <div className={cn("flex shrink-0 items-center gap-2.5 border-t border-sidebar-border px-3", mobile ? "py-4" : "py-3")}>
      <UserAvatar name={user.name} size={mobile ? "lg" : "md"} />
      <div className="min-w-0 flex-1 leading-tight">
        <div className={cn("truncate font-medium text-white", mobile ? "text-[15px]" : "text-[13px]")}>{user.name}</div>
        <div className="truncate text-[11px] text-sidebar-muted">{subtitle}</div>
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={logOut}
            className={cn(
              "flex items-center justify-center rounded-md text-sidebar-muted hover:bg-sidebar-accent hover:text-white focus-visible:ring-2 focus-visible:ring-sidebar-highlight/60 outline-none",
              mobile ? "size-10" : "size-8",
            )}
            aria-label="Log out"
          >
            <LogOut className="size-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">Log out</TooltipContent>
      </Tooltip>
    </div>
  );
}

export function Sidebar() {
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggle = useUiStore((s) => s.toggleSidebar);
  return (
    <aside
      className={cn(
        "no-print group/sidebar fixed inset-y-0 left-0 z-30 hidden transition-[width] duration-200 lg:block",
        collapsed ? "w-[68px]" : "w-60",
      )}
    >
      <SidebarNav collapsed={collapsed} />
      <button
        type="button"
        onClick={toggle}
        className="absolute top-[12px] -right-3 flex size-6 items-center justify-center rounded-full border bg-card text-muted-foreground opacity-0 transition-opacity group-hover/sidebar:opacity-100 hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/40 outline-none"
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        aria-expanded={!collapsed}
      >
        <ChevronsLeft className={cn("size-3.5 transition-transform", collapsed && "rotate-180")} />
      </button>
    </aside>
  );
}
