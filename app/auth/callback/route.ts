import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get("code")
  const next = requestUrl.searchParams.get("next") || "/dashboard"

  if (code) {
    const supabase = await createClient()
    
    // Exchange code for session
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (error) {
      console.error("Error exchanging code for session:", error)
      return NextResponse.redirect(
        new URL(`/auth/login?error=${encodeURIComponent(error.message)}`, requestUrl.origin)
      )
    }

    // Store Google OAuth tokens if available
    if (data.session?.provider_token && data.session?.provider_refresh_token) {
      try {
        console.log("[Auth Callback] Storing Google tokens in user metadata")
        // Update user metadata with Google tokens
        const { error: updateError } = await supabase.auth.updateUser({
          data: {
            google_access_token: data.session.provider_token,
            google_refresh_token: data.session.provider_refresh_token,
            google_token_expires_at: data.session.expires_at?.toString(),
          },
        })

        if (updateError) {
          console.error("Error storing Google tokens:", updateError)
          // Continue anyway - tokens might be available in session
        } else {
          console.log("[Auth Callback] Successfully stored Google tokens")
        }
      } catch (err) {
        console.error("Error updating user metadata:", err)
        // Continue anyway
      }
    } else {
      console.warn("[Auth Callback] No provider tokens found in session", {
        hasProviderToken: !!data.session?.provider_token,
        hasRefreshToken: !!data.session?.provider_refresh_token,
      })
    }

    return NextResponse.redirect(new URL(next, requestUrl.origin))
  }

  return NextResponse.redirect(new URL("/auth/login", requestUrl.origin))
}
