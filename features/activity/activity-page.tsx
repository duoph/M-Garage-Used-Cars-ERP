"use client";
import * as React from "react";
import Link from "next/link";
import { History } from "lucide-react";
import { useData } from "@/components/providers/data-provider";
import { useAuth, useCurrentUser } from "@/hooks/use-auth";
import { formatDateTime, inRange, resolvePreset, type DateRange } from "@/lib/utils/dates";
import { formatINR } from "@/lib/utils/money";
import { ENTITY_TYPES, type ActivityLog, type EntityType } from "@/types";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/shared/page-header";
import { SearchInput } from "@/components/shared/search-input";
import { DateRangePicker } from "@/components/shared/date-range-picker";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterBar, LoadMore, StickyBar, usePagedRows } from "@/components/shared/list";
import { cn } from "@/lib/utils/cn";
import { activityIcon, visibleActivity } from "./activity-utils";

const ENTITY_LABELS: Record<EntityType, string> = {
  purchase: "Purchases",
  vehicle: "Vehicles & photos",
  reservation: "Reservations",
  sale: "Sales",
  payment: "Payments",
  expense: "Expenses",
  user: "Users",
  settings: "Settings & data",
};

export function ActivityPage() {
  const { ds, idx } = useData();
  const { can } = useAuth();
  const user = useCurrentUser();
  const [search, setSearch] = React.useState("");
  const [entity, setEntity] = React.useState<"all" | EntityType>("all");
  const [actor, setActor] = React.useState("all");
  const [range, setRange] = React.useState<DateRange>(resolvePreset("all"));

  const entries = visibleActivity(ds.activity, user.role, user.id)
    .filter((e) => entity === "all" || e.entityType === entity)
    .filter((e) => actor === "all" || e.actorId === actor)
    .filter((e) => inRange(e.timestamp.slice(0, 10), range))
    .filter((e) => e.description.toLowerCase().includes(search.trim().toLowerCase()));
  const paged = usePagedRows(entries, `${search}|${entity}|${actor}|${range.from}|${range.to}`);

  return (
    <>
      <PageHeader title="Activity Log" description="A history of important changes across the showroom." />
      <Card>
        <StickyBar>
          <FilterBar
            search={<SearchInput value={search} onChange={setSearch} placeholder="Search activity…" className="sm:w-full" size="sm" />}
            end={<DateRangePicker value={range} onChange={setRange} size="sm" />}
          >
            <Select value={entity} onValueChange={(v) => setEntity(v as typeof entity)}>
              <SelectTrigger className="h-8 w-[170px]" aria-label="Type"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All activity</SelectItem>
                {ENTITY_TYPES.filter((t) => t !== "user" || can("users.manage")).map((t) => <SelectItem key={t} value={t}>{ENTITY_LABELS[t]}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={actor} onValueChange={setActor}>
              <SelectTrigger className="h-8 w-[170px]" aria-label="Employee"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All employees</SelectItem>
                {ds.users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </FilterBar>
        </StickyBar>
        {entries.length === 0 ? (
          <EmptyState icon={History} title="No activity found" description="Try a different filter or date range." />
        ) : (
          <>
            <ol className="divide-y">
              {paged.visible.map((e) => (
                <ActivityRow key={e.id} entry={e} actorName={idx.users.get(e.actorId)?.name ?? "System"} showFinancial={can("finance.viewCost")} />
              ))}
            </ol>
            <LoadMore shown={paged.visible.length} total={paged.total} hasMore={paged.hasMore} onLoadMore={paged.loadMore} />
          </>
        )}
      </Card>
    </>
  );
}

function ActivityRow({ entry: e, actorName, showFinancial }: { entry: ActivityLog; actorName: string; showFinancial: boolean }) {
  const { icon: Icon, tone } = activityIcon(e.action);
  const financial = showFinancial ? e.metadata.financial ?? [] : [];
  const changes = e.metadata.changes ?? [];
  return (
    <li className="flex gap-3 px-4 py-3">
      <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full", tone)}>
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-col gap-0.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <p className="text-[13px]">
            {e.href ? <Link href={e.href} className="hover:underline">{e.description}</Link> : e.description}
          </p>
          <time className="shrink-0 text-xs text-muted-foreground tabular" dateTime={e.timestamp}>{formatDateTime(e.timestamp)}</time>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {actorName} · <span className="font-mono text-[11px]">{e.action}</span> · ID {e.id.slice(0, 8)}
        </p>
        {(financial.length > 0 || changes.length > 0) && (
          <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 rounded-md bg-muted/60 px-3 py-2 text-xs">
            {financial.map((f) => (
              <div key={f.label} className="flex gap-1.5">
                <dt className="text-muted-foreground">{f.label}:</dt>
                <dd className="tabular">
                  {f.before !== undefined && f.before !== null && <span className="text-muted-foreground line-through">{formatINR(f.before)}</span>}
                  {f.before !== undefined && f.before !== null && f.after !== undefined && " → "}
                  {f.after !== undefined && f.after !== null ? <span className="font-medium">{formatINR(f.after)}</span> : f.after === null ? <span className="font-medium">removed</span> : null}
                </dd>
              </div>
            ))}
            {changes.map((c, i) => (
              <div key={`${c.field}-${i}`} className="flex gap-1.5">
                <dt className="text-muted-foreground">{c.field}:</dt>
                <dd>
                  {c.before && <span className="text-muted-foreground line-through">{c.before}</span>}
                  {c.before && c.after && " → "}
                  {c.after && <span className="font-medium">{c.after}</span>}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </li>
  );
}
