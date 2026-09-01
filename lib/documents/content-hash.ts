import { createHash } from "node:crypto"

/** SHA-256 hex digest for document dedup (server-only). */
export function hashDocumentContent(text: string): string {
  return createHash("sha256").update(text).digest("hex")
}
