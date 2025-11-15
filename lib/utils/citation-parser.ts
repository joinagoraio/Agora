/**
 * Citation Parser
 * 
 * Parses structured citations from AI responses and extracts quoted text.
 * Supports both structured citations [citation:{...}] and simple [doc] citations.
 */

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
  hasDocCitation: boolean
  position: number // Character position in the message where citation was found
}

/**
 * Parse structured citations from AI response text
 * Looks for [citation:{...}] markers and extracts the JSON data
 */
export function parseStructuredCitations(content: string): ParsedCitation[] {
  const citations: ParsedCitation[] = []
  
  // Pattern to match [citation:{...}] markers
  // This regex matches [citation: followed by JSON-like object, then closing bracket
  // We need to handle nested braces, so we'll use a more sophisticated approach
  const citationPattern = /\[citation:\s*(\{[\s\S]*?\})\]/g
  
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
      
      // Try to parse the JSON
      const citationData = JSON.parse(jsonStr) as StructuredCitation
      
      if (citationData.quote && citationData.quote.length > 0) {
        citations.push({
          quote: citationData.quote,
          structured: citationData,
          hasDocCitation: true,
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

/**
 * Extract quoted phrases from text (fallback for when structured citations aren't available)
 * This is the regex-based extraction that was used before
 */
export function extractQuotedPhrases(content: string): string[] {
  const quotedPhrases = content.match(/"([^"]{10,500})"/g) || []
  return quotedPhrases
    .map((q: string) => q.replace(/^"|"$/g, "").trim())
    .filter((p: string) => {
      // Filter out very short quotes (likely not meaningful)
      if (p.length < 15) return false
      // Filter out questions (ending with "?" or starting with question words)
      if (p.trim().endsWith("?") || /^(what|who|where|when|why|how|which|is|are|was|were|do|does|did|can|could|would|should|will)\s+/i.test(p.trim())) return false
      // Filter out quotes that look like code snippets (contain code patterns)
      if (/^[a-z]+\.[a-z]+\(|function\s*\(|const\s+\w+\s*=|let\s+\w+\s*=|var\s+\w+\s*=/.test(p)) return false
      return true
    })
}

/**
 * Extract list items from message content
 * Looks for list items after phrases like "include:", "are:", etc.
 */
export function extractListItems(content: string): string[] {
  const listItemMatches: string[] = []
  const lines = content.split(/\n/)
  let inListContext = false
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    
    // Detect list context (after "include:", "are:", "listed:", etc.)
    if (/^(these|they|it|the document|the text|the context)\s+(include|includes|are|is|lists?|mentions?|refers? to|contains?)/i.test(line)) {
      inListContext = true
      continue
    }
    
    // If we're in list context, extract list items
    if (inListContext) {
      // Match lines that look like list items:
      // - Starts with bullet/dash: "- Item" or "• Item"
      // - Standalone capitalized phrase (likely a category/title)
      // - Lines after "These include:" or similar
      const listItemMatch = line.match(/^[-•*]\s*(.+)$/) || 
                           (line.length > 3 && line.length < 100 && /^[A-Z][^.!?]*$/.test(line) ? line : null)
      
      if (listItemMatch) {
        const item = (listItemMatch[1] || listItemMatch).trim()
        // Filter out common non-content words and very short items
        if (item.length >= 5 && item.length < 200 && 
            !/^(and|or|each|these|they|it)$/i.test(item)) {
          listItemMatches.push(item)
        }
      }
      
      // Stop list context after empty line or new sentence
      if (line === "" || /^[A-Z][^.!?]*[.!?]$/.test(line)) {
        inListContext = false
      }
    }
  }
  
  return listItemMatches
}

/**
 * Parse all citations from a message (structured + fallback)
 * Returns both structured citations and extracted quotes
 */
export function parseAllCitations(content: string): {
  structured: ParsedCitation[]
  quotes: string[]
  listItems: string[]
} {
  // First, try to get structured citations
  const structured = parseStructuredCitations(content)
  
  // Extract quoted phrases (fallback for when structured citations aren't available)
  const quotes = extractQuotedPhrases(content)
  
  // Extract list items
  const listItems = extractListItems(content)
  
  return {
    structured,
    quotes,
    listItems,
  }
}

