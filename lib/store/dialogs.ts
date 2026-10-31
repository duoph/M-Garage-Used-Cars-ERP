"use client";
import { create } from "zustand";
import type { VoucherType } from "@/types";

export interface VoucherDialogOptions {
  type?: VoucherType;
  /** Pre-selects a seller payment against this purchase. */
  purchaseId?: string | null;
  /** Pre-selects a buyer payment against this sale (receipt) or a refund (payment). */
  saleId?: string | null;
  accountId?: string | null;
}

/** App-wide dialogs that can be opened from anywhere (quick actions, dashboard, detail pages). */
interface DialogState {
  expense: { open: boolean; expenseId: string | null; vehicleId: string | null };
  voucher: { open: boolean } & Required<VoucherDialogOptions>;
  search: boolean;
  openExpense: (opts?: { expenseId?: string | null; vehicleId?: string | null }) => void;
  closeExpense: () => void;
  openVoucher: (opts?: VoucherDialogOptions) => void;
  closeVoucher: () => void;
  setSearch: (open: boolean) => void;
}

export const useDialogStore = create<DialogState>()((set) => ({
  expense: { open: false, expenseId: null, vehicleId: null },
  voucher: { open: false, type: "receipt", purchaseId: null, saleId: null, accountId: null },
  search: false,
  openExpense: (opts) =>
    set({ expense: { open: true, expenseId: opts?.expenseId ?? null, vehicleId: opts?.vehicleId ?? null } }),
  closeExpense: () => set((s) => ({ expense: { ...s.expense, open: false } })),
  openVoucher: (opts) =>
    set({
      voucher: {
        open: true,
        type: opts?.type ?? "receipt",
        purchaseId: opts?.purchaseId ?? null,
        saleId: opts?.saleId ?? null,
        accountId: opts?.accountId ?? null,
      },
    }),
  closeVoucher: () => set((s) => ({ voucher: { ...s.voucher, open: false } })),
  setSearch: (search) => set({ search }),
}));
