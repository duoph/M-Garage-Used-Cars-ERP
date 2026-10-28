"use client";
import * as React from "react";
import { ToggleGroup as P } from "radix-ui";
import { cn } from "@/lib/utils/cn";

export function ToggleGroup({ className, ...props }: React.ComponentProps<typeof P.Root>) {
  return <P.Root className={cn("inline-flex items-center rounded-md border bg-card p-0.5 shadow-xs", className)} {...props} />;
}

export function ToggleGroupItem({ className, ...props }: React.ComponentProps<typeof P.Item>) {
  return (
    <P.Item
      className={cn(
        "inline-flex h-7 items-center justify-center gap-1.5 rounded-[6px] px-2 text-[13px] text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 data-[state=on]:bg-muted data-[state=on]:text-foreground [&_svg]:size-4",
        className,
      )}
      {...props}
    />
  );
}
