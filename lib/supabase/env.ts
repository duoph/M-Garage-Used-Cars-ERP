/**
 * Supabase settings. The URL and publishable key are safe in the browser (row-level security protects
 * the data); the secret key is server-only and bypasses RLS. See .env.example.
 */
export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

/** False until the Supabase project's URL and publishable key are added to the environment. */
export const supabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);

export function assertSupabaseConfigured(): void {
  if (!supabaseConfigured)
    throw new Error("Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (see .env.example).");
}
