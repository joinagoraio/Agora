"use server"

import { createClient } from "@/lib/supabase/server"
import { findTextSpan } from "@/lib/utils/pdf-extraction"
import OpenAI from "openai"

// Helper function to rewrite/expand user query using AI for better search
async function rewriteQueryForSearch(originalQuery: string): Promise<string> {
  // Only use AI if OpenAI is configured and query is substantial
  if (!process.env.OPENAI_API_KEY || originalQuery.length < 10) {
    return originalQuery
  }

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Use cheaper model for query rewriting
      messages: [
        {
          role: "system",
          content: `You are a query rewriting assistant. Your job is to rewrite user questions into better search queries that will find relevant information in documents.

Rules:
- Extract key concepts, entities, and important terms from the question
- Remove question words (what, which, how, etc.) and convert to searchable terms
- Include synonyms or related terms that might appear in documents
- Keep it concise (1-3 key phrases, max 20 words)
- Focus on nouns and important verbs, remove filler words
- If the question asks about a specific thing, include that thing as a search term

Examples:
- "which is the most critical issue?" → "critical issue"
- "what are the security vulnerabilities?" → "security vulnerabilities"
- "how do I configure the system?" → "configure system configuration`
        },
        {
          role: "user",
          content: originalQuery
        }
      ],
      max_tokens: 50,
      temperature: 0.3, // Lower temperature for more consistent results
    })

    const rewritten = response.choices[0]?.message?.content?.trim()
    if (rewritten && rewritten.length > 0) {
      console.log("[searchDocuments] Query rewritten:", {
        original: originalQuery,
        rewritten,
      })
      return rewritten
    }
  } catch (error) {
    console.error("[searchDocuments] Error rewriting query:", error)
  }

  // Fallback to original query if AI rewriting fails
  return originalQuery
}

export interface DocumentMatch {
  document: any
  pageNumber?: number
  textSpan?: { start: number; end: number }
  preview?: string
}

