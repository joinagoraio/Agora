"use server"

import { createClient } from "@/lib/supabase/server"
import {
  decryptGoogleTokenBundle,
  encryptGoogleTokenBundle,
  GOOGLE_TOKEN_METADATA_KEY,
  type GoogleTokenBundle,
} from "@/lib/security/googleTokens"

export async function getGoogleTokens() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Unauthorized" }
  }

  const encryptedBundle = user.user_metadata?.[GOOGLE_TOKEN_METADATA_KEY]
  const tokenBundle = decryptGoogleTokenBundle(encryptedBundle)

  if (tokenBundle?.accessToken) {
    return {
      access_token: tokenBundle.accessToken,
      refresh_token: tokenBundle.refreshToken ?? null,
    }
  }

  const legacyAccessToken = user.user_metadata?.google_access_token
  if (legacyAccessToken) {
    const legacyBundle: GoogleTokenBundle = {
      accessToken: legacyAccessToken,
      refreshToken: user.user_metadata?.google_refresh_token ?? null,
      expiresAt: user.user_metadata?.google_token_expires_at ?? null,
      storedAt: new Date().toISOString(),
    }

    try {
      const encrypted = encryptGoogleTokenBundle(legacyBundle)
      await supabase.auth.updateUser({
        data: {
          [GOOGLE_TOKEN_METADATA_KEY]: encrypted,
          google_access_token: null,
          google_refresh_token: null,
          google_token_expires_at: null,
        },
      })
    } catch (error) {
      console.error("[Google Tokens] Failed to migrate legacy tokens:", error)
    }

    return {
      access_token: legacyAccessToken,
      refresh_token: legacyBundle.refreshToken ?? null,
    }
  }

  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (session?.provider_token) {
    return {
      access_token: session.provider_token,
      refresh_token: session.provider_refresh_token ?? null,
    }
  }

  return { error: "No Google tokens found" }
}

export async function refreshGoogleToken(refreshToken: string) {
  // Placeholder for future direct Google OAuth refresh integration
  return { error: refreshToken ? "Re-authentication required." : "Token refresh not available." }
}
