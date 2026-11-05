"use client";
import { dealerService } from "@/lib/services/dealer-service";
import { BusinessError } from "@/lib/repositories/contracts";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { supabaseConfigured } from "@/lib/supabase/env";
import { newId } from "@/lib/utils/ids";
import type { UserInput } from "@/lib/validation/schemas";
import type { ID, User } from "@/types";

/** How a new staff member gets into the app. */
export type SignInSetup = { mode: "password"; password: string } | { mode: "invite" };

/** Calls /api/staff as the signed-in admin. Errors come back as BusinessError so the form can show them. */
async function callStaffApi(method: "POST" | "PATCH", body: unknown): Promise<{ invited?: boolean; linked?: boolean }> {
  const { data } = await getSupabaseBrowserClient().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new BusinessError("Your session has expired. Sign in again.");
  const res = await fetch("/api/staff", {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  }).catch(() => null);
  if (!res) throw new BusinessError("Can't reach the server. Check your internet connection.");
  const json = (await res.json().catch(() => ({}))) as { error?: string; field?: string; invited?: boolean; linked?: boolean };
  if (!res.ok) throw new BusinessError(json.error ?? "Could not save the staff account.", json.field);
  return json;
}

/**
 * Adds a staff member. With Supabase, their login and profile are created on the server first, then the
 * same profile (same id) is saved in this browser so the rest of the app can show it.
 */
export async function addStaff(me: User, values: UserInput, signIn: SignInSetup | null): Promise<{ invited: boolean }> {
  if (!supabaseConfigured || !signIn) {
    await dealerService.createUser(me, values);
    return { invited: false };
  }
  const id = newId();
  const res = await callStaffApi("POST", {
    ...values,
    id,
    signIn: signIn.mode === "password" ? signIn : { mode: "invite", redirectTo: `${window.location.origin}/login?reset=1` },
  });
  await dealerService.createUser(me, values, id);
  return { invited: !!res.invited };
}

/** Saves changes to a staff member: Supabase first (login and profile), then this browser's copy. */
export async function updateStaff(me: User, userId: ID, values: UserInput, newPassword?: string): Promise<void> {
  if (supabaseConfigured) await callStaffApi("PATCH", { ...values, id: userId, newPassword: newPassword || undefined });
  await dealerService.updateUser(me, userId, values);
}
