"use client";
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertSupabaseConfigured, supabasePublishableKey, supabaseUrl } from "./env";
import type { Database } from "./types";

let client: SupabaseClient<Database> | null = null;

/** Supabase client for Client Components. One instance per tab; auth state lives in cookies. */
export function getSupabaseBrowserClient(): SupabaseClient<Database> {
  assertSupabaseConfigured();
  client ??= createBrowserClient<Database>(supabaseUrl, supabasePublishableKey);
  return client;
}
