import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils/cn";

export const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap [&_svg]:size-3",
  {
    variants: {
      tone: {
        neutral: "border-[#e4e7ec] bg-[#f2f4f7] text-[#475467]",
        success: "border-[#c6eedb] bg-success-soft text-success",
        warning: "border-[#fde7b0] bg-warning-soft text-warning",
        danger: "border-[#f6d2cf] bg-destructive-soft text-destructive",
        info: "border-[#d1e0ff] bg-[#eff4ff] text-[#2948b8]",
        brand: "border-[#c3e6e1] bg-primary-soft text-primary",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export function Badge({ className, tone, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