export async function searchDocuments(
  workspaceId: string,
  query: string,
  limit = 5,
  excludedDocumentIds: string[] = [],
  includedDocumentIds?: string[],
) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { data: [], error: "Unauthorized" }
  }

  // Get workspace to check for location
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("location, context")
    .eq("id", workspaceId)
    .single()

  // Rewrite query using AI for better search results (optional, adds latency but improves quality)
  // For now, we'll use AI rewriting only for document preview mode (includedDocumentIds) 
  // to improve highlighting accuracy without adding latency to all searches
  let searchQuery = query
  if (includedDocumentIds && includedDocumentIds.length > 0) {
    // In document preview mode, use AI to rewrite query for better highlighting
    searchQuery = await rewriteQueryForSearch(query)
  }
  
  // If workspace has a location and it's not already in the query, add it
  if (workspace?.location && !searchQuery.toLowerCase().includes(workspace.location.toLowerCase())) {
    searchQuery = `${searchQuery} ${workspace.location}`
  }

  // Search documents table first
  if (includedDocumentIds && includedDocumentIds.length === 0) {
    return { data: [] }
  }

  let documentsQuery = supabase
    .from("documents")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("status", "active")

  // If specific documents are included (e.g., document preview mode), fetch them directly
  // Otherwise, search by text match
  if (includedDocumentIds && includedDocumentIds.length > 0) {
    // When documents are explicitly included, fetch them without requiring text match
    documentsQuery = documentsQuery.in("id", includedDocumentIds)
  } else {
    // When searching all documents, require text match
    documentsQuery = documentsQuery.or(`title.ilike.%${searchQuery}%,content.ilike.%${searchQuery}%`)
  }

  const { data: documents, error } = await documentsQuery.limit(limit * 2) // Fetch more to account for exclusions

  if (error) {
    return { data: [], error: error.message }
  }

  // Filter out excluded documents
  const excludedSet = new Set(excludedDocumentIds)
  let filteredDocuments = (documents || []).filter((doc) => !excludedSet.has(doc.id))

  if (includedDocumentIds && includedDocumentIds.length > 0) {
    const includedOrder = new Map(includedDocumentIds.map((id, index) => [id, index]))
    filteredDocuments = filteredDocuments
      .slice()
      .sort((a, b) => (includedOrder.get(a.id) ?? 0) - (includedOrder.get(b.id) ?? 0))
  }

  filteredDocuments = filteredDocuments.slice(0, limit)

  // For each document, try to find specific page matches
  const matches: DocumentMatch[] = []

  for (const doc of filteredDocuments) {
    // If this document is in the included list, try to find page matches
    // Otherwise, only search if query matches
    const isIncluded = includedDocumentIds && includedDocumentIds.length > 0 && includedDocumentIds.includes(doc.id)
    
    if (isIncluded) {
      // For included documents, try to find a page with text match first
      const { data: matchingPages } = await supabase
        .from("document_pages")
        .select("*")
        .eq("document_id", doc.id)
        .ilike("text_content", `%${searchQuery}%`)
        .limit(1)
      
      let page = matchingPages?.[0]
      
      // If no match found but document is included, get first page anyway
      if (!page) {
        const { data: firstPage } = await supabase
          .from("document_pages")
          .select("*")
          .eq("document_id", doc.id)
          .order("page_number", { ascending: true })
          .limit(1)
          .single()
        page = firstPage || undefined
      }
      
      if (page) {
        // Common stop words to skip when searching
        const stopWords = new Set([
          "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with", "by",
          "is", "are", "was", "were", "be", "been", "being", "have", "has", "had", "do", "does", "did",
          "will", "would", "should", "could", "may", "might", "must", "can",
          "this", "that", "these", "those", "which", "what", "who", "where", "when", "why", "how",
          "i", "you", "he", "she", "it", "we", "they", "me", "him", "her", "us", "them"
        ])
        
        // Try to find textSpan using the search query first
        let textSpan = findTextSpan(page.text_content || "", searchQuery)
        
        // If that doesn't work, try to find meaningful phrases from the search query
        if (!textSpan && searchQuery) {
          // Extract longer, more unique words (5+ characters, not stop words)
          const words = searchQuery
            .split(/\s+/)
            .filter(w => w.length >= 5 && !stopWords.has(w.toLowerCase().replace(/[^\w]/g, "")))
            .sort((a, b) => b.length - a.length) // Prefer longer words
          
          for (const word of words) {
            textSpan = findTextSpan(page.text_content || "", word)
            if (textSpan) {
              console.log("[searchDocuments] Found textSpan using word:", word)
              break
            }
          }
          
          // If still no match, try 2-3 word phrases (excluding stop words)
          if (!textSpan) {
            const meaningfulWords = searchQuery
              .split(/\s+/)
              .filter(w => !stopWords.has(w.toLowerCase().replace(/[^\w]/g, "")))
            
            // Try 3-word phrases, then 2-word phrases
            for (let phraseLength = 3; phraseLength >= 2 && !textSpan; phraseLength--) {
              for (let i = 0; i <= meaningfulWords.length - phraseLength; i++) {
                const phrase = meaningfulWords.slice(i, i + phraseLength).join(" ")
                if (phrase.length >= 10) {
                  textSpan = findTextSpan(page.text_content || "", phrase)
                  if (textSpan) {
                    console.log("[searchDocuments] Found textSpan using phrase:", phrase)
                    break
                  }
                }
              }
            }
          }
        }
        
        // If we found a textSpan from query matching, expand it to highlight a meaningful section
        // Single words or short phrases aren't useful highlights - we want 100-200 characters
        if (textSpan) {
          const currentLength = textSpan.end - textSpan.start
          const targetLength = 150 // Aim for ~150 characters of highlighted text
          
          if (currentLength < targetLength) {
            const expandAmount = Math.floor((targetLength - currentLength) / 2)
            const expandedStart = Math.max(0, textSpan.start - expandAmount)
            const expandedEnd = Math.min((page.text_content || "").length, textSpan.end + expandAmount)
            
            textSpan = {
              start: expandedStart,
              end: expandedEnd,
            }
            
            console.log("[searchDocuments] Expanded textSpan from query match:", {
              originalLength: currentLength,
              expandedLength: expandedEnd - expandedStart,
              textSpan,
            })
          }
        }
        
        // Get preview text around the match or from the beginning
        let preview = ""
        if (textSpan) {
          const start = Math.max(0, textSpan.start - 50)
          const end = Math.min((page.text_content || "").length, textSpan.end + 50)
          preview = (page.text_content || "").substring(start, end)
        } else if (page.text_content) {
          // If no match, show first 200 chars
          preview = page.text_content.substring(0, 200)
        }
        
        // Now use the preview text to create a better textSpan
        // The preview is already relevant content, so we should highlight where it appears
        if (preview && page.text_content && !textSpan) {
          // Try to find the preview text (or a substantial portion of it) in the document
          // Use a sliding window approach to find the best match
          const previewLength = preview.length
          const minMatchLength = Math.min(100, Math.floor(previewLength * 0.6)) // Match at least 60% of preview
          
          // Try to find progressively smaller chunks of the preview
          for (let chunkSize = previewLength; chunkSize >= minMatchLength; chunkSize -= 20) {
            // Try different starting positions in the preview
            for (let startPos = 0; startPos <= previewLength - chunkSize; startPos += 20) {
              const chunk = preview.substring(startPos, startPos + chunkSize).trim()
              
              // Skip if chunk is too short or starts with just stop words
              if (chunk.length < 50) continue
              
              const firstWords = chunk.split(/\s+/).slice(0, 3).join(" ").toLowerCase()
              if (stopWords.has(firstWords.split(/\s+/)[0]?.replace(/[^\w]/g, ""))) {
                continue
              }
              
              const chunkSpan = findTextSpan(page.text_content, chunk)
              if (chunkSpan) {
                // Found a match! Expand it to highlight a meaningful section (100-150 chars)
                const expandAmount = 50
                const expandedStart = Math.max(0, chunkSpan.start - expandAmount)
                const expandedEnd = Math.min(page.text_content.length, chunkSpan.end + expandAmount)
                
                textSpan = {
                  start: expandedStart,
                  end: expandedEnd,
                }
                
                console.log("[searchDocuments] Found textSpan using preview chunk:", {
                  chunkPreview: chunk.substring(0, 60),
                  originalSpan: chunkSpan,
                  expandedSpan: textSpan,
                })
                break
              }
            }
            if (textSpan) break
          }
          
          // If still no match, use the preview text directly (it's from the document, so it should match)
          if (!textSpan && preview.length > 50) {
            // Find where the preview starts in the document
            const previewStart = page.text_content.indexOf(preview.substring(0, 100))
            if (previewStart !== -1) {
              // Highlight a meaningful section around where the preview appears
              const highlightLength = Math.min(150, preview.length)
              textSpan = {
                start: previewStart,
                end: previewStart + highlightLength,
              }
              console.log("[searchDocuments] Found textSpan using preview start position:", textSpan)
            }
          }
        }
        
        console.log("[searchDocuments] Found page for included doc:", {
          documentId: doc.id,
          pageNumber: page.page_number,
          pageTextLength: (page.text_content || "").length,
          searchQuery,
          textSpan,
          hasTextSpan: !!textSpan,
          previewLength: preview.length,
        })

        matches.push({
          document: doc,
          pageNumber: page.page_number,
          textSpan: textSpan || undefined,
          preview,
        })
      } else if (doc.content && doc.content.trim() && !doc.content.startsWith("[Failed") && !doc.content.startsWith("[Binary")) {
        // No pages found, but we have document content - use it as a virtual page
        // This enables highlighting for documents that were uploaded before page storage was implemented
        const textSpan = findTextSpan(doc.content, searchQuery)
        
        let preview = ""
        if (textSpan) {
          const start = Math.max(0, textSpan.start - 50)
          const end = Math.min(doc.content.length, textSpan.end + 50)
          preview = doc.content.substring(start, end)
        } else {
          preview = doc.content.substring(0, 200)
        }

        matches.push({
          document: doc,
          pageNumber: 1, // Treat as page 1 for highlighting
          textSpan: textSpan || undefined,
          preview,
        })
      } else {
        // No pages found and no content, use document-level match
        matches.push({
          document: doc,
        })
      }
    } else {
      // For non-included documents, only include if there's a text match
      const { data: pages } = await supabase
        .from("document_pages")
        .select("*")
        .eq("document_id", doc.id)
        .ilike("text_content", `%${searchQuery}%`)
        .limit(1)

      if (pages && pages.length > 0) {
        const page = pages[0]
        const textSpan = findTextSpan(page.text_content || "", searchQuery)

        // Get preview text around the match
        let preview = ""
        if (textSpan) {
          const start = Math.max(0, textSpan.start - 50)
          const end = Math.min((page.text_content || "").length, textSpan.end + 50)
          preview = (page.text_content || "").substring(start, end)
        }

        matches.push({
          document: doc,
          pageNumber: page.page_number,
          textSpan: textSpan || undefined,
          preview,
        })
      } else if (doc.content && doc.content.trim() && !doc.content.startsWith("[Failed") && !doc.content.startsWith("[Binary")) {
        // No pages found, but we have document content - use it as a virtual page
        const textSpan = findTextSpan(doc.content, searchQuery)
        
        let preview = ""
        if (textSpan) {
          const start = Math.max(0, textSpan.start - 50)
          const end = Math.min(doc.content.length, textSpan.end + 50)
          preview = doc.content.substring(start, end)
        }

        matches.push({
          document: doc,
          pageNumber: 1, // Treat as page 1 for highlighting
          textSpan: textSpan || undefined,
          preview,
        })
      } else {
        // No page match and no content, use document-level match
        matches.push({
          document: doc,
        })
      }
    }
  }

  return { data: matches }
}

