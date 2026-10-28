"use client";
import * as React from "react";
import { Tabs as P } from "radix-ui";
import { cn } from "@/lib/utils/cn";

export const Tabs = P.Root;

export function TabsList({ className, ...props }: React.ComponentProps<typeof P.List>) {
  return (
    <P.List
      className={cn("flex w-full items-center gap-1 overflow-x-auto border-b [scrollbar-width:none]", className)}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof P.Trigger>) {
  return (
    <P.Trigger
      className={cn(
        "relative -mb-px inline-flex h-10 shrink-0 items-center gap-1.5 border-b-2 border-transparent px-3 text-sm font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30 rounded-t-md data-[state=active]:border-primary data-[state=active]:text-foreground [&_svg]:size-4",
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: React.ComponentProps<typeof P.Content>) {
  return <P.Content className={cn("pt-5 outline-none", className)} {...props} />;
}
