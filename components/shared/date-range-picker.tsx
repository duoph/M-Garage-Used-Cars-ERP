"use client";
import * as React from "react";
import { CalendarDays, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { DateField } from "./date-field";
import { cn } from "@/lib/utils/cn";
import {
  DATE_RANGE_LABELS,
  DATE_RANGE_PRESETS,
  describeRange,
  resolvePreset,
  type DateRange,
} from "@/lib/utils/dates";

export function DateRangePicker({ value, onChange, className, size = "default" }: { value: DateRange; onChange: (r: DateRange) => void; className?: string; size?: "default" | "sm" }) {
  const [open, setOpen] = React.useState(false);
  const [from, setFrom] = React.useState(value.from ?? "");
  const [to, setTo] = React.useState(value.to ?? "");

  const handleOpenChange = (o: boolean) => {
    if (o) {
      setFrom(value.from ?? "");
      setTo(value.to ?? "");
    }
    setOpen(o);
  };

  const invalid = from && to && from > to;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="outline" size={size} className={cn("justify-between gap-2 font-normal", className)}>
          <CalendarDays className="text-muted-foreground" />
          <span className="truncate">{describeRange(value)}</span>
          <ChevronDown className="opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[300px] p-0">
        <div className="grid gap-0.5 p-1.5">
          {DATE_RANGE_PRESETS.filter((p) => p !== "custom").map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => {
                onChange(resolvePreset(p));
                setOpen(false);
              }}
              className={cn(
                "rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-muted",
                value.preset === p && "bg-primary-soft font-medium text-primary",
              )}
            >
              {DATE_RANGE_LABELS[p]}
            </button>
          ))}
        </div>
        <div className="grid gap-3 border-t p-3">
          <p className="text-xs font-medium text-muted-foreground">Custom range</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1">
              <Label htmlFor="range-from" className="text-xs">From</Label>
              <DateField id="range-from" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="range-to" className="text-xs">To</Label>
              <DateField id="range-to" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
          {invalid && <p className="text-xs text-destructive">Start date must be before end date.</p>}
          <Button
            size="sm"
            disabled={!!invalid || (!from && !to)}
            onClick={() => {
              onChange({ preset: "custom", from: from || null, to: to || null });
              setOpen(false);
            }}
          >
            Apply range
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
