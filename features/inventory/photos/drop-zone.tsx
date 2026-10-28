"use client";
import * as React from "react";
import { Camera, ImagePlus, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { ACCEPTED_IMAGE_TYPES } from "@/lib/images/process";
import { Button } from "@/components/ui/button";

/** Drag-and-drop area with file picker and (on phones) a camera capture button. */
export function PhotoDropZone({
  onFiles,
  processing,
  maxUploadMb,
  remaining,
  compact = false,
}: {
  onFiles: (files: File[]) => void;
  processing?: { done: number; total: number } | null;
  maxUploadMb: number;
  remaining: number;
  compact?: boolean;
}) {
  const fileRef = React.useRef<HTMLInputElement>(null);
  const cameraRef = React.useRef<HTMLInputElement>(null);
  const [over, setOver] = React.useState(false);
  const busy = !!processing;
  const full = remaining <= 0;

  const handle = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    onFiles(Array.from(list));
  };

  return (
    <div
      onDragOver={(e) => {
        if (busy || full || !e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        setOver(false);
        if (!busy && !full) handle(e.dataTransfer.files);
      }}
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border-2 border-dashed bg-[#fafbfc] text-center transition-colors",
        compact ? "px-4 py-5" : "px-6 py-9",
        over && "border-primary bg-primary-soft/50",
        full && "opacity-60",
      )}
    >
      {busy ? (
        <div className="flex flex-col items-center gap-2" role="status" aria-live="polite">
          <Loader2 className="size-6 animate-spin text-primary" />
          <p className="text-sm font-medium">
            Optimising photos… {processing.done}/{processing.total}
          </p>
          <div className="h-1.5 w-48 overflow-hidden rounded-full bg-[#eceef2]">
            <div className="h-full bg-primary transition-all" style={{ width: `${(processing.done / Math.max(1, processing.total)) * 100}%` }} />
          </div>
        </div>
      ) : (
        <>
          <span className="mb-2 flex size-10 items-center justify-center rounded-full bg-primary-soft text-primary">
            <ImagePlus className="size-5" />
          </span>
          <p className="text-sm font-medium">{full ? "Photo limit reached" : "Drag photos here, or choose files"}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            JPEG, PNG or WebP · up to {maxUploadMb} MB each · {Math.max(0, remaining)} more allowed. Photos are resized and compressed automatically.
          </p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={full}>
              <ImagePlus /> Choose photos
            </Button>
            <Button type="button" size="sm" variant="outline" className="sm:hidden" onClick={() => cameraRef.current?.click()} disabled={full}>
              <Camera /> Take photo
            </Button>
          </div>
        </>
      )}
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(",")}
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          handle(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          handle(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}

/** Validates & compresses files one by one, reporting progress; failures don't stop the rest. */
export async function processFiles<T>(
  files: File[],
  limit: number,
  prepare: (f: File) => Promise<T>,
  onProgress: (done: number, total: number) => void,
): Promise<{ ok: T[]; errors: string[] }> {
  const take = files.slice(0, Math.max(0, limit));
  const errors: string[] = [];
  if (files.length > take.length) errors.push(`Only ${take.length} more photo${take.length === 1 ? "" : "s"} can be added; ${files.length - take.length} skipped.`);
  const ok: T[] = [];
  onProgress(0, take.length);
  for (const [i, f] of take.entries()) {
    try {
      ok.push(await prepare(f));
    } catch (e) {
      errors.push(e instanceof Error ? e.message : `${f.name}: could not be processed.`);
    }
    onProgress(i + 1, take.length);
  }
  return { ok, errors };
}
