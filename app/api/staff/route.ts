import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/supabase/env";
import { can, normalizeAccess, type Permission } from "@/lib/permissions";
import { userSchema } from "@/lib/validation/schemas";
import type { Role } from "@/types";

/**
 * Staff sign-in accounts. Creating or changing a login needs the Supabase secret key, so it happens here
 * on the server, never in the browser. Every request must carry the caller's Supabase access token, and
 * the caller must be an active staff member with the "users.manage" permission.
 */

const MIN_PASSWORD = 8;
/** Supabase has no "disable" flag; a very long ban blocks sign-in until it is lifted. */
const BLOCKED = "876000h";

const createSchema = userSchema.extend({
  id: z.string().uuid(),
  signIn: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("password"), password: z.string().min(MIN_PASSWORD, `Password must be at least ${MIN_PASSWORD} characters`).max(72) }),
    z.object({ mode: z.literal("invite"), redirectTo: z.string().url() }),
  ]),
});

const updateSchema = userSchema.extend({
  // Browser-only profiles from before Supabase have ids like "u-owner"; they are accepted and skipped.
  id: z.string().min(1),
  newPassword: z.string().min(MIN_PASSWORD, `Password must be at least ${MIN_PASSWORD} characters`).max(72).optional(),
});

interface StaffRow {
  id: string;
  auth_user_id: string | null;
  email: string;
  role: Role;
  status: "active" | "inactive";
  permissions: string[] | null;
}

class HttpError extends Error {
  constructor(public status: number, message: string, public field?: string) {
    super(message);
  }
}

const fail = (e: unknown) => {
  if (e instanceof HttpError) return NextResponse.json({ error: e.message, field: e.field }, { status: e.status });
  console.error("Staff API failed", e);
  return NextResponse.json({ error: "Could not save the staff account. Try again." }, { status: 500 });
};

/** The signed-in staff member making the request, who must be allowed to manage staff. */
async function requireStaffManager(request: Request): Promise<StaffRow> {
  if (!supabaseConfigured || !process.env.SUPABASE_SECRET_KEY) throw new HttpError(503, "Supabase is not configured on the server.");
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new HttpError(401, "Sign in again to manage staff.");
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "Your session has expired. Sign in again.");
  const { data: me } = await admin.from("users").select("id, auth_user_id, email, role, status, permissions").eq("auth_user_id", data.user.id).maybeSingle<StaffRow>();
  if (!me || me.status !== "active") throw new HttpError(403, "Your staff account is not active.");
  if (!can({ role: me.role, permissions: me.permissions }, "users.manage")) throw new HttpError(403, "You don't have permission to manage staff.");
  return me;
}

function friendlyAuthError(message: string): HttpError {
  const m = message.toLowerCase();
  if (m.includes("already") && (m.includes("registered") || m.includes("exists")))
    return new HttpError(409, "A sign-in account with this email already exists.", "email");
  if (m.includes("password")) return new HttpError(400, message, "password");
  if (m.includes("rate limit")) return new HttpError(429, "Supabase's email limit was reached. Set a password instead, or try again later.");
  return new HttpError(400, message);
}

function profileColumns(input: z.infer<typeof userSchema>) {
  return {
    name: input.name,
    email: input.email,
    phone: input.phone ?? "",
    role: input.role,
    status: input.status,
    designation: input.designation || null,
    permissions: normalizeAccess(input.role, (input.permissions ?? null) as Permission[] | null),
    // Branches still live in this browser only, so branch_id is left for the data migration.
    all_branches: input.allBranches ?? null,
  };
}

