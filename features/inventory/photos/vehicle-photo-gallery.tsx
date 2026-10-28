"use client";
import * as React from "react";
import { ChevronLeft, ChevronRight, Expand, ImagePlus, Images, X } from "lucide-react";
import { Dialog as P } from "radix-ui";
import { toast } from "sonner";
import { cn } from "@/lib/utils/cn";
import { preparePhoto } from "@/lib/images/process";
import { dealerService } from "@/lib/services/dealer-service";
import { reportError } from "@/hooks/use-commands";
import { useAuth, useCurrentUser } from "@/hooks/use-auth";
import { useData } from "@/components/providers/data-provider";
import type { Vehicle, VehicleImage as VehicleImageRecord } from "@/types";
import { Button } from "@/components/ui/button";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { VehicleImage } from "@/components/shared/vehicle-image";
import { EmptyState } from "@/components/shared/empty-state";
import { PhotoCredit } from "@/components/shared/photo-credit";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { PhotoDropZone, processFiles } from "./drop-zone";
import { SortablePhotoGrid, moveItem } from "./sortable-photo-grid";

export function VehiclePhotoGallery({ vehicle, images, title }: { vehicle: Vehicle; images: VehicleImageRecord[]; title: string }) {
  const { can } = useAuth();
  const [index, setIndex] = React.useState(() => Math.max(0, images.findIndex((i) => i.isCover)));
  const [lightbox, setLightbox] = React.useState(false);
  const [manage, setManage] = React.useState(false);
  const canManage = can("inventory.photos") && !vehicle.archivedAt;
  const safeIndex = Math.min(index, Math.max(0, images.length - 1));
  const current = images[safeIndex];

  const go = React.useCallback((d: number) => setIndex((i) => (images.length ? (i + d + images.length) % images.length : 0)), [images.length]);

  return (
    <div className="grid content-start gap-3">
      <div className="group relative overflow-hidden rounded-xl border bg-[#eef0f3]">
        {images.length === 0 ? (
          <div className="aspect-[16/10]">
            <EmptyState
              icon={Images}
              title="No photos yet"
              description="Good photos help sales staff show this car."
              action={canManage && <Button size="sm" onClick={() => setManage(true)}><ImagePlus /> Add photos</Button>}
              className="h-full py-8"
            />
          </div>
        ) : (
          <>
            <button
              type="button"
              className="block w-full cursor-zoom-in outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              onClick={() => setLightbox(true)}
              aria-label="Open photo viewer"
            >
              <VehicleImage image={current} variant="full" alt={`${title} photo ${safeIndex + 1}`} className="aspect-[16/10] w-full" />
            </button>
            {images.length > 1 && (
              <>
                <NavButton side="left" onClick={() => go(-1)} />
                <NavButton side="right" onClick={() => go(1)} />
              </>
            )}
            <div className="pointer-events-none absolute right-3 bottom-3 flex items-center gap-2">
              <span className="rounded-md bg-black/55 px-2 py-1 text-xs font-medium text-white tabular">
                {safeIndex + 1} / {images.length}
              </span>
              <span className="rounded-md bg-black/55 p-1.5 text-white"><Expand className="size-3.5" /></span>
            </div>
          </>
        )}
      </div>

      {current?.attribution && <PhotoCredit attribution={current.attribution} className="-mt-1.5" />}

      {(images.length > 1 || canManage) && (
        <div className="flex items-center gap-2">
          <ul className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]" aria-label="Photo thumbnails">
            {images.map((img, i) => (
              <li key={img.id} className="shrink-0">
                <button
                  type="button"
                  onClick={() => setIndex(i)}
                  aria-label={`Show photo ${i + 1}`}
                  aria-current={i === safeIndex}
                  className={cn(
                    "block overflow-hidden rounded-md border-2 outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                    i === safeIndex ? "border-primary" : "border-transparent opacity-80 hover:opacity-100",
                  )}
                >
                  <VehicleImage image={img} alt="" className="h-14 w-20" />
                </button>
              </li>
            ))}
          </ul>
          {canManage && (
            <Button variant="outline" size="sm" onClick={() => setManage(true)} className="shrink-0">
              <Images /> Manage photos
            </Button>
          )}
        </div>
      )}

      <Lightbox open={lightbox} onOpenChange={setLightbox} images={images} index={safeIndex} setIndex={setIndex} title={title} />
      {canManage && <ManagePhotosSheet open={manage} onOpenChange={setManage} vehicle={vehicle} images={images} title={title} />}
    </div>
  );
}

function NavButton({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === "left" ? "Previous photo" : "Next photo"}
      className={cn(
        "absolute top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-foreground shadow-md transition-opacity outline-none hover:bg-white focus-visible:ring-2 focus-visible:ring-ring/50 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100",
        side === "left" ? "left-3" : "right-3",
      )}
    >
      <Icon className="size-5" />
    </button>
  );
}

