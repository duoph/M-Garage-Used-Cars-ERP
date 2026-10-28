"use client";
import * as React from "react";
import { Switch as P } from "radix-ui";
import { cn } from "@/lib/utils/cn";

export function Switch({ className, ...props }: React.ComponentProps<typeof P.Root>) {
  return (
    <P.Root
      className={cn(
        "peer inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-transparent transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-[#d0d5dd]",
        className,
      )}
      {...props}
    >
      <P.Thumb className="pointer-events-none block size-4 rounded-full bg-white shadow-sm transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0.5" />
    </P.Root>
  );
}
