"use client";
import * as React from "react";
import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, Download, SearchX, Users } from "lucide-react";
import { toast } from "sonner";
import { useData } from "@/components/providers/data-provider";
import { useAuth } from "@/hooks/use-auth";
import { useDialogStore } from "@/lib/store/dialogs";
import { parties, type Party } from "@/lib/calculations/ledger";
import { saleTotals } from "@/lib/calculations/finance";
import { formatDate, todayISO } from "@/lib/utils/dates";
import { formatINR, formatINRCompact, sumPaise } from "@/lib/utils/money";
import { csvRupees, downloadCsv } from "@/lib/utils/csv";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/shared/page-header";
import { SearchInput } from "@/components/shared/search-input";
import { FilterBar, ListRow, LoadMore, RowCell, StickyBar, usePagedRows } from "@/components/shared/list";
import { EmptyState } from "@/components/shared/empty-state";
import { StatCard } from "@/components/shared/stat-card";
import { UserAvatar } from "@/components/shared/user-avatar";

/** Buyers who owe the showroom and sellers the showroom owes, each with a statement. */
export function PartiesPage() {
  const { ds, idx } = useData();
  const { can } = useAuth();
  const all = React.useMemo(() => parties(ds, idx), [ds, idx]);
  const [kind, setKind] = React.useState<"buyer" | "seller">("buyer");
  const [search, setSearch] = React.useState("");
  const [dueOnly, setDueOnly] = React.useState(false);
  const [open, setOpen] = React.useState<Party | null>(null);

  const receivable = sumPaise(all.filter((p) => p.kind === "buyer").map((p) => p.balancePaise));
  const payable = sumPaise(all.filter((p) => p.kind === "seller").map((p) => p.balancePaise));
  const rows = all
    .filter((p) => p.kind === kind)
    .filter((p) => !dueOnly || p.balancePaise > 0)
    .filter((p) => `${p.name} ${p.phone}`.toLowerCase().includes(search.trim().toLowerCase()));
  const paged = usePagedRows(rows, `${kind}|${search}|${dueOnly}`);

  return (
    <>
      <PageHeader
        title="Parties"
        description="Buyer and seller ledgers: what each one has been billed, paid and still owes."
        actions={
          can("data.export") && (
            <Button
              variant="outline"
              disabled={rows.length === 0}
              onClick={() => {
                downloadCsv(`${kind}s-${todayISO()}.csv`, rows, [
                  { header: "Name", value: (p) => p.name },
                  { header: "Phone", value: (p) => p.phone },
                  { header: kind === "buyer" ? "Sold for (INR)" : "Bought for (INR)", value: (p) => csvRupees(p.billedPaise) },
                  { header: kind === "buyer" ? "Received (INR)" : "Paid (INR)", value: (p) => csvRupees(p.settledPaise) },
                  { header: kind === "buyer" ? "To receive (INR)" : "To pay (INR)", value: (p) => csvRupees(p.balancePaise) },
                  { header: "Last transaction", value: (p) => p.lastDate },
                ]);
                toast.success(`Exported ${rows.length} ${kind}s`);
              }}
            >
              <Download /> Export
            </Button>
          )
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:gap-4">
        <StatCard label="To receive from buyers" value={formatINRCompact(receivable)} tone={receivable ? "warning" : "neutral"} hint={`${all.filter((p) => p.kind === "buyer" && p.balancePaise > 0).length} buyers · ${formatINR(receivable)}`} />
        <StatCard label="To pay sellers" value={formatINRCompact(payable)} tone={payable ? "danger" : "neutral"} hint={`${all.filter((p) => p.kind === "seller" && p.balancePaise > 0).length} sellers · ${formatINR(payable)}`} />
      </div>
      <Card className="mt-4">
        <StickyBar>
          <FilterBar
            search={<SearchInput value={search} onChange={setSearch} placeholder="Search name or phone…" className="sm:w-full" size="sm" />}
            end={
              <Button variant={dueOnly ? "secondary" : "ghost"} size="sm" onClick={() => setDueOnly(!dueOnly)} aria-pressed={dueOnly}>
                With balance only
              </Button>
            }
          >
            <Tabs value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
              <TabsList className="h-8">
                <TabsTrigger value="buyer">Buyers</TabsTrigger>
                <TabsTrigger value="seller">Sellers</TabsTrigger>
              </TabsList>
            </Tabs>
          </FilterBar>
        </StickyBar>
        {rows.length === 0 ? (
          search || dueOnly ? (
            <EmptyState icon={SearchX} title="Nobody matches" />
          ) : (
            <EmptyState icon={Users} title={kind === "buyer" ? "No buyers yet" : "No sellers yet"} description={kind === "buyer" ? "Buyers appear once a car is sold." : "Sellers appear once a car is bought."} />
          )
        ) : (
          <>
            <ul className="divide-y">
              {paged.visible.map((p) => {
                const balance = (
                  <span className={cn("text-sm font-semibold tabular", p.balancePaise > 0 ? (kind === "buyer" ? "text-warning" : "text-destructive") : "text-muted-foreground")}>
                    {formatINR(p.balancePaise)}
                  </span>
                );
                return (
                  <ListRow
                    key={p.key}
                    onClick={() => setOpen(p)}
                    leading={<UserAvatar name={p.name} />}
                    title={p.name}
                    subtitle={<>{p.phone} · last {formatDate(p.lastDate)}</>}
                    mobile={balance}
                    aside={
                      <>
                        <RowCell from="md" className="w-32 text-right text-xs text-muted-foreground tabular">{formatINR(p.billedPaise)}</RowCell>
                        <RowCell from="lg" className="w-32 text-right text-xs text-muted-foreground tabular">{formatINR(p.settledPaise)}</RowCell>
                        <RowCell className="w-32 text-right">
                          {p.balancePaise > 0 ? balance : <Badge tone="success">Settled</Badge>}
                        </RowCell>
                      </>
                    }
                  />
                );
              })}
            </ul>
            <LoadMore shown={paged.visible.length} total={paged.total} hasMore={paged.hasMore} onLoadMore={paged.loadMore} />
          </>
        )}
      </Card>
      <PartyStatement party={open} onClose={() => setOpen(null)} />
    </>
  );
}

function PartyStatement({ party, onClose }: { party: Party | null; onClose: () => void }) {
  const { can } = useAuth();
  const openVoucher = useDialogStore((s) => s.openVoucher);
  const { ds, idx } = useData();
  const buyer = party?.kind === "buyer";
  const balances = (party?.lines ?? []).reduce<number[]>((acc, l) => {
    const prev = acc.at(-1) ?? 0;
    return [...acc, prev + (buyer ? l.debitPaise - l.creditPaise : l.creditPaise - l.debitPaise)];
  }, []);
  // The oldest sale or purchase still open, for the quick action.
  const dueSale = buyer && party
    ? ds.sales.find((s) => s.status === "completed" && party.lines.some((l) => l.href === `/sales/${s.id}`) && saleTotals(s, idx.paymentsBySale.get(s.id) ?? []).balancePaise > 0)
    : undefined;
  const duePurchase = !buyer && party ? ds.purchases.find((p) => p.status === "active" && p.purchasePricePaise > p.amountPaidPaise && party.lines.some((l) => l.href === `/purchases/${p.id}`)) : undefined;

  return (
    <Sheet open={!!party} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="sm:max-w-2xl">
        {party && (
          <>
            <SheetHeader>
              <SheetTitle>{party.name}</SheetTitle>
              <SheetDescription>
                {buyer ? "Buyer" : "Seller"} · {party.phone} · {party.balancePaise > 0 ? `${buyer ? "to receive" : "to pay"} ${formatINR(party.balancePaise)}` : "settled"}
              </SheetDescription>
            </SheetHeader>
            <SheetBody className="px-0">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Date</TableHead>
                    <TableHead>Particulars</TableHead>
                    <TableHead className="text-right">{buyer ? "Billed" : "Paid"}</TableHead>
                    <TableHead className="text-right">{buyer ? "Received" : "Bought"}</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {party.lines.map((l, i) => {
                    return (
                      <TableRow key={i}>
                        <TableCell className="text-xs whitespace-nowrap text-muted-foreground">{formatDate(l.date)}</TableCell>
                        <TableCell>
                          {l.description}
                          <div className="text-[11px] text-muted-foreground">
                            {l.href ? <Link href={l.href} className="font-mono hover:underline">{l.number}</Link> : l.number}
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular">{l.debitPaise ? formatINR(l.debitPaise) : ""}</TableCell>
                        <TableCell className="text-right tabular">{l.creditPaise ? formatINR(l.creditPaise) : ""}</TableCell>
                        <TableCell className="text-right tabular">{formatINR(balances[i])}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={2}>Closing balance</TableCell>
                    <TableCell className="text-right tabular">{formatINR(buyer ? party.billedPaise : party.settledPaise)}</TableCell>
                    <TableCell className="text-right tabular">{formatINR(buyer ? party.settledPaise : party.billedPaise)}</TableCell>
                    <TableCell className="text-right tabular">{formatINR(party.balancePaise)}</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </SheetBody>
            <SheetFooter>
              <Button variant="outline" onClick={onClose}>Close</Button>
              {buyer && dueSale && can("payments.record") && (
                <Button onClick={() => { onClose(); openVoucher({ type: "receipt", saleId: dueSale.id }); }}><ArrowDownLeft /> Receive payment</Button>
              )}
              {!buyer && duePurchase && can("accounts.manage") && (
                <Button onClick={() => { onClose(); openVoucher({ type: "payment", purchaseId: duePurchase.id }); }}><ArrowUpRight /> Pay seller</Button>
              )}
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
