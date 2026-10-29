"use client";
import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";

/**
 * Building blocks shared by every list page (Inventory, Purchases, Sales, Expenses, Staff, Activity):
 * one row per record, filters pinned under the top bar, and records rendered 50 at a time.
 */
export const LIST_PAGE_SIZE = 50;

/** Shows rows in batches. Changing `resetKey` (e.g. the active filters) goes back to the first batch. */
export function usePagedRows<T>(rows: T[], resetKey: string, pageSize = LIST_PAGE_SIZE) {
  const [page, setPage] = React.useState({ key: resetKey, limit: pageSize });
  const limit = page.key === resetKey ? page.limit : pageSize;
  const loadMore = React.useCallback(
    () => setPage((p) => ({ key: resetKey, limit: (p.key === resetKey ? p.limit : pageSize) + pageSize })),
    [resetKey, pageSize],
  );
  return { visible: rows.slice(0, limit), total: rows.length, hasMore: rows.length > limit, loadMore, pageSize };
}

/** Pins its contents just below the 48px top bar while the list scrolls. */
export function StickyBar({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("sticky top-12 z-10 rounded-t-xl border-b bg-card", className)}>{children}</div>;
}

/**
 * Search box plus filter controls on one compact line (32px controls). On phones the search sits on
 * top and the controls scroll sideways, so the pinned bar stays short; `end` is pushed to the right.
 */
export function FilterBar({ search, children, end }: { search: React.ReactNode; children?: React.ReactNode; end?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:px-4">
      <div className="min-w-0 sm:w-60 lg:w-80">{search}</div>
      {/* py/-my keep focus rings visible inside the scrolling row. */}
      <div className="-mx-3 -my-0.5 flex min-w-0 flex-1 items-center gap-2 overflow-x-auto px-3 py-0.5 [scrollbar-width:none] *:shrink-0 sm:mx-0 sm:px-0.5">
        {children}
        {end && <div className="ml-auto flex items-center gap-2">{end}</div>}
      </div>
    </div>
  );
}

const CELL_FROM = { sm: "sm:block", md: "md:block", lg: "lg:block", xl: "xl:block" } as const;

/** A right-hand column in a list row, shown from the given breakpoint up. */
export function RowCell({ from = "sm", className, children, title }: { from?: keyof typeof CELL_FROM; className?: string; children: React.ReactNode; title?: string }) {
  return (
    <div className={cn("hidden shrink-0", CELL_FROM[from], className)} title={title}>
      {children}
    </div>
  );
}

/**
 * One record per row: optional leading image/avatar, a title with a muted subtitle, `mobile` details
 * shown under the title on phones, `aside` columns on wider screens, and a trailing `action` (menu).
 */
export function ListRow({
  href,
  onClick,
  leading,
  title,
  subtitle,
  mobile,
  aside,
  action,
}: {
  href?: string;
  onClick?: () => void;
  leading?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  mobile?: React.ReactNode;
  aside?: React.ReactNode;
  action?: React.ReactNode;
}) {
  const body = (
    <>
      {leading}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{title}</div>
        {subtitle && <div className="truncate text-xs text-muted-foreground">{subtitle}</div>}
        {mobile && <div className="mt-1 flex items-center gap-2 sm:hidden">{mobile}</div>}
      </div>
      {aside}
    </>
  );
  const inner = "flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-3 text-left outline-none focus-visible:bg-muted sm:pl-4";
  return (
    <li className={cn("flex items-center gap-2 transition-colors", (href || onClick) && "hover:bg-muted/50", action ? "pr-2 sm:pr-3" : "pr-3 sm:pr-4")}>
      {href ? (
        <Link href={href} className={inner}>{body}</Link>
      ) : onClick ? (
        <button type="button" onClick={onClick} className={inner}>{body}</button>
      ) : (
        <div className={inner}>{body}</div>
      )}
      {action}
    </li>
  );
}

/** Auto-loads the next batch when the footer nears the viewport; the button covers keyboard users and slow scrolls. */
export function LoadMore({ shown, total, hasMore, onLoadMore, pageSize = LIST_PAGE_SIZE }: { shown: number; total: number; hasMore: boolean; onLoadMore: () => void; pageSize?: number }) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const el = ref.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver(([entry]) => entry.isIntersecting && onLoadMore(), { rootMargin: "400px 0px" });
    io.observe(el);
    return () => io.disconnect();
    // `shown` re-arms the observer after each batch, so a still-visible footer keeps loading.
  }, [hasMore, onLoadMore, shown]);

  return (
    <div ref={ref} className="flex flex-col items-center gap-2 border-t px-4 py-3 text-xs text-muted-foreground">
      <span className="tabular">Showing {shown} of {total}</span>
      {hasMore && (
        <Button variant="outline" size="sm" onClick={onLoadMore}>
          Load {Math.min(pageSize, total - shown)} more
        </Button>
      )}
    </div>
  );
}
