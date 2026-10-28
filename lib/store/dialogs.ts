"use client";
import { create } from "zustand";

/** App-wide dialogs that can be opened from anywhere (quick actions, dashboard, detail pages). */
interface DialogState {
  expense: { open: boolean; expenseId: string | null; vehicleId: string | null };
  search: boolean;
  openExpense: (opts?: { expenseId?: string | null; vehicleId?: string | null }) => void;
  closeExpense: () => void;
  setSearch: (open: boolean) => void;
}

export const useDialogStore = create<DialogState>()((set) => ({
  expense: { open: false, expenseId: null, vehicleId: null },
  search: false,
  openExpense: (opts) =>
    set({ expense: { open: true, expenseId: opts?.expenseId ?? null, vehicleId: opts?.vehicleId ?? null } }),
  closeExpense: () => set((s) => ({ expense: { ...s.expense, open: false } })),
  setSearch: (search) => set({ search }),
}));
