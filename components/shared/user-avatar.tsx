import { cn } from "@/lib/utils/cn";
import { initials } from "@/lib/utils/labels";

const PALETTE = ["#1E3A8A", "#0F766E", "#9333EA", "#C2410C", "#0E7490", "#4D7C0F", "#BE185D"];

export function UserAvatar({ name, className, size = "md" }: { name: string; className?: string; size?: "sm" | "md" | "lg" }) {
  const hash = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white",
        size === "sm" && "size-6 text-[10px]",
        size === "md" && "size-8 text-xs",
        size === "lg" && "size-10 text-sm",
        className,
      )}
      style={{ backgroundColor: PALETTE[hash % PALETTE.length] }}
    >
      {initials(name)}
    </span>
  );
}
