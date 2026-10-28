"use client";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { resolvePreset, type DateRange } from "@/lib/utils/dates";
import { DEFAULT_THEME, type ThemeId } from "@/lib/themes";
import type { InventoryViewPreference } from "@/types";

interface UiState {
  sidebarCollapsed: boolean;
  mobileNavOpen: boolean;
  inventoryView: InventoryViewPreference | null;
  dashboardRange: DateRange;
  theme: ThemeId;
  toggleSidebar: () => void;
  setMobileNavOpen: (open: boolean) => void;
  setInventoryView: (view: InventoryViewPreference) => void;
  setDashboardRange: (range: DateRange) => void;
  setTheme: (theme: ThemeId) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      mobileNavOpen: false,
      inventoryView: null,
      dashboardRange: resolvePreset("this_month"),
      theme: DEFAULT_THEME,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setMobileNavOpen: (mobileNavOpen) => set({ mobileNavOpen }),
      setInventoryView: (inventoryView) => set({ inventoryView }),
      setDashboardRange: (dashboardRange) => set({ dashboardRange }),
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: "dealeros-ui",
      storage: createJSONStorage(() => localStorage),
      // Only small per-device preferences are persisted; business data lives in IndexedDB.
      partialize: (s) => ({ sidebarCollapsed: s.sidebarCollapsed, inventoryView: s.inventoryView, theme: s.theme }),
    },
  ),
);
