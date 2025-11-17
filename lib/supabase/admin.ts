import { createClient } from "@supabase/supabase-js"
import { env } from "@/lib/env"

// Admin client that bypasses RLS using service role key
export function createAdminClient() {
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