/** Add a staff member: a Supabase login (password or email invite) plus their profile row. */
export async function POST(request: Request) {
  try {
    await requireStaffManager(request);
    const parsed = createSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new HttpError(400, issue?.message ?? "Invalid request", issue?.path.at(-1)?.toString());
    }
    const input = parsed.data;
    const admin = getSupabaseAdminClient();

    const { data: clash } = await admin.from("users").select("id").eq("email", input.email).maybeSingle();
    if (clash) throw new HttpError(409, "A user with this email already exists.", "email");

    const meta = { data: { name: input.name } };
    const created =
      input.signIn.mode === "password"
        ? await admin.auth.admin.createUser({ email: input.email, password: input.signIn.password, email_confirm: true, user_metadata: meta.data })
        : await admin.auth.admin.inviteUserByEmail(input.email, { ...meta, redirectTo: input.signIn.redirectTo });
    if (created.error || !created.data.user) throw friendlyAuthError(created.error?.message ?? "Could not create the login.");
    const authUser = created.data.user;

    if (input.status === "inactive") await admin.auth.admin.updateUserById(authUser.id, { ban_duration: BLOCKED });

    const { error } = await admin.from("users").insert({ id: input.id, auth_user_id: authUser.id, ...profileColumns(input) });
    if (error) {
      // Don't leave a login behind without a profile.
      await admin.auth.admin.deleteUser(authUser.id).catch(() => undefined);
      throw new HttpError(500, `Could not save the profile: ${error.message}`);
    }
    return NextResponse.json({ id: input.id, invited: input.signIn.mode === "invite" }, { status: 201 });
  } catch (e) {
    return fail(e);
  }
}

/** Update a staff member's profile, and keep their login in step (email, password, blocked when inactive). */
export async function PATCH(request: Request) {
  try {
    const me = await requireStaffManager(request);
    const parsed = updateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new HttpError(400, issue?.message ?? "Invalid request", issue?.path.at(-1)?.toString());
    }
    const input = parsed.data;
    const admin = getSupabaseAdminClient();
    if (!z.string().uuid().safeParse(input.id).success) {
      if (input.newPassword) throw new HttpError(400, "This profile has no sign-in account to set a password on.", "newPassword");
      return NextResponse.json({ linked: false });
    }

    const { data: target } = await admin.from("users").select("id, auth_user_id, email, role, status, permissions").eq("id", input.id).maybeSingle<StaffRow>();
    // Profiles that only exist in this browser (made before Supabase was connected) have nothing to sync.
    if (!target) return NextResponse.json({ linked: false });

    if (target.id === me.id && input.status !== "active") throw new HttpError(400, "You cannot deactivate your own account.", "status");
    const losesAdmin = target.role === "admin" && target.status === "active" && (input.role !== "admin" || input.status !== "active");
    if (losesAdmin) {
      const { count } = await admin.from("users").select("id", { count: "exact", head: true }).eq("role", "admin").eq("status", "active");
      if ((count ?? 0) <= 1) throw new HttpError(400, "At least one active Admin / Owner account is required.");
    }
    if (input.email !== target.email) {
      const { data: clash } = await admin.from("users").select("id").eq("email", input.email).neq("id", input.id).maybeSingle();
      if (clash) throw new HttpError(409, "A user with this email already exists.", "email");
    }

    if (target.auth_user_id) {
      const changes: { email?: string; email_confirm?: boolean; password?: string; ban_duration?: string } = {};
      if (input.email !== target.email) Object.assign(changes, { email: input.email, email_confirm: true });
      if (input.newPassword) changes.password = input.newPassword;
      if (input.status !== target.status) changes.ban_duration = input.status === "active" ? "none" : BLOCKED;
      if (Object.keys(changes).length) {
        const { error } = await admin.auth.admin.updateUserById(target.auth_user_id, changes);
        if (error) throw friendlyAuthError(error.message);
      }
      // The ban stops new sign-ins and session refreshes; row-level security checks status = 'active' on
      // every request, so a deactivated person loses access to the data immediately.
    } else if (input.newPassword) {
      throw new HttpError(400, "This profile has no sign-in account to set a password on.", "newPassword");
    }

    const { error } = await admin.from("users").update(profileColumns(input)).eq("id", input.id);
    if (error) throw new HttpError(500, `Could not save the profile: ${error.message}`);
    return NextResponse.json({ linked: true });
  } catch (e) {
    return fail(e);
  }
}
