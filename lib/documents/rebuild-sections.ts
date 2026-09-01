import type { SupabaseClient } from "@supabase/supabase-js"
import { extractSectionsFromPages } from "@/lib/documents/section-extraction"

/**
 * Rebuild document_sections from document_pages using the provided client
 * (user or service-role). Best-effort: returns count or error.
 */
export async function rebuildDocumentSectionsWithClient(
  supabase: SupabaseClient,
  documentId: string,
  workspaceId: string,
): Promise<{ count: number; error?: string }> {
  const { data: pages, error: pagesError } = await supabase
    .from("document_pages")
    .select("page_number, text_content, text_items")
    .eq("document_id", documentId)
    .order("page_number", { ascending: true })

  if (pagesError) return { count: 0, error: pagesError.message }

  const extracted = extractSectionsFromPages(
    (pages || []).map((p) => ({
      pageNumber: p.page_number,
      textContent: p.text_content || "",
      textItems: Array.isArray(p.text_items) ? p.text_items : undefined,
    })),
  )

  await supabase.from("document_sections").delete().eq("document_id", documentId)

  if (extracted.length > 0) {
    const { error: insertError } = await supabase.from("document_sections").insert(
      extracted.map((s) => ({
        document_id: documentId,
        workspace_id: workspaceId,
        title: s.title,
        level: s.level,
        page_number: s.pageNumber,
        start_offset: s.startOffset,
        detection: s.detection,
      })),
    )
    if (insertError) return { count: 0, error: insertError.message }
  }

  return { count: extracted.length }
}
