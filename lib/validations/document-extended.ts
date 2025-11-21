// Extended document validation schema with more file types
// Use this if you need to support images, Excel, etc.

import { z } from "zod"

export const extendedDocumentUploadSchema = z.object({
  workspaceId: z.string().uuid("workspaceId must be a valid UUID"),
  file: z.instanceof(File, { message: "file must be a File object" })
    .refine((file) => file.size <= 50_000_000, {
      message: "File must be less than 50MB",
    })
    .refine((file) => {
      const allowedTypes = [
        // Documents
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
        "application/msword", // .doc (legacy)
        "text/plain",
        "text/markdown",
        
        // Spreadsheets
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
        "application/vnd.ms-excel", // .xls (legacy)
        "text/csv",
        
        // Presentations
        "application/vnd.openxmlformats-officedocument.presentationml.presentation", // .pptx
        "application/vnd.ms-powerpoint", // .ppt (legacy)
        
        // Images
        "image/jpeg",
        "image/png",
        "image/gif",
        "image/webp",
        "image/svg+xml",
        
        // Archives (if needed)
        "application/zip",
        "application/x-rar-compressed",
      ]
      
      return allowedTypes.includes(file.type)
    }, {
      message: "Invalid file type. See documentation for supported formats.",
    }),
  classification: z.enum(["public", "internal", "confidential"]).default("public"),
  title: z.string().max(500).optional().nullable(),
})

