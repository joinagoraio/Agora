import { z } from "zod"
import JSZip from "jszip"

export const documentUploadSchema = z.object({
  workspaceId: z.string().uuid("workspaceId must be a valid UUID"),
  file: z.instanceof(File, { message: "file must be a File object" })
    .refine((file) => file.size <= 50_000_000, {
      message: "File must be less than 50MB",
    })
    .refine((file) => [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
      "text/markdown",
    ].includes(file.type), {
      message: "Invalid file type. Allowed: PDF, Word, plain text, or markdown",
    }),
  classification: z.enum(["public", "internal", "confidential"]).default("public"),
  title: z.string().max(500).optional().nullable(),
})

export const chatMessageSchema = z.object({
  message: z.string().min(1, "Message cannot be empty").max(10000, "Message too long"),
  conversationId: z.string().uuid("conversationId must be a valid UUID").optional(),
  workspaceId: z.string().uuid("workspaceId must be a valid UUID"),
  excludedDocumentIds: z.array(z.string().uuid()).default([]),
  excludedNoteIds: z.array(z.string().uuid()).default([]),
  excludedEvidenceIds: z.array(z.string().uuid()).default([]),
})

export const searchQuerySchema = z.object({
  workspaceId: z.string().uuid("workspaceId must be a valid UUID"),
  query: z.string().min(1, "Query cannot be empty").max(500, "Query too long"),
  domain: z.string().max(100).optional(),
  municipality: z.string().max(100).optional(),
  year: z.string().regex(/^\d{4}$/, "Year must be 4 digits").optional(),
  classification: z.enum(["public", "internal", "confidential"]).optional(),
  layer: z.string().max(50).optional(),
})

export const overheidIntelligentSearchSchema = z.object({
  context: z.string().min(1, "Context is required").max(5000, "Context too long"),
  location: z.string().max(200).optional(),
  customQueries: z.array(z.string().max(200)).optional(),
})

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
const MAX_DECOMPRESSION_RATIO = 100
const MAX_UNCOMPRESSED_DOCUMENT_BYTES = 500 * 1024 * 1024

export type DocumentSafetyContext = {
  docxArrayBuffer?: ArrayBuffer
}

export async function validateDocumentSafety(file: File): Promise<DocumentSafetyContext> {
  if (file.type !== DOCX_MIME) {
    return {}
  }

  const arrayBuffer = await file.arrayBuffer()
  await ensureDocxIsNotZipBomb(arrayBuffer, file.size)
  return { docxArrayBuffer: arrayBuffer }
}

async function ensureDocxIsNotZipBomb(arrayBuffer: ArrayBuffer, compressedSize: number) {
  const zip = await JSZip.loadAsync(arrayBuffer, { checkCRC32: true })
  const entries = Object.values(zip.files)
  let totalUncompressedBytes = 0

  for (const entry of entries) {
    if (entry.dir) continue
    const content = await entry.async("uint8array")
    totalUncompressedBytes += content.byteLength

    if (totalUncompressedBytes > MAX_UNCOMPRESSED_DOCUMENT_BYTES) {
      throw new Error("Document expands beyond the allowed limit. Please upload a smaller file.")
    }
  }

  const compressionRatio = totalUncompressedBytes / Math.max(1, compressedSize)
  if (compressionRatio > MAX_DECOMPRESSION_RATIO) {
    throw new Error("Document appears to be a compression bomb and was rejected.")
  }
}

