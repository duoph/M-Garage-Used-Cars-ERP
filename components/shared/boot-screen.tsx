"use client";
import { usePathname } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { LogoMark, Wordmark } from "./logo";

/**
 * Shown while the local database opens. Inside the app it mirrors the real layout so the
 * screen doesn't jump when data arrives; on sign-in/print pages it's a simple centred mark.
 */
export function BootScreen({ error }: { error?: string }) {
  const pathname = usePathname();
  if (error)
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <Wordmark className="w-56" />
        <div className="max-w-md rounded-xl border bg-card p-4 text-sm">
          <AlertTriangle className="mx-auto mb-2 size-5 text-warning" />
          <p className="font-medium">Unable to start</p>
          <p className="mt-1 text-muted-foreground">{error}</p>
        </div>
      </div>
    );

  if (pathname.startsWith("/login") || pathname.startsWith("/receipt"))
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4" role="status" aria-label="Loading">
        <LogoMark large className="size-24 animate-pulse" />
      </div>
    );

  return (
    <div className="min-h-dvh" role="status" aria-label="Loading your showroom">
      <aside className="fixed inset-y-0 left-0 hidden w-60 bg-sidebar p-4 lg:block">
        <div className="mb-8 flex items-center gap-2.5">
          <LogoMark />
          <div className="h-3 w-20 rounded bg-white/10" />
        </div>
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="mb-3 flex items-center gap-3 px-1">
            <div className="size-4 rounded bg-white/10" />
            <div className="h-3 rounded bg-white/10" style={{ width: `${50 + ((i * 17) % 40)}%` }} />
          </div>
        ))}
      </aside>
      <div className="lg:pl-60">
        <div className="flex h-14 items-center gap-3 border-b bg-card px-6">
          <Skeleton className="h-9 w-full max-w-md" />
          <Skeleton className="ml-auto size-8 rounded-full" />
        </div>
        <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6 lg:px-8">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="mt-2 h-4 w-64" />
          <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <Skeleton className="h-72 rounded-xl lg:col-span-2" />
            <Skeleton className="h-72 rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  );
}
