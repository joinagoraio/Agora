import { createClient } from "@/lib/supabase/server"
import { findTextSpan, getHighlightCoordinates } from "@/lib/utils/pdf-extraction"
import { NextRequest, NextResponse } from "next/server"

// Helper function to calculate similarity between two strings
function calculateSimilarity(str1: string, str2: string): number {
  const longer = str1.length > str2.length ? str1 : str2
  const shorter = str1.length > str2.length ? str2 : str1
  
  if (longer.length === 0) return 1.0
  
  // Simple similarity: count matching characters
  let matches = 0
  const minLength = Math.min(longer.length, shorter.length)
  for (let i = 0; i < minLength; i++) {
    if (longer[i] === shorter[i]) matches++
  }
  
  return matches / longer.length
}

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
      
      // Filter out questions (ending with "?" or starting with question words)
      if (trimmedPhrase.endsWith("?") || /^(what|who|where|when|why|how|which|is|are|was|were|do|does|did|can|could|would|should|will)\s+/i.test(trimmedPhrase)) {
        console.log(`[search-phrases] Skipping question phrase: "${trimmedPhrase}"`)
        continue
      }
      
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
          // Try exact match first
          let textSpan = findTextSpan(fullText, searchVariant, { useNormalization: false, fuzzy: false })
          
          // Verify the match is not in test code (filter out matches in test contexts)
          if (textSpan) {
            const matchedText = fullText.substring(textSpan.start, textSpan.end)
            const contextBefore = fullText.substring(Math.max(0, textSpan.start - 50), textSpan.start)
            const contextAfter = fullText.substring(textSpan.end, Math.min(fullText.length, textSpan.end + 50))
            const fullContext = contextBefore + matchedText + contextAfter
            
            // Check if match is in test code (look for test patterns)
            const isInTestCode = /(expect|toBe|test|it\(|describe\(|\.test\(|\.spec\(|jest|vitest)/i.test(fullContext) ||
                              /(\.get\(|\.post\(|\.put\(|\.delete\(|\.patch\(|\.head\(|\.options\()/i.test(contextBefore) ||
                              /(headers\.get|response\.|request\.)/i.test(contextBefore)
            
            if (isInTestCode) {
              console.log(`[search-phrases] Skipping match in test code for "${trimmedPhrase}"`)
              textSpan = null // Reject this match
            } else {
              // Verify the matched text is reasonably close to the search text
              // Check if it's a reasonable match (not just a few words)
              const similarity = calculateSimilarity(matchedText.toLowerCase(), searchVariant.toLowerCase())
              if (similarity < 0.7 && searchVariant.length > 20) {
                // For longer phrases, require higher similarity
                console.log(`[search-phrases] Match similarity too low (${similarity.toFixed(2)}) for "${trimmedPhrase}"`)
                textSpan = null
              }
            }
          }
          
          // If no exact match or exact match was rejected, try with normalization
          if (!textSpan) {
            textSpan = findTextSpan(fullText, searchVariant, { useNormalization: true, fuzzy: false })
            
            // Verify normalized match too
            if (textSpan) {
              const matchedText = fullText.substring(textSpan.start, textSpan.end)
              const contextBefore = fullText.substring(Math.max(0, textSpan.start - 50), textSpan.start)
              const isInTestCode = /(expect|toBe|test|it\(|describe\(|\.test\(|\.spec\(|jest|vitest)/i.test(contextBefore) ||
                                /(\.get\(|\.post\(|\.put\(|\.delete\(|\.patch\(|\.head\(|\.options\()/i.test(contextBefore) ||
                                /(headers\.get|response\.|request\.)/i.test(contextBefore)
              
              if (isInTestCode) {
                textSpan = null
              }
            }
          }
          
          // If still no match, try fuzzy matching (but be more strict)
          if (!textSpan && searchVariant.length >= 20) {
            textSpan = findTextSpan(fullText, searchVariant, { useNormalization: true, fuzzy: true })
            
            // Verify fuzzy match too
            if (textSpan) {
              const matchedText = fullText.substring(textSpan.start, textSpan.end)
              const contextBefore = fullText.substring(Math.max(0, textSpan.start - 50), textSpan.start)
              const isInTestCode = /(expect|toBe|test|it\(|describe\(|\.test\(|\.spec\(|jest|vitest)/i.test(contextBefore) ||
                                /(\.get\(|\.post\(|\.put\(|\.delete\(|\.patch\(|\.head\(|\.options\()/i.test(contextBefore) ||
                                /(headers\.get|response\.|request\.)/i.test(contextBefore)
              
              if (isInTestCode) {
                textSpan = null
              }
            }
          }
          
          if (textSpan) {
            // Verify the matched text is the full quote, not truncated
            const matchedText = fullText.substring(textSpan.start, textSpan.end)
            const matchedTextNormalized = matchedText.toLowerCase().trim()
            const searchVariantNormalized = searchVariant.toLowerCase().trim()
            
            // Check if match is complete (not truncated)
            // For longer quotes, ensure we're matching the full text
            if (searchVariant.length > 30) {
              // For longer quotes, require that the matched text contains the key parts
              const searchWords = searchVariantNormalized.split(/\s+/).filter(w => w.length > 3)
              const matchedWords = matchedTextNormalized.split(/\s+/).filter(w => w.length > 3)
              
              // Check if at least 80% of significant words from search are in the match
              const matchingWords = searchWords.filter(sw => matchedWords.some(mw => mw.includes(sw) || sw.includes(mw)))
              const wordMatchRatio = searchWords.length > 0 ? matchingWords.length / searchWords.length : 0
              
              if (wordMatchRatio < 0.8) {
                console.log(`[search-phrases] Match incomplete for "${trimmedPhrase}" (word match: ${wordMatchRatio.toFixed(2)})`)
                textSpan = null
              }
            }
            
          if (textSpan) {
            console.log(`[search-phrases] Found match for phrase "${trimmedPhrase}" using variant "${searchVariant}"`)
              
              // For section titles (like "Authentication & Authorization"), try to find the full section
              // But only if the phrase is short and looks like a section title
              const isSectionTitle = trimmedPhrase.length < 50 && 
                                   !trimmedPhrase.includes('.') && 
                                   !trimmedPhrase.includes(',') &&
                                   /^[A-Z][^.!?]*$/.test(trimmedPhrase)
              
              if (isSectionTitle) {
                // Look for markdown headers (### Title) and include all content until next header
                const escapedVariant = searchVariant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                // Match section header with optional emoji, then all content until next ### header or end of document
                // Exclude test code sections
                const sectionPattern = new RegExp(`(###+\\s*[✅✓]?\\s*${escapedVariant}[^\\n]*\\n[\\s\\S]*?)(?=\\n###|$)`, 'i')
                const sectionMatch = fullText.match(sectionPattern)
                
                if (sectionMatch && sectionMatch[1]) {
                  // Verify section doesn't contain test code
                  const sectionText = sectionMatch[1]
                  const hasTestCode = /(expect|toBe|test|it\(|describe\(|\.test\(|\.spec\(|jest|vitest)/i.test(sectionText)
                  
                  if (!hasTestCode) {
                    // Found a valid section - highlight the entire section
                    const sectionStart = fullText.indexOf(sectionMatch[1])
                    const sectionEnd = sectionStart + sectionMatch[1].length
                    
                    console.log(`[search-phrases] Found full section for "${trimmedPhrase}": ${sectionMatch[1].substring(0, 100)}...`)
                    
                    highlights.push({
                      id: `highlight-${documentId}-1-${highlights.length}`,
                      pageNumber: 1,
                      textSpan: { start: sectionStart, end: sectionEnd },
                      color: "rgba(255, 255, 0, 0.3)",
                    })
                    found = true
                    break
                  }
                }
              }
              
              // Just highlight the matched phrase (not a section)
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
        }
      } else if (pages && pages.length > 0) {
        // For PDFs, search in each page
        for (const page of pages) {
          const textContent = page.text_content || ""
          
          for (const searchVariant of searchVariants) {
            // Try exact match first
            let textSpan = findTextSpan(textContent, searchVariant, { useNormalization: false, fuzzy: false })
            
            // If no exact match, try with normalization
            if (!textSpan) {
              textSpan = findTextSpan(textContent, searchVariant, { useNormalization: true, fuzzy: false })
            }
            
            // If still no match, try fuzzy matching
            if (!textSpan) {
              textSpan = findTextSpan(textContent, searchVariant, { useNormalization: true, fuzzy: true })
            }
            
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

