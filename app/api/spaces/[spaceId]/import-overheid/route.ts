import { randomUUID } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"

import { publishSpaceItem } from "@/lib/actions/space-item"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { cleanOverheidDescription } from "@/lib/utils"
import { assertUUIDParam } from "@/lib/utils/param-validation"

export const runtime = "nodejs"

type OverheidDocumentPayload = {
  title?: string
  identifier?: string
  type?: string
  date?: string
  description?: string
  url?: string
  classification?: "public" | "internal" | "confidential"
}

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36"

const PDF_MIME_TYPES = new Set(["application/pdf", "application/x-pdf"])

function sanitizeScopeContent(text: string): string {
  if (!text) return ""
  let sanitized = text.replace(/\u0000/g, "")
  sanitized = sanitized.replace(/\r\n/g, "\n")
  sanitized = sanitized.replace(/\r/g, "\n")
  sanitized = sanitized.replace(/\\u(?![\da-fA-F]{4})/g, "u")
  sanitized = sanitized.replace(/\\(?![nrtbf\\'"xu0-7])/g, "")
  return sanitized.trim()
}

function inferFileExtension(mimeType: string | null, url?: string | null) {
  if (mimeType) {
    if (mimeType.includes("pdf")) return "pdf"
    if (mimeType.includes("html")) return "html"
    if (mimeType.includes("text/plain")) return "txt"
  }
  if (url) {
    const match = url.match(/\.([a-z0-9]+)(?:\?|$)/i)
    if (match) {
      return match[1].toLowerCase()
    }
  }
  return "pdf"
}

async function extractTextFromBuffer(buffer: Buffer, mimeType: string, fileExtension: string): Promise<string> {
  try {
    if (PDF_MIME_TYPES.has(mimeType.toLowerCase()) || fileExtension === "pdf") {
      const PDFParser = (await import("pdf2json")).default
      return await new Promise<string>((resolve, reject) => {
        const parser = new PDFParser(null, true)
        parser.on("pdfParser_dataError", (err: any) => reject(new Error(err.parserError)))
        parser.on("pdfParser_dataReady", () => {
          try {
            resolve(parser.getRawTextContent() || "")
          } catch (error) {
            reject(error)
          }
        })
        parser.parseBuffer(buffer)
      })
    }

    if (mimeType.startsWith("text/") || ["txt", "md", "html"].includes(fileExtension)) {
      return buffer.toString("utf-8")
    }
  } catch (error) {
    console.warn("[ImportOverheid] Failed to extract text:", error)
  }
  return ""
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ spaceId: string }> },
) {
  try {
    const rawParams = await params
    const spaceId = assertUUIDParam(rawParams.spaceId, "spaceId")

    const body: OverheidDocumentPayload = await req.json()
    if (!body.url || !body.title) {
      return NextResponse.json({ error: "Title and URL are required" }, { status: 400 })
    }

    const supabase = await createClient()
    const adminClient = createAdminClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    let uploadedFileUrl: string | null = null
    let uploadedFileName: string | null = null
    let mimeType = "application/pdf"
    let fileExtension = "pdf"
    let extractedText = ""

    try {
      const remoteResponse = await fetch(body.url, {
        headers: { "User-Agent": USER_AGENT },
      })

      if (remoteResponse.ok) {
        mimeType = remoteResponse.headers.get("content-type") || mimeType
        const isHtmlContent = mimeType.toLowerCase().includes("html")

        if (isHtmlContent) {
          // For HTML pages, skip uploading raw HTML; we'll link out to the source URL instead.
          uploadedFileUrl = null
          uploadedFileName = null
          extractedText = ""
        } else {
          fileExtension = inferFileExtension(mimeType, body.url)
          const arrayBuffer = await remoteResponse.arrayBuffer()
          const buffer = Buffer.from(arrayBuffer)

          const storagePath = `spaces/${spaceId}/${Date.now()}_${randomUUID()}.${fileExtension}`
          const uploadResult = await adminClient.storage.from("documents").upload(storagePath, buffer, {
            cacheControl: "3600",
            upsert: false,
            contentType: mimeType,
          })

          if (!uploadResult.error) {
            const {
              data: { publicUrl },
            } = adminClient.storage.from("documents").getPublicUrl(storagePath)
            uploadedFileUrl = publicUrl
            uploadedFileName = storagePath.split("/").pop() || `overheid-document.${fileExtension}`
          } else {
            console.error("[ImportOverheid] Storage upload failed:", uploadResult.error)
          }

          extractedText = await extractTextFromBuffer(buffer, mimeType, fileExtension)
        }
      } else {
        console.warn("[ImportOverheid] Remote fetch failed:", body.url, remoteResponse.status)
      }
    } catch (error) {
      console.error("[ImportOverheid] Error downloading document:", error)
    }

    const cleanedDescription = cleanOverheidDescription(body.description)
    const sanitizedFullText = sanitizeScopeContent(extractedText)
    const summary =
      cleanedDescription ||
      (sanitizedFullText && sanitizedFullText.length > 0 ? sanitizedFullText.slice(0, 1200) : undefined)

    const payload: Record<string, any> = {
      title: body.title,
      summary,
      identifier: body.identifier,
      document_type: body.type,
      source: "Overheid.nl",
      date: body.date,
      mime_type: mimeType,
      ...(uploadedFileUrl ? { file_url: uploadedFileUrl, file_name: uploadedFileName } : {}),
      ...(sanitizedFullText ? { full_text: sanitizedFullText } : {}),
    }

    const classification = body.classification || "public"
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    const sourceDocId =
      body.identifier && uuidRegex.test(body.identifier) ? body.identifier : undefined

    const { data, error } = await publishSpaceItem(spaceId, {
      item_type: "document",
      classification,
      payload,
      source_url: body.url,
      ...(sourceDocId ? { source_doc_id: sourceDocId } : {}),
    })

    if (error) {
      return NextResponse.json({ error }, { status: 400 })
    }

    return NextResponse.json({ data }, { status: 201 })
  } catch (error) {
    console.error("[ImportOverheid] Unexpected error:", error)
    return NextResponse.json({ error: "Failed to import document" }, { status: 500 })
  }
}

