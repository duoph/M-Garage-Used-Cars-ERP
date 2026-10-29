"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ban, Eye, FileText, MoreHorizontal, Pencil, Plus, Receipt, RotateCcw, SearchX } from "lucide-react";
import { toast } from "sonner";
import { useData } from "@/components/providers/data-provider";
import { useAuth, useCurrentUser } from "@/hooks/use-auth";
import { dealerService } from "@/lib/services/dealer-service";
import { reportError } from "@/hooks/use-commands";
import { quoteTotals } from "@/lib/calculations/finance";
import { formatDate } from "@/lib/utils/dates";
import { formatINR } from "@/lib/utils/money";
import { QUOTE_STATUS_LABELS, vehicleTitle } from "@/lib/utils/labels";
import type { Quote } from "@/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PageHeader } from "@/components/shared/page-header";
import { SearchInput } from "@/components/shared/search-input";
import { FilterBar, ListRow, LoadMore, RowCell, StickyBar, usePagedRows } from "@/components/shared/list";
import { VehicleImage } from "@/components/shared/vehicle-image";
import { EmptyState } from "@/components/shared/empty-state";
import { canEditQuote, canSellFromQuote, isExpired } from "./quote-utils";

type StatusFilter = "all" | "open" | "expired" | "accepted" | "declined";

export function QuoteStatusBadge({ quote }: { quote: Quote }) {
  if (isExpired(quote)) return <Badge tone="warning">Expired</Badge>;
  const tone = quote.status === "open" ? "info" : quote.status === "accepted" ? "success" : "neutral";
  return <Badge tone={tone}>{QUOTE_STATUS_LABELS[quote.status]}</Badge>;
}

export function QuotesPage() {
  const { ds, idx } = useData();
  const { can } = useAuth();
  const user = useCurrentUser();
  const router = useRouter();
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState<StatusFilter>("open");
  const viewAll = can("sales.viewAll");

  const all = React.useMemo(() => ds.quotes.filter((q) => viewAll || q.createdBy === user.id), [ds.quotes, viewAll, user.id]);
  const rows = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return all
      .filter((x) =>
        status === "all" ? true : status === "expired" ? isExpired(x) : status === "open" ? x.status === "open" && !isExpired(x) : x.status === status,
      )
      .filter((x) => {
        if (!q) return true;
        const v = idx.vehicles.get(x.vehicleId);
        return `${x.reference} ${x.customerName} ${x.customerPhone} ${v?.make} ${v?.model} ${v?.registrationNumber} ${v?.registrationNumber.replace(/\s/g, "")}`
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => b.quoteDate.localeCompare(a.quoteDate) || b.createdAt.localeCompare(a.createdAt));
  }, [all, search, status, idx]);
  const paged = usePagedRows(rows, `${search}|${status}`);

  async function setQuoteStatus(quote: Quote, next: "open" | "declined") {
    try {
      await dealerService.setQuoteStatus(user, quote.id, next);
      toast.success(next === "declined" ? "Quote marked as declined" : "Quote reopened");
    } catch (e) {
      reportError(e);
    }
  }

  return (
    <>
      <PageHeader
        title="Quotes"
        description="Price quotes for buyers. Print one, then turn it into a sale when the buyer agrees."
        actions={can("sales.create") && <Button asChild><Link href="/quotes/new"><Plus /> New quote</Link></Button>}
      />
      <Card>
        <StickyBar>
          <FilterBar search={<SearchInput value={search} onChange={setSearch} placeholder="Search ref, buyer, vehicle…" className="sm:w-full" size="sm" />}>
            <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
              <SelectTrigger className="h-8 w-[140px]" aria-label="Quote status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
                <SelectItem value="accepted">Sold</SelectItem>
                <SelectItem value="declined">Declined</SelectItem>
                <SelectItem value="all">All quotes</SelectItem>
              </SelectContent>
            </Select>
          </FilterBar>
        </StickyBar>
        {all.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No quotes yet"
            description="Give a buyer a printed price for a car, with transfer, insurance or any other charges."
            action={can("sales.create") && <Button asChild><Link href="/quotes/new"><Plus /> New quote</Link></Button>}
          />
        ) : rows.length === 0 ? (
          <EmptyState icon={SearchX} title="No quotes match" description="Try another status or search." />
        ) : (
          <>
            <ul className="divide-y">
              {paged.visible.map((q) => {
                const v = idx.vehicles.get(q.vehicleId);
                const total = quoteTotals(q).totalPaise;
                const editable = canEditQuote(q, user);
                const sellable = canSellFromQuote(q, v, user);
                return (
                  <ListRow
                    key={q.id}
                    href={`/quote/${q.id}`}
                    leading={<VehicleImage image={v ? (idx.imagesByVehicle.get(v.id)?.find((i) => i.isCover) ?? idx.imagesByVehicle.get(v.id)?.[0] ?? null) : null} alt="" className="h-12 w-[72px] shrink-0 rounded-md" />}
                    title={q.customerName}
                    subtitle={
                      <>
                        {v ? `${v.year} ${vehicleTitle(v)}` : "Vehicle removed"} · {formatDate(q.quoteDate)} · {q.reference}
                        {viewAll && <> · by {idx.users.get(q.createdBy)?.name ?? "—"}</>}
                      </>
                    }
                    mobile={
                      <>
                        <span className="text-sm font-semibold tabular">{formatINR(total)}</span>
                        <QuoteStatusBadge quote={q} />
                      </>
                    }
                    aside={
                      <>
                        <RowCell from="md" className="w-28 text-right text-xs text-muted-foreground">Valid to {formatDate(q.validUntil)}</RowCell>
                        <RowCell className="w-28 text-right text-sm font-semibold tabular">{formatINR(total)}</RowCell>
                        <RowCell className="w-24 text-right"><QuoteStatusBadge quote={q} /></RowCell>
                      </>
                    }
                    action={
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${q.reference}`}><MoreHorizontal /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => router.push(`/quote/${q.id}`)}><Eye /> View / print</DropdownMenuItem>
                          {editable && <DropdownMenuItem onSelect={() => router.push(`/quotes/${q.id}`)}><Pencil /> Edit</DropdownMenuItem>}
                          {sellable && <DropdownMenuItem onSelect={() => router.push(`/sales/new?quote=${q.id}`)}><Receipt /> Record sale</DropdownMenuItem>}
                          {q.status === "accepted" && q.saleId && <DropdownMenuItem onSelect={() => router.push(`/sales/${q.saleId}`)}><Receipt /> View sale</DropdownMenuItem>}
                          {editable && (
                            <>
                              <DropdownMenuSeparator />
                              {q.status === "open" ? (
                                <DropdownMenuItem onSelect={() => setQuoteStatus(q, "declined")}><Ban /> Mark as declined</DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem onSelect={() => setQuoteStatus(q, "open")}><RotateCcw /> Reopen</DropdownMenuItem>
                              )}
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    }
                  />
                );
              })}
            </ul>
            <LoadMore shown={paged.visible.length} total={paged.total} hasMore={paged.hasMore} onLoadMore={paged.loadMore} />
          </>
        )}
      </Card>
    </>
  );
}
