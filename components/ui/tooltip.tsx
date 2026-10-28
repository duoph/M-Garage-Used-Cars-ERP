"use client";
import * as React from "react";
import { Tooltip as P } from "radix-ui";
import { cn } from "@/lib/utils/cn";

export const TooltipProvider = P.Provider;
export const Tooltip = P.Root;
export const TooltipTrigger = P.Trigger;

export function TooltipContent({ className, sideOffset = 6, ...props }: React.ComponentProps<typeof P.Content>) {
  return (
    <P.Portal>
      <P.Content
        sideOffset={sideOffset}
        className={cn("z-50 rounded-md bg-[#111827] px-2 py-1 text-xs text-white shadow-md data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0", className)}
        {...props}
      />
    </P.Portal>
  );
}
