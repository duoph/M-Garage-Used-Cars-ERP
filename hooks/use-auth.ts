"use client";
import * as React from "react";
import { useData } from "@/components/providers/data-provider";
import { can as canFn, type Permission } from "@/lib/permissions";
import { useSessionStore } from "@/lib/store/session";
import type { User } from "@/types";

export interface AuthState {
  user: User | null;
  can: (permission: Permission) => boolean;
}

export function useAuth(): AuthState {
  const { idx } = useData();
  const userId = useSessionStore((s) => s.userId);
  const user = userId ? idx.users.get(userId) ?? null : null;
  const active = user && user.status === "active" ? user : null;
  const can = React.useCallback((p: Permission) => canFn(active, p), [active]);
  return { user: active, can };
}

/** For use inside authenticated screens; AppShell guarantees a signed-in user. */
export function useCurrentUser(): User {
  const { user } = useAuth();
  if (!user) throw new Error("No signed-in user");
  return user;
}
