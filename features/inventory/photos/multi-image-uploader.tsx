"use client";
import * as React from "react";
import { toast } from "sonner";
import { preparePhoto } from "@/lib/images/process";
import type { PreparedPhoto } from "@/lib/repositories/contracts";
import { newId } from "@/lib/utils/ids";
import { useData } from "@/components/providers/data-provider";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { PhotoDropZone, processFiles } from "./drop-zone";
import { SortablePhotoGrid, moveItem } from "./sortable-photo-grid";

export interface PendingPhoto {
  id: string;
  name: string;
  prepared: PreparedPhoto;
  previewUrl: string;
  isCover: boolean;
}

/**
 * Collects photos before a record is saved (purchase wizard). Photos are processed in the
 * browser immediately; a failed photo never resets the surrounding form.
 */
export function MultiImageUploader({ value, onChange }: { value: PendingPhoto[]; onChange: (photos: PendingPhoto[]) => void }) {
  const { ds } = useData();
  const { maxUploadMb, maxPhotosPerVehicle } = ds.settings;
  const [processing, setProcessing] = React.useState<{ done: number; total: number } | null>(null);
  const [toRemove, setToRemove] = React.useState<PendingPhoto | null>(null);
  const latest = React.useRef(value);
  React.useEffect(() => {
    latest.current = value;
  }, [value]);

  async function addFiles(files: File[]) {
    const { ok, errors } = await processFiles(
      files,
      maxPhotosPerVehicle - latest.current.length,
      async (f) => ({ name: f.name, prepared: await preparePhoto(f, maxUploadMb) }),
      (done, total) => setProcessing({ done, total }),
    );
    setProcessing(null);
    errors.forEach((m) => toast.error(m));
    if (ok.length) {
      const current = latest.current;
      const hasCover = current.some((p) => p.isCover);
      const added = ok.map((r, i) => ({
        id: newId(),
        name: r.name,
        prepared: r.prepared,
        previewUrl: URL.createObjectURL(r.prepared.thumb),
        isCover: !hasCover && i === 0,
      }));
      onChange([...current, ...added]);
      toast.success(`${ok.length} photo${ok.length === 1 ? "" : "s"} ready`);
    }
  }

  function remove(p: PendingPhoto) {
    URL.revokeObjectURL(p.previewUrl);
    const rest = value.filter((x) => x.id !== p.id);
    if (p.isCover && rest[0]) rest[0] = { ...rest[0], isCover: true };
    onChange(rest);
  }

  return (
    <div className="grid gap-4">
      <PhotoDropZone onFiles={addFiles} processing={processing} maxUploadMb={maxUploadMb} remaining={maxPhotosPerVehicle - value.length} />
      {value.length > 0 && (
        <SortablePhotoGrid
          items={value}
          disabled={!!processing}
          renderImage={(p) => (
            // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
            <img src={p.previewUrl} alt={p.name} className="size-full object-cover" draggable={false} />
          )}
          onMove={(from, to) => onChange(moveItem(value, from, to))}
          onMakeCover={(p) => onChange(value.map((x) => ({ ...x, isCover: x.id === p.id })))}
          onRemove={setToRemove}
        />
      )}
      <ConfirmDialog
        open={!!toRemove}
        onOpenChange={(o) => !o && setToRemove(null)}
        title="Remove this photo?"
        description="It hasn't been saved yet, so it will simply be discarded."
        confirmLabel="Remove"
        tone="destructive"
        onConfirm={() => {
          if (toRemove) remove(toRemove);
        }}
      />
    </div>
  );
}

/** Converts pending photos to the persistence shape, keeping the chosen order and cover. */
export function toPreparedPhotos(photos: PendingPhoto[]): PreparedPhoto[] {
  return photos.map((p) => ({ ...p.prepared, isCover: p.isCover }));
}
