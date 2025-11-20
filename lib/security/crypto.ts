"use server"

import { createHash, randomBytes, createCipheriv, createDecipheriv } from "node:crypto"
import { env } from "@/lib/env"

const ALGORITHM = "aes-256-gcm"
const KEY = createHash("sha256").update(env.TOKEN_ENCRYPTION_KEY).digest()
const IV_LENGTH = 12 // GCM recommended 96-bit IV
const AUTH_TAG_LENGTH = 16

export function encryptSecret(plaintext: string) {
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, KEY, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const authTag = cipher.getAuthTag()
  return Buffer.concat([iv, authTag, encrypted]).toString("base64")
}

export function decryptSecret(payload?: string | null) {
  if (!payload) {
    return null
  }

  try {
    const buffer = Buffer.from(payload, "base64")
    if (buffer.length <= IV_LENGTH + AUTH_TAG_LENGTH) {
      return null
    }

    const iv = buffer.subarray(0, IV_LENGTH)
    const authTag = buffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH)
    const ciphertext = buffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH)

    const decipher = createDecipheriv(ALGORITHM, KEY, iv)
    decipher.setAuthTag(authTag)
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()])
    return decrypted.toString("utf8")
  } catch {
    return null
  }
}

