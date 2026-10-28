"use client";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * DEMO ONLY: remembers which demo persona is "signed in". There are no passwords and no
 * security here; production must use server-issued, httpOnly session cookies.
 */
interface SessionState {
  userId: string | null;
  signIn: (userId: string) => void;
  signOut: () => void;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      userId: null,
      signIn: (userId) => set({ userId }),
      signOut: () => set({ userId: null }),
    }),
    { name: "dealeros-demo-session", storage: createJSONStorage(() => localStorage) },
  ),
);
