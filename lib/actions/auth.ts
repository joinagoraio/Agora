"use server"

import { createClient } from "@/lib/supabase/server"

export async function getGoogleTokens() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  
  if (!user) {
    return { error: "Unauthorized" }
  }

  // Try to get tokens from user metadata first
  const googleAccessToken = user.user_metadata?.google_access_token
  const googleRefreshToken = user.user_metadata?.google_refresh_token

  if (googleAccessToken) {
    return {
      access_token: googleAccessToken,
      refresh_token: googleRefreshToken,
    }
  }

  // If not in metadata, try to get from session
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (session?.provider_token) {
    return {
      access_token: session.provider_token,
      refresh_token: session.provider_refresh_token,
    }
  }

  return { error: "No Google tokens found" }
}

export async function refreshGoogleToken(refreshToken: string) {
  // This would need to be implemented using Google OAuth2 API
  // For now, we'll return an error and let the user re-authenticate
  return { error: "Token refresh not implemented. Please re-authenticate with Google." }
}