function Lightbox({
  open,
  onOpenChange,
  images,
  index,
  setIndex,
  title,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  images: VehicleImageRecord[];
  index: number;
  setIndex: React.Dispatch<React.SetStateAction<number>>;
  title: string;
}) {
  const go = (d: number) => setIndex((i) => (i + d + images.length) % images.length);
  return (
    <P.Root open={open} onOpenChange={onOpenChange}>
      <P.Portal>
        <P.Overlay className="fixed inset-0 z-50 bg-black/90 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <P.Content
          className="fixed inset-0 z-50 flex flex-col outline-none"
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") go(-1);
            if (e.key === "ArrowRight") go(1);
          }}
        >
          <div className="flex items-center justify-between px-4 py-3 text-white">
            <P.Title className="text-sm font-medium">
              {title} <span className="ml-2 text-white/60 tabular">{index + 1} / {images.length}</span>
            </P.Title>
            <P.Description className="sr-only">Use the arrow keys to move between photos.</P.Description>
            <P.Close className="rounded-md p-2 text-white/80 outline-none hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white/60" aria-label="Close viewer">
              <X className="size-5" />
            </P.Close>
          </div>
          <div className="relative flex min-h-0 flex-1 items-center justify-center px-4 sm:px-16">
            {images[index] && (
              <VehicleImage image={images[index]} variant="full" alt={`${title} photo ${index + 1}`} className="max-h-full w-full max-w-6xl bg-transparent" imgClassName="max-h-[calc(100dvh-180px)] object-contain" />
            )}
            {images.length > 1 && (
              <>
                <button type="button" onClick={() => go(-1)} aria-label="Previous photo" className="absolute left-2 rounded-full bg-white/10 p-2.5 text-white outline-none hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white/60 sm:left-4">
                  <ChevronLeft className="size-6" />
                </button>
                <button type="button" onClick={() => go(1)} aria-label="Next photo" className="absolute right-2 rounded-full bg-white/10 p-2.5 text-white outline-none hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white/60 sm:right-4">
                  <ChevronRight className="size-6" />
                </button>
              </>
            )}
          </div>
          {images[index]?.attribution && <PhotoCredit attribution={images[index].attribution} dark className="px-4 pt-3 text-center" />}
          <ul className="flex justify-center gap-2 overflow-x-auto px-4 py-4">
            {images.map((img, i) => (
              <li key={img.id}>
                <button
                  type="button"
                  onClick={() => setIndex(i)}
                  aria-label={`Show photo ${i + 1}`}
                  className={cn("block overflow-hidden rounded border-2 outline-none", i === index ? "border-white" : "border-transparent opacity-60 hover:opacity-100")}
                >
                  <VehicleImage image={img} alt="" className="h-12 w-16" />
                </button>
              </li>
            ))}
          </ul>
        </P.Content>
      </P.Portal>
    </P.Root>
  );
}

function ManagePhotosSheet({
  open,
  onOpenChange,
  vehicle,
  images,
  title,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  vehicle: Vehicle;
  images: VehicleImageRecord[];
  title: string;
}) {
  const user = useCurrentUser();
  const { ds } = useData();
  const { maxUploadMb, maxPhotosPerVehicle } = ds.settings;
  const [processing, setProcessing] = React.useState<{ done: number; total: number } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [toRemove, setToRemove] = React.useState<VehicleImageRecord | null>(null);

  async function addFiles(files: File[]) {
    const { ok, errors } = await processFiles(files, maxPhotosPerVehicle - images.length, (f) => preparePhoto(f, maxUploadMb), (done, total) =>
      setProcessing({ done, total }),
    );
    errors.forEach((m) => toast.error(m));
    try {
      if (ok.length) {
        await dealerService.addVehiclePhotos(user, vehicle.id, ok);
        toast.success(`${ok.length} photo${ok.length === 1 ? "" : "s"} added`);
      }
    } catch (e) {
      reportError(e);
    } finally {
      setProcessing(null);
    }
  }

  async function run(fn: () => Promise<void>, msg?: string) {
    setBusy(true);
    try {
      await fn();
      if (msg) toast.success(msg);
    } catch (e) {
      reportError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>Manage photos</SheetTitle>
          <SheetDescription>
            {title} · {images.length} of {maxPhotosPerVehicle} photos. Drag to reorder; the cover appears on cards and listings.
          </SheetDescription>
        </SheetHeader>
        <SheetBody className="grid content-start gap-4">
          <PhotoDropZone onFiles={addFiles} processing={processing} maxUploadMb={maxUploadMb} remaining={maxPhotosPerVehicle - images.length} compact />
          {images.length > 0 && (
            <SortablePhotoGrid
              items={images}
              disabled={busy || !!processing}
              renderImage={(img) => <VehicleImage image={img} alt="" className="size-full" />}
              onMove={(from, to) =>
                run(() => dealerService.reorderVehiclePhotos(user, vehicle.id, moveItem(images, from, to).map((i) => i.id)))
              }
              onMakeCover={(img) => run(() => dealerService.setCoverPhoto(user, img.id), "Cover photo updated")}
              onRemove={setToRemove}
            />
          )}
        </SheetBody>
        <ConfirmDialog
          open={!!toRemove}
          onOpenChange={(o) => !o && setToRemove(null)}
          title="Delete this photo?"
          description={toRemove?.isCover ? "This is the cover photo. The next photo will become the cover." : "The photo will be permanently removed from this vehicle."}
          confirmLabel="Delete photo"
          tone="destructive"
          onConfirm={async () => {
            if (!toRemove) return;
            try {
              await dealerService.removeVehiclePhoto(user, toRemove.id);
              toast.success("Photo deleted");
            } catch (e) {
              reportError(e);
              return false;
            }
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
