"use client";
import { CarFront } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useImageUrl } from "@/hooks/use-image-url";
import type { VehicleImage as VehicleImageRecord } from "@/types";

/** Displays a stored vehicle photo with a skeleton while loading and a neutral fallback. */
export function VehicleImage({
  image,
  variant = "thumb",
  alt,
  className,
  imgClassName,
}: {
  image: VehicleImageRecord | undefined | null;
  variant?: "thumb" | "full";
  alt: string;
  className?: string;
  imgClassName?: string;
}) {
  const key = image ? (variant === "thumb" ? image.thumbKey : image.storageKey) : null;
  const { status, url } = useImageUrl(key);
  return (
    <div className={cn("relative overflow-hidden bg-[#eef0f3]", className)}>
      {status === "ready" && url ? (
        // eslint-disable-next-line @next/next/no-img-element -- blob: object URLs can't use next/image
        <img src={url} alt={alt} className={cn("size-full object-cover", imgClassName)} draggable={false} />
      ) : status === "loading" ? (
        <div className="size-full animate-pulse bg-[#e9ecf0]" />
      ) : (
        <div className="flex size-full items-center justify-center text-[#98a2b3]" role="img" aria-label={`${alt} (no photo)`}>
          <CarFront className="size-1/3 max-h-10 max-w-10" strokeWidth={1.5} />
        </div>
      )}
    </div>
  );
}
