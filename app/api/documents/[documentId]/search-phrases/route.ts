import { createClient } from "@/lib/supabase/server"
import { findTextSpan, getHighlightCoordinates } from "@/lib/utils/pdf-extraction"
import { NextRequest, NextResponse } from "next/server"

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ documentId: string }> }
) {
  try {
    const { documentId } = await context.params
    const { phrases } = await req.json()

    if (!Array.isArray(phrases) || phrases.length === 0) {
      return NextResponse.json({ error: "phrases array is required" }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Fetch document to verify access
    const { data: document, error: docError } = await supabase
      .from("documents")
      .select("id, workspace_id, metadata, title")
      .eq("id", documentId)
      .single()

    if (docError || !document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 })
    }

    // Fetch document pages
    const { data: pages, error: pagesError } = await supabase
      .from("document_pages")
      .select("*")
      .eq("document_id", documentId)
      .order("page_number", { ascending: true })

    if (pagesError) {
      console.error("[search-phrases] Error fetching pages:", pagesError)
      return NextResponse.json({ error: "Failed to fetch document pages" }, { status: 500 })
    }

    // Check if document is text/markdown
    const documentType = (document.metadata as Record<string, any>)?.type || ""
    const isTextDocument =
      documentType.includes("text") ||
      documentType.includes("markdown") ||
      document.title?.toLowerCase().endsWith(".md") ||
      document.title?.toLowerCase().endsWith(".txt")

    const highlights: any[] = []

    // Search for each phrase in the document
    for (const phrase of phrases) {
      if (!phrase || typeof phrase !== "string" || phrase.trim().length < 3) {
        continue
      }

      const trimmedPhrase = phrase.trim()
      
      // Try multiple search strategies for better matching
      // Strategy 1: Exact match (case-insensitive)
      // Strategy 2: Match without punctuation
      // Strategy 3: Match first significant words (if phrase is long)
      const searchVariants = [
        trimmedPhrase, // Exact phrase
        trimmedPhrase.replace(/[.,!?;:]/g, ""), // Without punctuation
      ]
      
      // If phrase is long, also try matching just the key part
      if (trimmedPhrase.length > 50) {
        // Extract key part (first 30-50 chars or up to first comma/period)
        const keyPart = trimmedPhrase.split(/[.,]/)[0].trim()
        if (keyPart.length >= 20 && keyPart.length < trimmedPhrase.length) {
          searchVariants.push(keyPart)
        }
      }

      let found = false
      
      if (isTextDocument && pages && pages.length > 0) {
        // For text documents, search in the first page (or aggregate all pages)
        const fullText = pages.map((p) => p.text_content || "").join("\n")
        
        for (const searchVariant of searchVariants) {
          const textSpan = findTextSpan(fullText, searchVariant)
          if (textSpan) {
            console.log(`[search-phrases] Found match for phrase "${trimmedPhrase}" using variant "${searchVariant}"`)
            highlights.push({
              id: `highlight-${documentId}-1-${highlights.length}`,
              pageNumber: 1,
              textSpan,
              color: "rgba(255, 255, 0, 0.3)",
            })
            found = true
            break
          }
        }
      } else if (pages && pages.length > 0) {
        // For PDFs, search in each page
        for (const page of pages) {
          const textContent = page.text_content || ""
          
          for (const searchVariant of searchVariants) {
            const textSpan = findTextSpan(textContent, searchVariant)
            if (textSpan) {
              console.log(`[search-phrases] Found match for phrase "${trimmedPhrase}" using variant "${searchVariant}" on page ${page.page_number}`)
              
              // Compute coordinates for PDF highlights
              const textItems = (page.text_items as any[]) || []
              const characterOffsets = (page.character_offsets as Record<number, number>) || {}
              const coordinates = getHighlightCoordinates(textSpan, textItems, characterOffsets)
              
              highlights.push({
                id: `highlight-${documentId}-${page.page_number}-${highlights.length}`,
                pageNumber: page.page_number,
                textSpan,
                coordinates,
                color: "rgba(255, 255, 0, 0.3)",
              })
              found = true
              break
            }
          }
          
          if (found) {
            // Only highlight first occurrence per phrase
            break
          }
        }
      }
      
      if (!found) {
        console.log(`[search-phrases] No match found for phrase: "${trimmedPhrase}"`)
      }
    }

    return NextResponse.json({ highlights })
  } catch (error) {
    console.error("[search-phrases] Error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    )
  }
}

