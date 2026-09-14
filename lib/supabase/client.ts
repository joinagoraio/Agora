import { createBrowserClient } from "@supabase/ssr"

import { resolveBrowserSupabaseUrl } from "@/lib/supabase/public-url"

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing Supabase environment variables. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local (local) or .env.production (Hetzner).",
    )
  }

  return createBrowserClient(resolveBrowserSupabaseUrl(supabaseUrl), supabaseAnonKey)
}
