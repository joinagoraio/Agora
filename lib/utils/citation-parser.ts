export interface StructuredCitation {
  quote: string
  documentId?: string
  textSpan?: { start: number; end: number }
  pageNumber?: number
  confidence?: 'exact' | 'normalized' | 'fuzzy'
}

export interface ParsedCitation {
  quote: string
  structured?: StructuredCitation
  position: number // Character position in the message where citation was found
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
}

/**
 * Parse structured citations from AI response text
 * Looks for [citation:{...}] markers and extracts the JSON data
 */
export function parseStructuredCitations(content: string): ParsedCitation[] {
  const citations: ParsedCitation[] = []

  const citationPattern = /\[citation:\s*(\{[\s\S]*?\})\s*\]/gi

  let match
  while ((match = citationPattern.exec(content)) !== null) {
    try {
      let jsonStr = match[1]

      // Try to find the matching closing brace (handle nested objects)
      // Start from the opening brace and count braces
      let braceCount = 0
      let endIndex = -1
      for (let i = 0; i < jsonStr.length; i++) {
        if (jsonStr[i] === '{') braceCount++
        if (jsonStr[i] === '}') {
          braceCount--
          if (braceCount === 0) {
            endIndex = i + 1
            break
          }
        }
      }
      
      if (endIndex > 0) {
        jsonStr = jsonStr.substring(0, endIndex)
      }
      
      // Drafts saved as HTML carry the JSON with escaped quotes.
      if (jsonStr.includes("&quot;")) jsonStr = decodeHtmlEntities(jsonStr)
      const citationData = JSON.parse(jsonStr) as StructuredCitation
      
      if (citationData.quote && citationData.quote.length > 0) {
        citations.push({
          quote: citationData.quote,
          structured: citationData,
          position: match.index,
        })
      }
    } catch (error) {
      // If JSON parsing fails, skip this citation
      console.warn("[citation-parser] Failed to parse citation JSON:", match[1]?.substring(0, 100), error)
    }
  }
  
  return citations
}

