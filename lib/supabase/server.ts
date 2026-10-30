import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { assertSupabaseConfigured, supabasePublishableKey, supabaseUrl } from "./env";
import type { Database } from "./types";

/**
 * Supabase client for Server Components, Server Functions and Route Handlers, acting as the signed-in
 * user (their session cookie), so row-level security applies. Create one per request.
 */
export async function getSupabaseServerClient(): Promise<SupabaseClient<Database>> {
  assertSupabaseConfigured();
  const cookieStore = await cookies();
  return createServerClient<Database>(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Server Components can't set cookies; refreshing the session is left to Proxy or a Route Handler.
        }
      },
    },
  });
}

/**
 * Admin client using the secret key: bypasses row-level security. Server-only, for trusted jobs such as
 * staff invitations; never use it to answer a request without checking the caller's role first.
 */
export function getSupabaseAdminClient(): SupabaseClient<Database> {
  assertSupabaseConfigured();
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) throw new Error("SUPABASE_SECRET_KEY is not set (see .env.example).");
  return createClient<Database>(supabaseUrl, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
}
