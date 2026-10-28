"use client";
import * as React from "react";
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type PaginationState,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export type { ColumnDef };

/**
 * Sortable, paginated table. Filtering is done by the caller so filters stay explicit and
 * permission-aware. On small screens `renderMobileCard` replaces the table with cards.
 */
export function DataTable<T>({
  data,
  columns,
  initialSorting = [],
  pageSize = 10,
  getRowId,
  onRowClick,
  renderMobileCard,
  empty,
  resetPageKey,
}: {
  data: T[];
  columns: ColumnDef<T>[];
  initialSorting?: SortingState;
  pageSize?: number;
  getRowId?: (row: T) => string;
  onRowClick?: (row: T) => void;
  renderMobileCard?: (row: T) => React.ReactNode;
  empty?: React.ReactNode;
  /** Changing this value resets to the first page (e.g. when filters change). */
  resetPageKey?: string;
}) {
  const [sorting, setSorting] = React.useState<SortingState>(initialSorting);
  const [page, setPage] = React.useState({ key: resetPageKey, pageIndex: 0, pageSize });
  // Changing filters (resetPageKey) returns to the first page without an extra effect pass.
  const pagination = { pageIndex: page.key === resetPageKey ? page.pageIndex : 0, pageSize: page.pageSize };
  const setPagination = (updater: PaginationState | ((old: PaginationState) => PaginationState)) => {
    const next = typeof updater === "function" ? updater(pagination) : updater;
    setPage({ key: resetPageKey, ...next });
  };

  // TanStack Table returns non-memoizable functions by design; the React Compiler lint rule
  // is acknowledged here.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getRowId,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    autoResetPageIndex: false,
  });

  const rows = table.getRowModel().rows;
  const total = data.length;
  const start = total === 0 ? 0 : pagination.pageIndex * pagination.pageSize + 1;
  const end = Math.min(total, (pagination.pageIndex + 1) * pagination.pageSize);

  if (total === 0 && empty) return <>{empty}</>;

  return (
    <div>
      {renderMobileCard && (
        <ul className="divide-y md:hidden">
          {rows.map((row) => (
            <li key={row.id}>{renderMobileCard(row.original)}</li>
          ))}
        </ul>
      )}
      <div className={cn(renderMobileCard && "hidden md:block")}>
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="hover:bg-transparent">
                {hg.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sorted = header.column.getIsSorted();
                  const meta = header.column.columnDef.meta as { align?: "right" } | undefined;
                  return (
                    <TableHead
                      key={header.id}
                      className={cn(meta?.align === "right" && "text-right")}
                      aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}
                    >
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className={cn(
                            "inline-flex items-center gap-1 rounded hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring",
                            meta?.align === "right" && "flex-row-reverse",
                          )}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {sorted === "asc" ? (
                            <ArrowUp className="size-3" />
                          ) : sorted === "desc" ? (
                            <ArrowDown className="size-3" />
                          ) : (
                            <ChevronsUpDown className="size-3 opacity-50" />
                          )}
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow
                key={row.id}
                className={cn(onRowClick && "cursor-pointer")}
                onClick={
                  onRowClick
                    ? (e) => {
                        // Ignore clicks on interactive children (menus, links, buttons).
                        if ((e.target as HTMLElement).closest("a,button,[role=menuitem],input")) return;
                        onRowClick(row.original);
                      }
                    : undefined
                }
              >
                {row.getVisibleCells().map((cell) => {
                  const meta = cell.column.columnDef.meta as { align?: "right" } | undefined;
                  return (
                    <TableCell key={cell.id} className={cn(meta?.align === "right" && "text-right tabular")}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {total > 0 && (
        <div className="flex flex-col gap-3 border-t px-4 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span className="tabular">
            Showing {start}–{end} of {total}
          </span>
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline">Rows</span>
            <Select
              value={String(pagination.pageSize)}
              onValueChange={(v) => setPagination({ pageIndex: 0, pageSize: Number(v) })}
            >
              <SelectTrigger className="h-8 w-[72px]" aria-label="Rows per page">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 20, 50].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              aria-label="Previous page"
            >
              <ChevronLeft />
            </Button>
            <span className="tabular min-w-16 text-center">
              Page {pagination.pageIndex + 1} of {Math.max(1, table.getPageCount())}
            </span>
            <Button variant="outline" size="icon-sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} aria-label="Next page">
              <ChevronRight />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
