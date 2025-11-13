import { type NextRequest, NextResponse } from "next/server"

import { Buffer } from "node:buffer"

import { publishSpaceItem } from "@/lib/actions/space-item"
import { syncScopeDocumentToAllWorkspaces } from "@/lib/services/scope-documents"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ spaceId: string }> },
) {
  try {
    const { spaceId } = await params
    const supabase = await createClient()
    const adminClient = createAdminClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const formData = await req.formData()
    const file = formData.get("file") as File | null
    const title = (formData.get("title") as string | null) ?? undefined
    const classification =
      (formData.get("classification") as "public" | "internal" | "confidential" | null) ?? "public"
    const notes = ((formData.get("notes") as string | null) ?? "").trim()

    if (!file) {
      return NextResponse.json({ error: "File is required" }, { status: 400 })
    }

    // Upload to Supabase Storage in the shared documents bucket
    const extension = file.name.split(".").pop() ?? "bin"
    const storagePath = `spaces/${spaceId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${extension}`

    const { error: uploadError } = await adminClient.storage.from("documents").upload(storagePath, file, {
      cacheControl: "3600",
      upsert: false,
    })

    if (uploadError) {
      console.error("[SpaceUpload] Storage error:", uploadError)
      return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 })
    }

    const {
      data: { publicUrl },
    } = adminClient.storage.from("documents").getPublicUrl(storagePath)

    // Light-weight text extraction (reuse logic from workspace uploads)
    let extractedText = ""

    try {
      if (file.type === "text/plain" || file.type === "text/markdown") {
        extractedText = await file.text()
      } else if (file.type === "application/pdf") {
        const arrayBuffer = await file.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)
        const PDFParser = (await import("pdf2json")).default

        extractedText = await new Promise<string>((resolve, reject) => {
          const parser = new PDFParser(null, true)

          parser.on("pdfParser_dataError", (err: any) => reject(new Error(err.parserError)))
          parser.on("pdfParser_dataReady", () => {
            try {
              resolve(parser.getRawTextContent() || "")
            } catch (err) {
              reject(err)
            }
          })

          parser.parseBuffer(buffer)
        })
      }
    } catch (extractionError) {
      console.warn("[SpaceUpload] Extraction failed, continuing without full text:", extractionError)
    }

    // Trim overly long payload text
    const sanitizedFullText = sanitizeScopeContent(extractedText)
    const summary =
      notes.length > 0
        ? notes
        : sanitizedFullText && sanitizedFullText.length > 0
          ? sanitizedFullText.slice(0, 1200)
          : undefined

    const { data, error } = await publishSpaceItem(spaceId, {
      item_type: "document",
      classification,
      payload: {
        title: title || file.name,
        file_name: file.name,
        file_url: publicUrl,
        mime_type: file.type,
        summary,
        full_text: sanitizedFullText,
      },
      source_url: publicUrl,
    })

    if (error) {
      console.error("[SpaceUpload] Failed to create space item:", error)
      return NextResponse.json({ error }, { status: 400 })
    }

    // Replicate content to all workspaces in this space so the assistant can use full context
    try {
      await syncScopeDocumentToAllWorkspaces(spaceId, data)
    } catch (syncError) {
      console.error("[SpaceUpload] Failed to sync scope document to workspaces:", syncError)
    }

    return NextResponse.json({ data }, { status: 201 })
  } catch (error) {
    console.error("[SpaceUpload] Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

function sanitizeScopeContent(text: string): string {
  if (!text) return ""
  let sanitized = text.replace(/\u0000/g, "")
  sanitized = sanitized.replace(/\r\n/g, "\n")
  sanitized = sanitized.replace(/\r/g, "\n")
  sanitized = sanitized.replace(/\\u(?![\da-fA-F]{4})/g, "u")
  sanitized = sanitized.replace(/\\(?![nrtbf\\'"xu0-7])/g, "")
  return sanitized.trim()
}


