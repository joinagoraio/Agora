import { z } from "zod"

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

