"use client";
import { cn } from "@/lib/utils/cn";
import { useData } from "@/components/providers/data-provider";
import { useImageUrl } from "@/hooks/use-image-url";
import { LogoMark } from "./logo";

/** "Prestige Auto Hub" → "PA": first letters of the first two words. */
export function showroomInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (words.slice(0, 2).map((w) => w[0]).join("") || "S").toUpperCase();
}

/**
 * The showroom's logo: the one uploaded in Settings → Showroom profile, else the M Garage badge.
 * `initials` shows the name's initials instead of the badge when nothing is uploaded.
 */
export function ShowroomLogo({ className, initials = false }: { className?: string; initials?: boolean }) {
  const { ds } = useData();
  const logo = useImageUrl(ds.settings.logoKey);
  if (logo.url)
    // eslint-disable-next-line @next/next/no-img-element -- blob URL from local storage
    return <img src={logo.url} alt={`${ds.settings.showroomName} logo`} className={cn("size-14 object-contain", className)} />;
  if (!initials) return <LogoMark className={cn("size-14", className, "rounded-full")} />;
  return (
    <div
      className={cn("flex size-14 items-center justify-center rounded-lg bg-primary text-lg font-semibold tracking-tight text-primary-foreground print:[print-color-adjust:exact]", className)}
      aria-label={`${ds.settings.showroomName} logo`}
      role="img"
    >
      {showroomInitials(ds.settings.showroomName)}
    </div>
  );
}
