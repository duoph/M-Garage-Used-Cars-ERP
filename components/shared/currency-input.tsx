"use client";
import * as React from "react";
import { cn } from "@/lib/utils/cn";
import { inputClass } from "@/components/ui/input";
import { formatRupeesPlain, paiseToRupeeInput, rupeesToPaise } from "@/lib/utils/money";

/**
 * Rupee input that exposes integer paise to the form. Shows Indian grouping when not focused.
 * `null` means empty.
 */
export function CurrencyInput({
  value,
  onChange,
  onBlur,
  id,
  invalid,
  disabled,
  placeholder = "0",
  className,
  ...rest
}: {
  value: number | null | undefined;
  onChange: (paise: number | null) => void;
  onBlur?: () => void;
  id?: string;
  invalid?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  "aria-describedby"?: string;
}) {
  const [focused, setFocused] = React.useState(false);
  const [text, setText] = React.useState(() => (value == null ? "" : paiseToRupeeInput(value)));

  const display = focused ? text : value == null ? "" : formatRupeesPlain(value);

  return (
    <div className={cn("relative", className)}>
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">₹</span>
      <input
        id={id}
        inputMode="decimal"
        autoComplete="off"
        disabled={disabled}
        placeholder={placeholder}
        aria-invalid={invalid || undefined}
        className={cn(inputClass, "pl-7 tabular")}
        value={display}
        onFocus={() => {
          setText(value == null ? "" : paiseToRupeeInput(value));
          setFocused(true);
        }}
        onBlur={() => {
          setFocused(false);
          onBlur?.();
        }}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^\d.]/g, "");
          if (!/^\d*(\.\d{0,2})?$/.test(raw)) return;
          setText(raw);
          onChange(raw === "" ? null : rupeesToPaise(raw));
        }}
        {...rest}
      />
    </div>
  );
}
