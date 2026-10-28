"use client";
import * as React from "react";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useUiStore } from "@/lib/store/ui";
import { DataProvider } from "./data-provider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider delayDuration={250}>
      <ThemeSync />
      <DataProvider>{children}</DataProvider>
      <Toaster
        position="bottom-right"
        richColors
        closeButton
        toastOptions={{ classNames: { toast: "font-sans text-sm" } }}
      />
    </TooltipProvider>
  );
}

/** Mirrors the chosen colour theme onto <html data-theme>, where the CSS tokens pick it up. */
function ThemeSync() {
  const theme = useUiStore((s) => s.theme);
  React.useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  return null;
}
