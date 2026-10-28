"use client";
import * as React from "react";
import { cn } from "@/lib/utils/cn";
import { inputClass } from "@/components/ui/input";

/** Native date input: accessible, keyboard-friendly and uses the phone's date picker on mobile. */
export function DateField({
  className,
  invalid,
  ...props
}: Omit<React.ComponentProps<"input">, "type"> & { invalid?: boolean }) {
  return <input type="date" aria-invalid={invalid || undefined} className={cn(inputClass, "tabular", className)} {...props} />;
}
