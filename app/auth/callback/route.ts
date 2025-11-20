import { createClient } from "@/lib/supabase/server"
import { encryptGoogleTokenBundle, GOOGLE_TOKEN_METADATA_KEY } from "@/lib/security/googleTokens"
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
        const encryptedBundle = encryptGoogleTokenBundle({
          accessToken: data.session.provider_token,
          refreshToken: data.session.provider_refresh_token,
          expiresAt: data.session.expires_at,
          storedAt: new Date().toISOString(),
        })

        const { error: updateError } = await supabase.auth.updateUser({
          data: {
            [GOOGLE_TOKEN_METADATA_KEY]: encryptedBundle,
            google_access_token: null,
            google_refresh_token: null,
            google_token_expires_at: null,
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
