import { decryptSecret, encryptSecret } from "@/lib/security/crypto"

export const GOOGLE_TOKEN_METADATA_KEY = "google_drive_tokens_enc"

export type GoogleTokenBundle = {
  accessToken: string
  refreshToken?: string | null
  expiresAt?: number | string | null
  storedAt?: string
}

export function encryptGoogleTokenBundle(bundle: GoogleTokenBundle) {
  return encryptSecret(JSON.stringify(bundle))
}

export function decryptGoogleTokenBundle(encrypted?: string | null): GoogleTokenBundle | null {
  const decrypted = decryptSecret(encrypted)
  if (!decrypted) {
    return null
  }

  try {
    return JSON.parse(decrypted)
  } catch (error) {
    console.error("[Google Tokens] Failed to parse decrypted payload:", error)
    return null
  }
}
