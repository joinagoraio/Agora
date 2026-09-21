import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { revalidatePath } from "next/cache"
import { applyRateLimitHeaders, checkRateLimit, uploadRateLimit, RateLimitStatus } from "@/lib/rate-limit"
import { requireAuthAndPermission } from "@/lib/middleware/authorization"
import { invalidateCacheByTag } from "@/lib/cache/api-cache"
import { getClientIdentifier } from "@/lib/utils/request"
import { createSafeErrorResponse } from "@/lib/utils/api-error-handler"
import { logger } from "@/lib/utils/logger"
import {
  stripMarkdown,
  withTimeout,
  generateDocumentSummary,
  sanitizeContentForDatabase,
  PARSER_TIMEOUT_MS,
} from "@/lib/documents/upload-helpers"
import { rebuildDocumentSectionsWithClient } from "@/lib/documents/rebuild-sections"
import { z } from "zod"

export const maxDuration = 120

const finalizeSchema = z.object({
  workspaceId: z.string().uuid(),
  path: z.string().min(1).max(500),
  originalName: z.string().min(1).max(255),
  classification: z.enum(["public", "internal", "confidential"]).default("internal"),
  size: z.number().int().positive(),
  mimeType: z.string().max(100),
})

export async function POST(req: NextRequest) {
  let rateLimitResult: RateLimitStatus | undefined
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const identifier = user?.id ?? getClientIdentifier(req.headers)
    const rateLimitKey = user ? `upload:user:${user.id}` : `upload:ip:${identifier}`
    const currentRateLimit = await checkRateLimit(uploadRateLimit, rateLimitKey)
    rateLimitResult = currentRateLimit
    const respondWithRateLimit = (res: NextResponse) =>
      applyRateLimitHeaders(res, rateLimitResult)

    if (!currentRateLimit.success) {
      return respondWithRateLimit(
        NextResponse.json({ error: "Upload rate limit exceeded." }, { status: 429 }),
      )
    }
    if (!user) {
      return respondWithRateLimit(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
    }

    const body = await req.json()
    const parsed = finalizeSchema.safeParse(body)
    if (!parsed.success) {
      return respondWithRateLimit(
        NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 }),
      )
    }

    const { workspaceId, path, originalName, classification, size, mimeType } = parsed.data

    if (!path.startsWith(`workspaces/${workspaceId}/`)) {
      return respondWithRateLimit(NextResponse.json({ error: "Invalid path for workspace" }, { status: 400 }))
    }

    try {
      await requireAuthAndPermission("workspace_item:create", { workspaceId })
    } catch {
      return respondWithRateLimit(NextResponse.json({ error: "Forbidden" }, { status: 403 }))
    }

    const adminClient = createAdminClient()

    const { data: workspaceRecord, error: workspaceError } = await supabase
      .from("workspaces")
      .select("id, space_id")
      .eq("id", workspaceId)
      .single()

    if (workspaceError || !workspaceRecord) {
      return respondWithRateLimit(NextResponse.json({ error: "Workspace not found" }, { status: 404 }))
    }

    let { data: source } = await adminClient
      .from("sources")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("type", "direct_upload")
      .maybeSingle()

    if (!source) {
      const { data: newSource, error: sourceError } = await adminClient
        .from("sources")
        .insert({
          workspace_id: workspaceId,
          name: "Direct Uploads",
          type: "direct_upload",
          config: {},
          created_by: user.id,
          status: "active",
        })
        .select()
        .single()
      if (sourceError || !newSource) {
        return respondWithRateLimit(
          NextResponse.json({ error: "Failed to create upload source" }, { status: 500 }),
        )
      }
      source = newSource
    }

    const { data: blob, error: downloadError } = await adminClient.storage
      .from("documents")
      .download(path)

    if (downloadError || !blob) {
      logger.error("[Upload Finalize] Download error:", downloadError)
      return respondWithRateLimit(
        NextResponse.json({ error: "File not found in storage" }, { status: 404 }),
      )
    }

    const arrayBuffer = await blob.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const fileName = path.split("/").pop() ?? path

    const { data: { publicUrl } } = adminClient.storage.from("documents").getPublicUrl(path)

    let content = ""
    const isMarkdown =
      mimeType === "text/markdown" ||
      originalName.toLowerCase().endsWith(".md") ||
      originalName.toLowerCase().endsWith(".markdown")

    if (mimeType === "text/plain" || mimeType === "text/markdown" || isMarkdown) {
      content = buffer.toString("utf-8")
    } else if (mimeType === "application/pdf") {
      try {
        const PDFParser = (await import("pdf2json")).default
        const pdfData = await withTimeout(
          new Promise<string>((resolve, reject) => {
            const pdfParser = new PDFParser(null, true)
            pdfParser.on("pdfParser_dataError", (err: unknown) => reject(new Error(String(err))))
            pdfParser.on("pdfParser_dataReady", () => {
              try {
                resolve(pdfParser.getRawTextContent() || "")
              } catch (e) {
                reject(e)
              }
            })
            pdfParser.parseBuffer(buffer)
          }),
          PARSER_TIMEOUT_MS,
          "PDF parsing timed out",
        )
        content = (pdfData || "").replace(/\\u(?![\da-fA-F]{4})/g, "u").replace(/\\(?![nrtbf\\'"xu0-7])/g, "")
      } catch (e) {
        logger.error("[Upload Finalize] PDF error:", e)
        content = `[Failed to extract PDF content: ${e instanceof Error ? e.message : "Unknown error"}]`
      }
    } else if (
      mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      originalName.toLowerCase().endsWith(".docx")
    ) {
      try {
        const mammoth = await import("mammoth")
        const result = await withTimeout(mammoth.extractRawText({ buffer }), PARSER_TIMEOUT_MS, "DOCX parsing timed out")
        content = result.value || ""
        if (!content.trim()) {
          content = "[Word document appears to be empty or contains only images/formatting that could not be extracted as text]"
        }
      } catch (e) {
        logger.error("[Upload Finalize] DOCX error:", e)
        content = `[Failed to extract Word document content: ${e instanceof Error ? e.message : "Unknown error"}]`
      }
    } else {
      content = "[Binary file - content extraction not available]"
    }

    const documentTitle = originalName
    const binaryFileMessage = "[Binary file - content extraction not available]"
    const isBinaryOrFailed =
      !content ||
      content.startsWith("[Failed") ||
      content.startsWith("[Binary") ||
      content.trim() === binaryFileMessage.trim()

    let documentSummary: string
    if (!isBinaryOrFailed && content.length > 100) {
      documentSummary = await generateDocumentSummary(content, documentTitle, isMarkdown)
    } else if (isBinaryOrFailed) {
      const ext = originalName.split(".").pop()?.toLowerCase() ?? "file"
      documentSummary = `File (${ext.toUpperCase()}). Content extraction not available for this file type.`
    } else {
      documentSummary = content.substring(0, 150).trim() + (content.length > 150 ? "..." : "")
      if (isMarkdown) documentSummary = stripMarkdown(documentSummary)
    }
    if (!documentSummary?.trim()) documentSummary = "Document uploaded. Content preview not available."

    const { data: document, error: docError } = await adminClient
      .from("documents")
      .insert({
        source_id: source!.id,
        workspace_id: workspaceId,
        tenant_id: workspaceRecord.space_id ?? null,
        external_id: fileName,
        title: documentTitle,
        content: sanitizeContentForDatabase(documentSummary),
        external_url: publicUrl,
        status: "active",
        classification,
        metadata: {
          filename: originalName,
          size,
          type: mimeType,
          uploaded_at: new Date().toISOString(),
        },
      })
      .select()
      .single()

    if (docError) {
      await adminClient.storage.from("documents").remove([path])
      logger.error("[Upload Finalize] Document insert error:", undefined, {
        message: docError.message,
        code: docError.code,
        details: docError.details,
        hint: docError.hint,
      })
      return respondWithRateLimit(
        NextResponse.json({ error: "Failed to create document record" }, { status: 500 }),
      )
    }

    const canStorePage =
      content &&
      content.trim() &&
      !content.startsWith("[Failed") &&
      !content.startsWith("[Binary")
    if (mimeType === "application/pdf" && canStorePage) {
      try {
        const lines = content.split("\n").filter((l) => l.trim())
        const pages: Array<{ document_id: string; page_number: number; text_content: string; text_items: unknown[]; character_offsets: Record<string, unknown> }> = []
        let currentPage = 1
        let currentPageText = ""
        for (const line of lines) {
          currentPageText += line + "\n"
          if (currentPageText.length > 50000) {
            pages.push({
              document_id: document.id,
              page_number: currentPage,
              text_content: sanitizeContentForDatabase(currentPageText),
              text_items: [],
              character_offsets: {},
            })
            currentPage++
            currentPageText = ""
          }
        }
        if (currentPageText.trim()) {
          pages.push({
            document_id: document.id,
            page_number: currentPage,
            text_content: sanitizeContentForDatabase(currentPageText),
            text_items: [],
            character_offsets: {},
          })
        }
        if (pages.length > 0) {
          await adminClient.from("document_pages").insert(pages)
          const sections = await rebuildDocumentSectionsWithClient(adminClient, document.id, workspaceId)
          if (sections.error) {
            logger.error("[Upload Finalize] Failed to rebuild document sections:", sections.error)
          }
        }
      } catch (e) {
        logger.error("[Upload Finalize] PDF pages error:", e)
      }
    } else if (
      (mimeType === "text/plain" || mimeType === "text/markdown" || isMarkdown || originalName.toLowerCase().endsWith(".txt")) &&
      canStorePage
    ) {
      await adminClient.from("document_pages").insert({
        document_id: document.id,
        page_number: 1,
        text_content: sanitizeContentForDatabase(content.substring(0, 100000)),
        text_items: [],
        character_offsets: {},
      })
      const sections = await rebuildDocumentSectionsWithClient(adminClient, document.id, workspaceId)
      if (sections.error) {
        logger.error("[Upload Finalize] Failed to rebuild document sections:", sections.error)
      }
    } else if (
      (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || originalName.toLowerCase().endsWith(".docx")) &&
      canStorePage
    ) {
      await adminClient.from("document_pages").insert({
        document_id: document.id,
        page_number: 1,
        text_content: sanitizeContentForDatabase(content.substring(0, 100000)),
        text_items: [],
        character_offsets: {},
      })
      const sections = await rebuildDocumentSectionsWithClient(adminClient, document.id, workspaceId)
      if (sections.error) {
        logger.error("[Upload Finalize] Failed to rebuild document sections:", sections.error)
      }
    }

    revalidatePath(`/workspaces/${workspaceId}`)
    await invalidateCacheByTag(`search:workspace:${workspaceId}`)
    return respondWithRateLimit(NextResponse.json({ data: document }))
  } catch (error) {
    logger.error("[Upload Finalize] Error:", error)
    const response = createSafeErrorResponse(error, "An error occurred during finalize.", 500)
    return rateLimitResult ? applyRateLimitHeaders(response, rateLimitResult) : response
  }
}
