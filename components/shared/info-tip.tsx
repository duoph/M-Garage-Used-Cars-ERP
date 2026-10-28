"use client";
import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils/cn";

/** Plain-language definitions for business terms, so every team member reads numbers the same way. */
export const GLOSSARY = {
  landedCost: "Purchase price plus every expense linked to this car (repairs, painting, paperwork…). It's what the car really cost the showroom.",
  grossProfit: "Sale price − purchase price − this car's own expenses. Rent, salaries and other showroom costs are not deducted here.",
  operatingExpenses: "General showroom costs such as rent, salaries, utilities and marketing — not linked to any one car.",
  netAfterOperating: "Gross profit on cars sold minus general showroom costs for the same period. Indicative, before tax.",
  outstanding: "Money buyers still owe on completed sales.",
  stockAge: "Days since the car was purchased. Cars sitting longer than 60 days tie up cash — consider a price review.",
  inStock: "Available + reserved cars that haven't been sold yet.",
  reserved: "A buyer has booked the car. It can only be sold to that buyer unless the reservation is released.",
  margin: "Gross profit as a percentage of the sale price.",
} as const;

export function InfoTip({ text, className, label = "What does this mean?" }: { text: string; className?: string; label?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className={cn("inline-flex rounded-full text-muted-foreground/70 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40", className)}
          onClick={(e) => e.preventDefault()}
        >
          <Info className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-64 leading-relaxed">{text}</TooltipContent>
    </Tooltip>
  );
}
