"use client";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * Which staff profile is signed in on this device.
 * - With Supabase configured, `authUserId` is the Supabase Auth user the profile was loaded for; the app
 *   shell signs out whenever the live Supabase session no longer matches it. Supabase keeps the real
 *   session (cookies); this store only remembers the profile id for the local data layer.
 * - Without Supabase (local demo mode) there is no password and `authUserId` stays null.
 */
interface SessionState {
  userId: string | null;
  authUserId: string | null;
  signIn: (userId: string, authUserId?: string | null) => void;
  signOut: () => void;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      userId: null,
      authUserId: null,
      signIn: (userId, authUserId = null) => set({ userId, authUserId }),
      signOut: () => set({ userId: null, authUserId: null }),
    }),
    { name: "dealeros-demo-session", storage: createJSONStorage(() => localStorage) },
  ),
);
