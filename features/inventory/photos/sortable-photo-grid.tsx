"use client";
import * as React from "react";
import { ChevronLeft, ChevronRight, GripVertical, Star, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export interface PhotoTileItem {
  id: string;
  isCover: boolean;
}

/**
 * Photo grid with drag-and-drop reordering (desktop) and arrow buttons (keyboard & touch).
 */
export function SortablePhotoGrid<T extends PhotoTileItem>({
  items,
  renderImage,
  onMove,
  onMakeCover,
  onRemove,
  disabled,
}: {
  items: T[];
  renderImage: (item: T) => React.ReactNode;
  onMove: (from: number, to: number) => void;
  onMakeCover: (item: T) => void;
  onRemove: (item: T) => void;
  disabled?: boolean;
}) {
  const [dragIndex, setDragIndex] = React.useState<number | null>(null);
  const [overIndex, setOverIndex] = React.useState<number | null>(null);

  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" aria-label="Photos">
      {items.map((item, i) => (
        <li
          key={item.id}
          draggable={!disabled}
          onDragStart={(e) => {
            setDragIndex(i);
            e.dataTransfer.effectAllowed = "move";
          }}
          onDragOver={(e) => {
            if (dragIndex === null) return;
            e.preventDefault();
            setOverIndex(i);
          }}
          onDragLeave={() => setOverIndex((o) => (o === i ? null : o))}
          onDrop={(e) => {
            e.preventDefault();
            if (dragIndex !== null && dragIndex !== i) onMove(dragIndex, i);
            setDragIndex(null);
            setOverIndex(null);
          }}
          onDragEnd={() => {
            setDragIndex(null);
            setOverIndex(null);
          }}
          className={cn(
            "group relative overflow-hidden rounded-lg border bg-card",
            dragIndex === i && "opacity-40",
            overIndex === i && dragIndex !== i && "ring-2 ring-primary",
          )}
        >
          <div className="aspect-[4/3]">{renderImage(item)}</div>
          <div className="absolute top-1.5 left-1.5 flex items-center gap-1">
            {item.isCover ? (
              <span className="flex items-center gap-1 rounded-md bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-white">
                <Star className="size-3 fill-current" /> Cover
              </span>
            ) : (
              <span className="rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white tabular">{i + 1}</span>
            )}
          </div>
          <GripVertical className="absolute top-1.5 right-1.5 hidden size-4 cursor-grab text-white drop-shadow sm:block" aria-hidden />
          <div className="flex items-center justify-between gap-1 border-t bg-card px-1.5 py-1">
            <div className="flex">
              <IconBtn label="Move earlier" disabled={disabled || i === 0} onClick={() => onMove(i, i - 1)}>
                <ChevronLeft />
              </IconBtn>
              <IconBtn label="Move later" disabled={disabled || i === items.length - 1} onClick={() => onMove(i, i + 1)}>
                <ChevronRight />
              </IconBtn>
            </div>
            <div className="flex">
              <IconBtn label="Set as cover" disabled={disabled || item.isCover} onClick={() => onMakeCover(item)}>
                <Star />
              </IconBtn>
              <IconBtn label="Remove photo" disabled={disabled} onClick={() => onRemove(item)} danger>
                <Trash2 />
              </IconBtn>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function IconBtn({ label, onClick, disabled, danger, children }: { label: string; onClick: () => void; disabled?: boolean; danger?: boolean; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
          className={cn(
            "rounded p-1.5 text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-30 [&_svg]:size-3.5",
            danger && "hover:bg-destructive-soft hover:text-destructive",
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const next = list.slice();
  const [it] = next.splice(from, 1);
  next.splice(to, 0, it);
  return next;
}