export async function getRelevantContext(
  workspaceId: string,
  query: string,
  excludedDocumentIds: string[] = [],
  includedDocumentIds?: string[],
  excludedNoteIds: string[] = [],
  excludedEvidenceIds: string[] = [],
): Promise<{ context: string; sources: any[] }> {
  const supabase = await createClient()

  // Get workspace context and location
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("context, location")
    .eq("id", workspaceId)
    .single()

  // If specific documents are included, use a limit that matches the number of included documents
  // Otherwise, use the default limit of 3 for text-based search
  const searchLimit = includedDocumentIds && includedDocumentIds.length > 0
    ? includedDocumentIds.length // Include all specified documents
    : 3 // Default limit for text-based search

  console.log(`[getRelevantContext] Search parameters:`, {
    workspaceId,
    queryLength: query.length,
    includedDocumentIds: includedDocumentIds?.length || 0,
    excludedDocumentIds: excludedDocumentIds.length,
    searchLimit,
  })

  const { data: matches } = await searchDocuments(workspaceId, query, searchLimit, excludedDocumentIds, includedDocumentIds)
  const documentMatches = matches ?? []

  console.log(`[getRelevantContext] Found ${documentMatches.length} document matches`)

  // Build context string with workspace context if available
  let contextParts: string[] = []

  if (workspace?.context) {
    contextParts.push(`Workspace Context: ${workspace.context}`)
  }

  if (workspace?.location) {
    contextParts.push(`Location: ${workspace.location}`)
  }

  const { data: notesData, error: notesError } = await supabase
    .from("workspace_notes")
    .select(
      "id, content, include_in_ai_context, author:profiles(id, full_name, email)",
    )
    .eq("workspace_id", workspaceId)
    .eq("include_in_ai_context", true)
    .order("updated_at", { ascending: false })
    .limit(20)

  if (notesError) {
    console.error("[getRelevantContext] Failed to load workspace notes:", notesError)
  }

  const excludedNotesSet = new Set(excludedNoteIds)
  const relevantNotes =
    notesData
      ?.filter((note) => !excludedNotesSet.has(note.id))
      .map((note) => ({
        id: note.id,
        content: typeof note.content === "string" ? note.content : "",
        authorName: note.author?.full_name || note.author?.email || "Workspace member",
      })) ?? []

  if (relevantNotes.length > 0) {
    const noteSummaries = relevantNotes.map((note) => {
      const trimmedContent = note.content.trim()
      const preview =
        trimmedContent.length > 600 ? `${trimmedContent.slice(0, 600).trimEnd()}...` : trimmedContent || "[No content provided]"
      return `Author: ${note.authorName}\n${preview}`
    })
    contextParts.push(`Workspace Notes:\n${noteSummaries.join("\n\n")}`)
  }

  // Get evidence items (workspace_items with type="evidence" and include_in_ai_context=true)
  const { data: evidenceItems, error: evidenceError } = await supabase
    .from("workspace_items")
    .select("id, payload, created_at, created_by:profiles(id, full_name, email)")
    .eq("workspace_id", workspaceId)
    .eq("inheritance", "local")
    .eq("include_in_ai_context", true)
    .order("created_at", { ascending: false })
    .limit(10)

  if (evidenceError) {
    console.error("[getRelevantContext] Failed to load evidence items:", evidenceError)
  }

  const excludedEvidenceSet = new Set(excludedEvidenceIds)
  const relevantEvidence = (evidenceItems ?? [])
    .filter((item) => {
      if (excludedEvidenceSet.has(item.id)) {
        return false
      }
      const payload = item.payload as Record<string, any> | null
      return payload?.type === "evidence" && payload?.question && payload?.answer
    })
    .map((item) => {
      const payload = item.payload as Record<string, any>
      const authorName = (item.created_by as any)?.full_name || (item.created_by as any)?.email || "Workspace member"
      const question = typeof payload.question === "string" ? payload.question : ""
      const answer = typeof payload.answer === "string" ? payload.answer : ""
      const trimmedAnswer = answer.length > 800 ? `${answer.slice(0, 800).trimEnd()}...` : answer
      return `Question: ${question}\nAnswer: ${trimmedAnswer}\nSaved by: ${authorName}`
    })

  if (relevantEvidence.length > 0) {
    contextParts.push(`Workspace Evidence:\n${relevantEvidence.join("\n\n---\n\n")}`)
  }

  const sources: any[] = []

  // Combine document content for context
  // For documents with no content but with pages, we'll aggregate page content
  const documentContextPromises = documentMatches.map(async (match) => {
    const doc = match.document
    const pageInfo = match.pageNumber 
      ? ` (Page ${match.pageNumber})` 
      : ""
    const preview = match.preview 
      ? `\nRelevant excerpt: ${match.preview}` 
      : ""
    
    let content = doc.content || ""
    const isIncluded = includedDocumentIds && includedDocumentIds.length > 0 && includedDocumentIds.includes(doc.id)
    
    // Always try to get content from pages for included documents, or if content is empty
    if ((isIncluded || !content) && doc.id) {
      try {
        const { data: pages, error: pagesError } = await supabase
          .from("document_pages")
          .select("text_content, page_number")
          .eq("document_id", doc.id)
          .order("page_number", { ascending: true })
          .limit(isIncluded ? 1000 : 10) // Get all pages for included documents (up to 1000)
        
        if (pagesError) {
          console.error(`[getRelevantContext] Error fetching pages for doc ${doc.id}:`, pagesError)
        }
        
        if (isIncluded) {
          console.log(`[getRelevantContext] Document ${doc.id} (${doc.title}): Found ${pages?.length || 0} pages`)
          if (pages && pages.length > 0) {
            const totalChars = pages.reduce((sum, p) => sum + (p.text_content?.length || 0), 0)
            console.log(`[getRelevantContext] Total characters from pages: ${totalChars}`)
          }
        }
        
        if (pages && pages.length > 0) {
          const pageContent = pages
            .map((p) => p.text_content || "")
            .filter(Boolean)
            .join("\n\n")
          
          if (pageContent.trim()) {
            // For included documents, prioritize page content (it's more complete)
            if (isIncluded) {
              // For included documents, use all available content (up to 50000 chars to avoid token limits)
              // This ensures the AI has access to the full document when viewing it
              content = pageContent.length > 50000 ? pageContent.substring(0, 50000) : pageContent
              console.log(`[getRelevantContext] Using ${content.length} chars from ${pages.length} pages for included doc ${doc.id} (total available: ${pageContent.length} chars)`)
            } else if (!content) {
              content = pageContent.substring(0, 2000)
            } else if (pageContent.length > content.length) {
              // Use page content if it's more complete
              content = pageContent.substring(0, 2000)
            }
          } else if (isIncluded) {
            console.warn(`[getRelevantContext] Pages exist but have no text_content for doc ${doc.id}`)
          }
        } else if (isIncluded) {
          console.warn(`[getRelevantContext] No pages found in document_pages for doc ${doc.id}`)
        }
      } catch (error) {
        console.error(`[getRelevantContext] Error processing pages for doc ${doc.id}:`, error)
      }
    }
    
    // Limit content length for context
    if (content && content.length > 1000 && !isIncluded) {
      content = content.substring(0, 1000)
    } else if (content && content.length > 50000 && isIncluded) {
      // For included documents, allow up to 50000 chars (already limited above)
      content = content.substring(0, 50000)
    } else if (content && content.length > 8000 && !isIncluded) {
      content = content.substring(0, 8000)
    }
    
    // Log for debugging
    if (isIncluded) {
      if (!content) {
        console.warn(`[getRelevantContext] Included document ${doc.id} (${doc.title}) has no content`)
        console.warn(`[getRelevantContext] Document content field: ${doc.content ? `${doc.content.length} chars` : 'empty'}`)
      } else {
        console.log(`[getRelevantContext] Included document ${doc.id} (${doc.title}) has ${content.length} chars of content`)
      }
    }
    
    return `Document: ${doc.title}${pageInfo}\n${content || "[No content available - document may need to be re-uploaded or processed]"}${preview}\n---`
  })
  
  const documentContextArray = await Promise.all(documentContextPromises)
  const documentContext = documentContextArray.join("\n\n")

  if (documentMatches.length > 0) {
    if (contextParts.length > 0) {
      contextParts.push(documentContext)
    } else {
      contextParts = [documentContext]
    }

    // Build sources with page and highlight information
    documentMatches.forEach((match) => {
      const doc = match.document
      const source: any = {
        id: doc.id,
        title: doc.title,
        url: doc.url || doc.external_url,
      }

      if (match.pageNumber) {
        source.pageNumber = match.pageNumber
      }

      if (match.textSpan) {
        source.textSpan = match.textSpan
      }

      if (match.preview) {
        source.preview = match.preview
      }

      console.log("[getRelevantContext] Building source:", {
        documentId: doc.id,
        title: doc.title,
        pageNumber: source.pageNumber,
        textSpan: source.textSpan,
        hasTextSpan: !!source.textSpan,
      })

      sources.push(source)
    })
  } else {
    const noDocsMessage = "No relevant documents found in the workspace."
    if (contextParts.length > 0) {
      contextParts.push(noDocsMessage)
    } else {
      contextParts = [noDocsMessage]
    }
  }

  const context = contextParts.join("\n\n")

  return { context, sources }
}

