"use client";
import { useAuth } from "@/hooks/use-auth";
import type { Permission } from "@/lib/permissions";

/** Renders children only when the current role has every listed permission. */
export function RoleGuard({
  permission,
  children,
  fallback = null,
}: {
  permission: Permission | Permission[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const { can } = useAuth();
  const list = Array.isArray(permission) ? permission : [permission];
  return <>{list.every(can) ? children : fallback}</>;
}
