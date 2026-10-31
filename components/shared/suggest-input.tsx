"use client";
import * as React from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils/cn";

/**
 * Text field with a styled suggestion list. A value that isn't in the list is kept as typed,
 * so makes and colours stay open-ended.
 */
export function SuggestInput({
  id,
  name,
  value,
  onChange,
  onBlur,
  options,
  placeholder,
  invalid,
}: {
  id?: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  options: readonly string[];
  placeholder?: string;
  invalid?: boolean;
}) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);
  const [open, setOpen] = React.useState(false);
  const [narrow, setNarrow] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const [rect, setRect] = React.useState<DOMRect | null>(null);

  const query = value.trim().toLowerCase();
  const known = options.some((option) => option.toLowerCase() === query);
  const matches = !narrow ? options : options.filter((option) => option.toLowerCase().includes(query));
  const typedIsNew = narrow && query.length > 0 && !known;
  const items = typedIsNew ? [value.trim(), ...matches] : matches;

  function showAll() {
    setNarrow(false);
    setOpen(true);
  }

  React.useLayoutEffect(() => {
    if (!open) return;
    const update = () => setRect(rootRef.current?.getBoundingClientRect() ?? null);
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const selected = items.findIndex((option) => option.toLowerCase() === query);
    setActive(selected >= 0 ? selected : 0);
  }, [query, open, narrow]);

  React.useEffect(() => {
    const item = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    item?.scrollIntoView({ block: "nearest" });
  }, [active, open, items.length]);

  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target) || listRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function choose(next: string) {
    onChange(next);
    setOpen(false);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      showAll();
      return;
    }
    if (!open) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => (items.length === 0 ? 0 : (index + 1) % items.length));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => (items.length === 0 ? 0 : (index - 1 + items.length) % items.length));
    } else if (event.key === "Enter" && items[active]) {
      event.preventDefault();
      choose(items[active]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    }
  }

  const list =
    open && rect
      ? createPortal(
          <ul
            ref={listRef}
            id={id ? `${id}-list` : undefined}
            role="listbox"
            style={{ top: rect.bottom + 4, left: rect.left, width: rect.width }}
            className="fixed z-50 max-h-56 overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg"
          >
            {items.length === 0 ? (
              <li className="px-2 py-2 text-sm text-muted-foreground">No matches</li>
            ) : (
              items.map((option, index) => {
                const custom = typedIsNew && index === 0;
                const selected = option.toLowerCase() === query;
                return (
                  <li key={`${option}-${index}`} role="presentation">
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
                      onClick={() => choose(option)}
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {custom ? <span className="text-muted-foreground">Use “{option}”</span> : option}
                      </span>
                      {selected && <Check className="size-4 shrink-0 text-primary" aria-hidden />}
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
    <div ref={rootRef} className="relative">
      <Input
        id={id}
        name={name}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-controls={id ? `${id}-list` : undefined}
        aria-invalid={invalid || undefined}
        className="pr-9"
        onChange={(event) => {
          onChange(event.target.value);
          setNarrow(true);
          setOpen(true);
        }}
        onPointerDown={showAll}
        onFocus={showAll}
        onBlur={() => {
          onBlur?.();
          // Blur can fire in the same click that focuses the field. Close only if focus actually left.
          window.setTimeout(() => {
            const active = document.activeElement;
            if (active && (rootRef.current?.contains(active) || listRef.current?.contains(active))) return;
            setOpen(false);
          }, 0);
        }}
        onKeyDown={onKeyDown}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label="Show suggestions"
        className="absolute top-1/2 right-1 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          if (open) setOpen(false);
          else showAll();
        }}
      >
        <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
      </button>
      {list}
    </div>
  );
}
