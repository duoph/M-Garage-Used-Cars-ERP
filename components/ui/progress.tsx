"use client";
import * as React from "react";
import { Progress as P } from "radix-ui";
import { cn } from "@/lib/utils/cn";

export function Progress({ className, value, indicatorClassName, ...props }: React.ComponentProps<typeof P.Root> & { indicatorClassName?: string }) {
  return (
    <P.Root className={cn("relative h-1.5 w-full overflow-hidden rounded-full bg-[#eceef2]", className)} value={value} {...props}>
      <P.Indicator
        className={cn("h-full bg-primary transition-all", indicatorClassName)}
        style={{ width: `${Math.min(100, Math.max(0, value ?? 0))}%` }}
      />
    </P.Root>
  );
}