/**
 * Aggregate ALL workspace knowledge (documents, notes, evidence) for AI generation.
 * This is primarily used for workspace document drafting to give the model comprehensive context.
 */
export async function getAllWorkspaceKnowledge(
  workspaceId: string,
  excludedDocumentIds: string[] = [],
): Promise<{ context: string; sources: any[] }> {
  const MAX_DOCUMENTS = 25
  const MAX_DOC_CHARS = 3500
  const MAX_TOTAL_DOC_CHARS = 60000
  const MAX_NOTES = 25
  const MAX_NOTE_CHARS = 800
  const MAX_EVIDENCE = 25
  const MAX_EVIDENCE_CHARS = 1200
  const MAX_CONTEXT_CHARS = 110000
  const supabase = await createClient()

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("context, location")
    .eq("id", workspaceId)
    .single()

  const contextParts: string[] = []

  if (workspace?.context) {
    contextParts.push(`Workspace Context: ${workspace.context}`)
  }

  if (workspace?.location) {
    contextParts.push(`Location: ${workspace.location}`)
  }

  const excludedDocsSet = new Set(excludedDocumentIds)
  const { data: allDocuments, error: docsError } = await supabase
    .from("documents")
    .select("id, title, content, url, external_url")
    .eq("workspace_id", workspaceId)
    .neq("status", "deleted")
    .neq("status", "archived")
    .order("created_at", { ascending: false })
    .limit(MAX_DOCUMENTS)

  if (docsError) {
    console.error("[getAllWorkspaceKnowledge] Failed to load documents:", docsError)
  }

  const sources: any[] = []
  let totalDocChars = 0
  const documentSections: string[] = []

  for (const doc of (allDocuments ?? [])) {
    if (excludedDocsSet.has(doc.id)) {
      continue
    }

    if (totalDocChars >= MAX_TOTAL_DOC_CHARS) {
      console.log("[getAllWorkspaceKnowledge] Reached max doc char budget")
      break
    }

    let content = doc.content || ""

    if ((!content || content.length < MAX_DOC_CHARS / 2) && doc.id) {
      try {
        const { data: pages, error: pagesError } = await supabase
          .from("document_pages")
          .select("text_content, page_number")
          .eq("document_id", doc.id)
          .order("page_number", { ascending: true })
          .limit(10)

        if (!pagesError && pages && pages.length > 0) {
          const pageContent = pages
            .map((p) => p.text_content || "")
            .filter(Boolean)
            .join("\n\n")

          if (pageContent.trim()) {
            content = pageContent
          }
        }
      } catch (error) {
        console.error(`[getAllWorkspaceKnowledge] Error fetching pages for doc ${doc.id}:`, error)
      }
    }

    if (!content) {
      content = "[No content available]"
    }

    const remainingBudget = MAX_TOTAL_DOC_CHARS - totalDocChars
    const docBudget = Math.min(MAX_DOC_CHARS, remainingBudget)
    if (content.length > docBudget) {
      content = `${content.substring(0, docBudget)}…`
    }

    totalDocChars += content.length

    sources.push({
      id: doc.id,
      title: doc.title,
      url: doc.url || doc.external_url,
    })

    documentSections.push(`Document: ${doc.title}\n${content}\n---`)
  }

  if (documentSections.length > 0) {
    contextParts.push(documentSections.join("\n\n"))
  } else {
    contextParts.push("No documents found in the workspace.")
  }

  const { data: notesData, error: notesError } = await supabase
    .from("workspace_notes")
    .select("id, content, include_in_ai_context, author:profiles(id, full_name, email)")
    .eq("workspace_id", workspaceId)
    .eq("include_in_ai_context", true)
    .order("updated_at", { ascending: false })
    .limit(MAX_NOTES)

  if (notesError) {
    console.error("[getAllWorkspaceKnowledge] Failed to load workspace notes:", notesError)
  }

  const notes =
    notesData?.map((note) => ({
      id: note.id,
      content: typeof note.content === "string" ? note.content : "",
      authorName: note.author?.full_name || note.author?.email || "Workspace member",
    })) ?? []

  if (notes.length > 0) {
    const noteSummaries = notes.map((note) => {
      let preview = note.content.trim() || "[No content provided]"
      if (preview.length > MAX_NOTE_CHARS) {
        preview = `${preview.slice(0, MAX_NOTE_CHARS).trimEnd()}…`
      }
      return `Author: ${note.authorName}\n${preview}`
    })
    contextParts.push(`Workspace Notes:\n${noteSummaries.join("\n\n")}`)
  }

  const { data: evidenceItems, error: evidenceError } = await supabase
    .from("workspace_items")
    .select("id, payload, created_at, created_by:profiles(id, full_name, email)")
    .eq("workspace_id", workspaceId)
    .eq("inheritance", "local")
    .eq("include_in_ai_context", true)
    .order("created_at", { ascending: false })
    .limit(MAX_EVIDENCE)

  if (evidenceError) {
    console.error("[getAllWorkspaceKnowledge] Failed to load evidence items:", evidenceError)
  }

  const evidenceSections = (evidenceItems ?? [])
    .filter((item) => {
      const payload = item.payload as Record<string, any> | null
      return payload?.type === "evidence" && payload?.question && payload?.answer
    })
    .map((item) => {
      const payload = item.payload as Record<string, any>
      const authorName =
        (item.created_by as any)?.full_name || (item.created_by as any)?.email || "Workspace member"
      const question = typeof payload.question === "string" ? payload.question : ""
      let answer = typeof payload.answer === "string" ? payload.answer : ""
      if (answer.length > MAX_EVIDENCE_CHARS) {
        answer = `${answer.slice(0, MAX_EVIDENCE_CHARS).trimEnd()}…`
      }
      return `Question: ${question}\nAnswer: ${answer}\nSaved by: ${authorName}`
    })

  if (evidenceSections.length > 0) {
    contextParts.push(`Workspace Evidence:\n${evidenceSections.join("\n\n---\n\n")}`)
  }

  let context = contextParts.join("\n\n")

  if (context.length > MAX_CONTEXT_CHARS) {
    console.warn(
      `[getAllWorkspaceKnowledge] Truncating context from ${context.length} to ${MAX_CONTEXT_CHARS} chars`,
    )
    context = `${context.slice(0, MAX_CONTEXT_CHARS).trimEnd()}…`
  }

  return { context, sources }
}
