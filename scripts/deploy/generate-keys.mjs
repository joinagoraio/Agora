#!/usr/bin/env node
/**
 * Print production secrets for self-hosted Supabase + Agora.
 * Usage: node scripts/deploy/generate-keys.mjs
 */
import { createHmac, randomBytes } from "node:crypto"

function b64url(input) {
  return Buffer.from(input).toString("base64url")
}

function signJwt(payload, secret) {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }))
  const body = b64url(JSON.stringify(payload))
  const data = `${header}.${body}`
  const sig = createHmac("sha256", secret).update(data).digest("base64url")
  return `${data}.${sig}`
}

const jwtSecret = randomBytes(40).toString("base64url")
const now = Math.floor(Date.now() / 1000)
const exp = now + 60 * 60 * 24 * 365 * 10
const anon = signJwt({ role: "anon", iss: "supabase", iat: now, exp }, jwtSecret)
const service = signJwt({ role: "service_role", iss: "supabase", iat: now, exp }, jwtSecret)
const tokenKey = randomBytes(32).toString("hex")

console.log("# --- infrastructure/supabase/.env ---")
console.log(`POSTGRES_PASSWORD=${randomBytes(24).toString("base64url")}`)
console.log(`JWT_SECRET=${jwtSecret}`)
console.log(`ANON_KEY=${anon}`)
console.log(`SERVICE_ROLE_KEY=${service}`)
console.log(`DASHBOARD_PASSWORD=${randomBytes(18).toString("base64url")}`)
console.log(`SECRET_KEY_BASE=${randomBytes(48).toString("base64")}`)
console.log(`VAULT_ENC_KEY=${randomBytes(24).toString("base64url").slice(0, 32)}`)
console.log(`PG_META_CRYPTO_KEY=${randomBytes(24).toString("base64url").slice(0, 32)}`)
console.log(`LOGFLARE_PUBLIC_ACCESS_TOKEN=${randomBytes(24).toString("base64url")}`)
console.log(`LOGFLARE_PRIVATE_ACCESS_TOKEN=${randomBytes(24).toString("base64url")}`)
console.log("")
console.log("# --- .env.production (same JWT keys as above) ---")
console.log(`NEXT_PUBLIC_SUPABASE_ANON_KEY=${anon}`)
console.log(`SUPABASE_SERVICE_ROLE_KEY=${service}`)
console.log(`TOKEN_ENCRYPTION_KEY=${tokenKey}`)
