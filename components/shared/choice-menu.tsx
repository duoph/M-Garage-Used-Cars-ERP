"use client";
import * as React from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { inputClass } from "@/components/ui/input";
import { useMenuAnchor } from "@/components/shared/menu-anchor";
import { cn } from "@/lib/utils/cn";

export interface ChoiceOption {
  value: string;
  label: React.ReactNode;
  /** Text shown on the closed field. Defaults to `label` when that is a string. */
  text?: string;
  group?: string;
}

function optionText(option: ChoiceOption): string {
  if (option.text) return option.text;
  return typeof option.label === "string" ? option.label : option.value;
}

/**
 * Closed dropdown with the same list as the Make field. The value has to be one of `options`.
 */
export function ChoiceMenu({
  id,
  value,
  onValueChange,
  onBlur,
  options,
  placeholder = "Select",
  disabled,
  invalid,
  className,
  icon,
  "aria-label": ariaLabel,
}: {
  id?: string;
  value: string;
  onValueChange: (value: string) => void;
  onBlur?: () => void;
  options: readonly ChoiceOption[];
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
  icon?: React.ReactNode;
  "aria-label"?: string;
}) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const box = useMenuAnchor(open, rootRef);
  const selected = options.find((option) => option.value === value);
  const listId = id ? `${id}-list` : undefined;

  React.useEffect(() => {
    if (!open) return;
    const index = Math.max(0, options.findIndex((option) => option.value === value));
    setActive(index);
  }, [open, options, value]);

  React.useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function close() {
    setOpen(false);
    onBlur?.();
  }

  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target) || listRef.current?.contains(target)) return;
      close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function choose(next: string) {
    onValueChange(next);
    setOpen(false);
    onBlur?.();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    if (!open && (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      setOpen(true);
      return;
    }
    if (!open) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => (options.length === 0 ? 0 : (index + 1) % options.length));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => (options.length === 0 ? 0 : (index - 1 + options.length) % options.length));
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const option = options[active];
      if (option) choose(option.value);
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  }

  let lastGroup = "";
  const list =
    open && box
      ? createPortal(
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            style={{ top: box.top, bottom: box.bottom, left: box.left, width: Math.max(box.width, 160) }}
            className="fixed z-[80] max-h-56 overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg"
          >
            {options.length === 0 ? (
              <li className="px-2 py-2 text-sm text-muted-foreground">Nothing to choose</li>
            ) : (
              options.map((option, index) => {
                const group = option.group && option.group !== lastGroup ? option.group : null;
                if (option.group) lastGroup = option.group;
                const isSelected = option.value === value;
                return (
                  <li key={option.value} role="presentation">
                    {group && <div className="px-2 pt-2 pb-1 text-xs font-medium text-muted-foreground">{group}</div>}
                    <button
                      type="button"
                      role="option"
                      data-index={index}
                      aria-selected={index === active}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none",
                        index === active ? "bg-muted" : "hover:bg-muted",
                      )}
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseEnter={() => setActive(index)}
                      onClick={() => choose(option.value)}
                    >
                      <span className="min-w-0 flex-1 truncate">{option.label}</span>
                      {isSelected && <Check className="size-4 shrink-0 text-primary" aria-hidden />}
                    </button>
                  </li>
                );
              })
            )}
          </ul>,
          document.body,
        )
      : null;

  return (
    <div ref={rootRef} className={cn("relative", className?.includes("w-") ? "w-auto" : undefined)}>
      <button
        id={id}
        type="button"
        disabled={disabled}
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={listId}
        aria-invalid={invalid || undefined}
        className={cn(inputClass, "cursor-pointer items-center justify-between gap-2 pr-2 text-left", !selected && "text-muted-foreground/80", className)}
        onClick={() => (open ? close() : setOpen(true))}
        onKeyDown={onKeyDown}
      >
        <span className="flex min-w-0 items-center gap-2">
          {icon}
          <span className="truncate">{selected ? optionText(selected) : placeholder}</span>
        </span>
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {list}
    </div>
  );
}
