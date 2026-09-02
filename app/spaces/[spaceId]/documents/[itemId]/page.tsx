import { redirect } from "next/navigation"

import { SpaceDocumentViewer } from "@/components/space-document-viewer"
import { getSpaceItem } from "@/lib/actions/space-item"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import {
  isPdfSpaceDocument,
  isPlainTextSpaceDocument,
  storagePathFromUrl,
} from "@/lib/utils/space-storage"

export default async function SpaceDocumentPage({
  params,
}: {
  params: Promise<{ spaceId: string; itemId: string }>
}) {
  const { spaceId, itemId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  const { data: space } = await supabase.from("spaces").select("id, name").eq("id", spaceId).maybeSingle()
  if (!space) {
    redirect("/dashboard")
  }

  const { data: item } = await getSpaceItem(spaceId, itemId)
  if (!item) {
    redirect(`/spaces/${spaceId}`)
  }

  const payload = (item.payload ?? {}) as {
    title?: string
    summary?: string
    file_name?: string
    mime_type?: string
    file_url?: string
    full_text?: string
  }

  const title = payload.title || payload.file_name || "Untitled document"
  const fileUrl = payload.file_url || item.source_url
  const fileKind = { title, mimeType: payload.mime_type, fileName: payload.file_name }
  const isText = isPlainTextSpaceDocument(fileKind)
  const isPdf = isPdfSpaceDocument(fileKind)

  let pages: Array<{
    document_id: string
    page_number: number
    text_content: string
    text_items: unknown[]
    character_offsets: Record<number, number>
  }> = []

  if (isPdf && fileUrl) {
    const storagePath = storagePathFromUrl(fileUrl, spaceId)
    if (storagePath) {
      try {
        const adminClient = createAdminClient()
        const { data: blob, error } = await adminClient.storage.from("documents").download(storagePath)
        if (!error && blob) {
          const { extractPdfPages } = await import("@/lib/utils/pdf-extraction.server")
          const extractedPages = await extractPdfPages(await blob.arrayBuffer())
          pages = extractedPages.map((page) => ({
            document_id: itemId,
            page_number: page.pageNumber,
            text_content: page.textContent,
            text_items: page.textItems,
            character_offsets: page.characterOffsets,
          }))
        }
      } catch (error) {
        console.warn("[SpaceDocumentPage] Failed to hydrate PDF pages", error)
      }
    }
  } else if (isText && payload.full_text) {
    pages = [
      {
        document_id: itemId,
        page_number: 1,
        text_content: payload.full_text,
        text_items: [],
        character_offsets: {},
      },
    ]
  }

  return (
    <SpaceDocumentViewer
      spaceId={spaceId}
      spaceName={space.name}
      item={{
        id: item.id,
        title,
        summary: payload.summary,
        fileName: payload.file_name,
        mimeType: payload.mime_type,
        fileUrl,
        sourceUrl: item.source_url,
        fullText: payload.full_text,
      }}
      pages={pages}
      isTextDocument={isText}
    />
  )
}
