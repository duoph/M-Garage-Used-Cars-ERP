"use client";
import Link from "next/link";
import { formatDistanceToNowStrict, parseISO } from "date-fns";
import { History } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useData } from "@/components/providers/data-provider";
import { useCurrentUser } from "@/hooks/use-auth";
import { EmptyState } from "@/components/shared/empty-state";
import { formatDateTime } from "@/lib/utils/dates";
import { activityIcon, visibleActivity } from "./activity-utils";
import type { ActivityLog } from "@/types";

export function ActivityItem({ entry, compact = false }: { entry: ActivityLog; compact?: boolean }) {
  const { idx } = useData();
  const actor = idx.users.get(entry.actorId);
  const { icon: Icon, tone } = activityIcon(entry.action);
  const text = <span className="text-[13px] leading-snug text-foreground">{entry.description}</span>;
  return (
    <div className={cn("flex gap-3", compact ? "py-2.5" : "py-3")}>
      <span className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full", tone)}>
        <Icon className="size-3.5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        {entry.href ? (
          <Link href={entry.href} className="hover:underline focus-visible:outline-2 focus-visible:outline-ring rounded">
            {text}
          </Link>
        ) : (
          text
        )}
        <div className="mt-0.5 text-xs text-muted-foreground">
          {actor?.name ?? "System"} ·{" "}
          <time dateTime={entry.timestamp} title={formatDateTime(entry.timestamp)}>
            {formatDistanceToNowStrict(parseISO(entry.timestamp), { addSuffix: true })}
          </time>
        </div>
      </div>
    </div>
  );
}

export function ActivityFeed({
  limit = 8,
  filter,
  compact = false,
  emptyText = "Activity will appear here as your team works.",
}: {
  limit?: number;
  filter?: (e: ActivityLog) => boolean;
  compact?: boolean;
  emptyText?: string;
}) {
  const { ds } = useData();
  const user = useCurrentUser();
  const entries = visibleActivity(ds.activity, user)
    .filter((e) => (filter ? filter(e) : true))
    .slice(0, limit);
  if (entries.length === 0) return <EmptyState icon={History} title="No activity yet" description={emptyText} className="py-8" />;
  return (
    <ul className="divide-y">
      {entries.map((e) => (
        <li key={e.id}>
          <ActivityItem entry={e} compact={compact} />
        </li>
      ))}
    </ul>
  );
}
