"use client";
import * as React from "react";
import { Calendar, CalendarDays, ChevronDown } from "lucide-react";
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
      <PopoverContent align="end" className="w-[320px] p-0">
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
        <div className="border-t bg-muted/40 p-3">
          <div className="mb-2.5 flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-md bg-card text-foreground shadow-xs ring-1 ring-border">
              <CalendarDays className="size-3.5" />
            </span>
            <div className="min-w-0 leading-tight">
              <p className="text-[13px] font-medium">Custom range</p>
              <p className="text-[11px] text-muted-foreground">Choose a start and an end date</p>
            </div>
          </div>
          <div className="grid gap-2">
            <RangeDate id="range-from" label="From" value={from} onChange={setFrom} invalid={!!invalid} />
            <RangeDate id="range-to" label="To" value={to} onChange={setTo} invalid={!!invalid} />
          </div>
          {invalid && <p className="mt-2 text-xs text-destructive">Start date must be before the end date.</p>}
          <Button
            size="sm"
            className="mt-3 w-full"
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

function RangeDate({
  id,
  label,
  value,
  onChange,
  invalid,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  invalid: boolean;
}) {
  const ref = React.useRef<HTMLInputElement>(null);

  return (
    <div className="grid gap-1">
      <Label htmlFor={id} className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </Label>
      <div className="relative">
        <DateField
          ref={ref}
          id={id}
          value={value}
          invalid={invalid}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 bg-card pr-10 scheme-light [&::-webkit-calendar-picker-indicator]:pointer-events-none [&::-webkit-calendar-picker-indicator]:hidden"
        />
        <button
          type="button"
          className="absolute top-1/2 right-1 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-foreground hover:bg-muted"
          aria-label={`Choose ${label.toLowerCase()} date`}
          onClick={() => {
            const field = ref.current;
            if (!field) return;
            try {
              field.showPicker();
            } catch {
              field.focus();
            }
          }}
        >
          <Calendar className="size-4" />
        </button>
      </div>
    </div>
  );
}
