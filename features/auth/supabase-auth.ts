"use client";
import { getDb } from "@/lib/db/database";
import { MAIN_BRANCH_ID } from "@/lib/db/migrate";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { supabaseConfigured } from "@/lib/supabase/env";
import { useSessionStore } from "@/lib/store/session";
import type { User } from "@/types";

/** A row of the Supabase `users` table (snake_case, see supabase/migrations/0001_initial_schema.sql). */
interface StaffRow {
  id: string;
  auth_user_id: string | null;
  name: string;
  email: string;
  phone: string;
  role: User["role"];
  status: User["status"];
  designation: string | null;
  permissions: string[] | null;
  all_branches: boolean | null;
  created_at: string;
  updated_at: string;
}

export class SignInError extends Error {}

/** Loads the staff profile linked to a Supabase login, or null when none is linked. */
async function loadStaffProfile(authUserId: string): Promise<StaffRow | null> {
  const { data, error } = await getSupabaseBrowserClient()
    .from("users")
    .select("id, auth_user_id, name, email, phone, role, status, designation, permissions, all_branches, created_at, updated_at")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (error) throw new SignInError(`Could not load your staff profile: ${error.message}`);
  return data as StaffRow | null;
}

/**
 * Copies the Supabase profile into this browser's database so screens that look staff up locally
 * (names on records, permissions, branch scope) keep working until the data itself moves to Supabase.
 * Branches are not synced yet, so the profile is placed on the local main branch.
 */
async function cacheProfileLocally(row: StaffRow): Promise<void> {
  const db = getDb();
  const existing = await db.users.get(row.id);
  const user: User = {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    role: row.role,
    status: row.status,
    designation: row.designation ?? undefined,
    permissions: row.permissions,
    branchId: existing?.branchId ?? MAIN_BRANCH_ID,
    allBranches: row.all_branches,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  await db.users.put(user);
}

function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "Incorrect email or password.";
  if (m.includes("email not confirmed")) return "This email hasn't been confirmed yet. Ask the admin to confirm it in Supabase.";
  if (m.includes("rate limit") || m.includes("too many")) return "Too many attempts. Wait a minute and try again.";
  if (m.includes("fetch") || m.includes("network")) return "Can't reach the server. Check your internet connection.";
  return message;
}

/** Email + password sign-in. Throws SignInError with a message fit to show on the login screen. */
export async function signInWithEmail(email: string, password: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error || !data.user) throw new SignInError(friendlyAuthError(error?.message ?? "Sign-in failed."));

  try {
    const profile = await loadStaffProfile(data.user.id);
    if (!profile) throw new SignInError("This login isn't linked to a staff account yet. Ask the admin to add you.");
    if (profile.status !== "active") throw new SignInError("This staff account is inactive. Ask the admin to re-activate it.");
    await cacheProfileLocally(profile);
    useSessionStore.getState().signIn(profile.id, data.user.id);
  } catch (e) {
    await supabase.auth.signOut();
    throw e instanceof SignInError ? e : new SignInError(e instanceof Error ? e.message : "Sign-in failed.");
  }
}

/** Ends the Supabase session (when configured) and forgets the local profile. */
export async function signOutEverywhere(): Promise<void> {
  useSessionStore.getState().signOut();
  if (supabaseConfigured) await getSupabaseBrowserClient().auth.signOut().catch(() => undefined);
}

/** Sends a password-reset email that returns the user to /login?reset=1. */
export async function sendPasswordReset(email: string): Promise<void> {
  const { error } = await getSupabaseBrowserClient().auth.resetPasswordForEmail(email.trim(), {
    redirectTo: `${window.location.origin}/login?reset=1`,
  });
  if (error) throw new SignInError(friendlyAuthError(error.message));
}

/** Sets a new password for the user who arrived from a reset email. */
export async function updatePassword(password: string): Promise<void> {
  const { error } = await getSupabaseBrowserClient().auth.updateUser({ password });
  if (error) throw new SignInError(friendlyAuthError(error.message));
}
