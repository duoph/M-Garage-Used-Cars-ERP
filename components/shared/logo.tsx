import Image from "next/image";
import { cn } from "@/lib/utils/cn";

/** M Garage brand artwork in `public/brand`. */
export const BRAND = {
  /** Round black badge: sidebar, favicon-sized marks, loading screens. */
  badge: "/brand/m-garage-badge-256.webp",
  badgeLarge: "/brand/m-garage-badge.webp",
  /** Full wordmark on a transparent background, for light surfaces and printed documents. */
  wordmarkLight: "/brand/m-garage-logo-light.webp",
  /** Full wordmark on textured black, for dark panels. */
  wordmarkDark: "/brand/m-garage-logo-dark.webp",
  /** Tall phone splash. */
  splash: "/brand/m-garage-splash.webp",
} as const;

/** The round M Garage badge. `inverted` is kept for older call sites; the badge reads on any background. */
export function LogoMark({ className, large = false }: { className?: string; inverted?: boolean; large?: boolean }) {
  return (
    <Image
      src={large ? BRAND.badgeLarge : BRAND.badge}
      alt="M Garage"
      width={large ? 1254 : 256}
      height={large ? 1254 : 256}
      className={cn("size-8 shrink-0 rounded-full object-cover", className)}
      priority
    />
  );
}

/** The full "M Garage — Pre Owned Cars" wordmark. `dark` picks the version made for black backgrounds. */
export function Wordmark({ className, dark = false }: { className?: string; dark?: boolean }) {
  return dark ? (
    <Image src={BRAND.wordmarkDark} alt="M Garage — Pre Owned Cars" width={710} height={404} className={cn("h-auto w-56", className)} priority />
  ) : (
    <Image src={BRAND.wordmarkLight} alt="M Garage — Pre Owned Cars" width={1672} height={941} className={cn("h-auto w-56", className)} priority />
  );
}

export function Logo({ className, dark = false, tagline = false }: { className?: string; dark?: boolean; tagline?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <LogoMark className="size-9" />
      <div className="leading-none">
        <div className={cn("text-[15px] font-semibold tracking-tight", dark ? "text-white" : "text-foreground")}>
          M <span className="text-[#e11d2a]">Garage</span>
        </div>
        {tagline && (
          <div className={cn("mt-1 text-[10px] font-medium tracking-[0.16em] uppercase", dark ? "text-sidebar-muted" : "text-muted-foreground")}>
            Pre Owned Cars
          </div>
        )}
      </div>
    </div>
  );
}
