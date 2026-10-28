"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronsLeft } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { NAV_ITEMS, NAV_SECTIONS, isActivePath } from "@/lib/navigation";
import { outstandingBalances } from "@/lib/calculations/selectors";
import { useAuth } from "@/hooks/use-auth";
import { useData } from "@/components/providers/data-provider";
import { useUiStore } from "@/lib/store/ui";
import { Logo, LogoMark } from "@/components/shared/logo";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function SidebarNav({ collapsed = false, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const { can } = useAuth();
  const { ds, idx } = useData();
  const items = NAV_ITEMS.filter((i) => can(i.permission));

  // Only surface a count when something needs action.
  const due = can("sales.viewAll") ? outstandingBalances(ds, idx).count : 0;
  const badges: Record<string, { value: number; title: string } | undefined> = {
    "/sales": due ? { value: due, title: `${due} sales with a balance due` } : undefined,
  };

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className={cn("flex h-12 shrink-0 items-center", collapsed ? "justify-center px-2" : "px-4")}>
        {collapsed ? <LogoMark className="size-7" inverted /> : <Logo dark />}
      </div>
      <nav aria-label="Main" className="flex-1 overflow-y-auto px-2 py-1">
        {NAV_SECTIONS.map((section) => {
          const sectionItems = items.filter((i) => i.section === section);
          if (sectionItems.length === 0) return null;
          return (
            // Sections are separated by whitespace only — no headings to read.
            <ul key={section} className="mb-3 grid gap-px last:mb-0">
              {sectionItems.map((item) => {
                const active = isActivePath(pathname, item.href);
                const badge = badges[item.href];
                const link = (
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-sidebar-highlight/60",
                      active ? "bg-sidebar-accent font-medium text-white" : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-white",
                      collapsed && "justify-center px-0",
                    )}
                  >
                    <item.icon className={cn("size-[18px] shrink-0", active ? "text-sidebar-highlight" : "text-sidebar-muted")} />
                    {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                    {!collapsed && badge && (
                      <span className="rounded-full bg-[#f59e0b]/20 px-1.5 text-[11px] font-medium text-[#fcd34d] tabular" title={badge.title}>
                        {badge.value}
                      </span>
                    )}
                    {collapsed && badge && <span className="absolute top-1.5 right-2 size-1.5 rounded-full bg-[#fbbf24]" aria-hidden />}
                  </Link>
                );
                return (
                  <li key={item.href}>
                    {collapsed ? (
                      <Tooltip>
                        <TooltipTrigger asChild>{link}</TooltipTrigger>
                        <TooltipContent side="right">{item.label}</TooltipContent>
                      </Tooltip>
                    ) : (
                      link
                    )}
                  </li>
                );
              })}
            </ul>
          );
        })}
      </nav>
    </div>
  );
}

export function Sidebar() {
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggle = useUiStore((s) => s.toggleSidebar);
  return (
    <aside
      className={cn(
        "group/sidebar fixed inset-y-0 left-0 z-30 hidden transition-[width] duration-200 lg:block",
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
