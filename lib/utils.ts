import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Cleans up Overheid.nl document descriptions by:
 * - Decoding HTML entities
 * - Removing navigation text and boilerplate
 * - Truncating if too long
 */
export function cleanOverheidDescription(description: string | undefined): string | undefined {
  if (!description) return undefined

  let cleaned = description.trim()

  // Decode HTML entities first
  // Handle common entities like &gt; &lt; &amp; &#xEB; etc.
  cleaned = cleaned
    .replace(/&#x([0-9A-Fa-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")

  // Remove the common Overheid.nl header pattern: "Informatie over X | Overheid.nl > Y"
  // This pattern appears at the start and contains navigation breadcrumbs
  // Match everything from "Informatie over" up to and including the first navigation word
  // We'll remove navigation words separately, so just remove the header prefix
  cleaned = cleaned.replace(/^Informatie over [^|]*\s*\|\s*Overheid\.nl\s*>\s*/i, "")
  
  // Also remove standalone "Informatie over X |" patterns that might appear
  cleaned = cleaned.replace(/^Informatie over [^|]*\s*\|\s*/i, "")
  
  // Remove common navigation and UI text (case-insensitive, whole words/phrases)
  // Use more aggressive patterns to catch variations
  const navigationPatterns = [
    /\bDirect naar content\b/gi,
    /\bNavigatie\b/gi,
    /\bContextinformatie\b/gi,
    /\bInformatie over publicatie\b/gi,
    /\bActies\b/gi,
    /\bGerelateerde informatie\b/gi,
    /\bMenu\b/gi,
    /\bU bent hier[^.]*\./gi,
    /\bU bent n[^.]*\./gi, // Handle truncated "U bent n..." 
    /\bDirect naar\b/gi,
    /\bTerug naar\b/gi,
    /\bGa naar\b/gi,
    /\bOffici[ëe]le bekendmakingen\b/gi, // Remove "Officiële bekendmakingen" if it's just navigation
  ]

  for (const pattern of navigationPatterns) {
    cleaned = cleaned.replace(pattern, "")
  }

  // Remove leading/trailing pipes, arrows, and separators
  cleaned = cleaned.replace(/^[\s|>•\-]+\s*/g, "").replace(/\s*[\s|>•\-]+$/g, "")
  
  // Remove any remaining "Overheid.nl" references that are part of navigation
  cleaned = cleaned.replace(/\s*Overheid\.nl\s*>/gi, "")

  // Remove excessive whitespace and normalize
  cleaned = cleaned.replace(/\s+/g, " ").trim()

  // If the description is mostly navigation text or too short, return undefined
  // Check if it's mostly common words that indicate navigation
  const navigationWords = ["direct", "naar", "content", "navigatie", "menu", "acties", "informatie", "over"]
  const words = cleaned.toLowerCase().split(/\s+/)
  const navigationWordCount = words.filter(w => navigationWords.includes(w)).length
  const isMostlyNavigation = words.length > 0 && navigationWordCount / words.length > 0.5

  if (isMostlyNavigation || cleaned.length < 20) {
    return undefined
  }

  // Truncate if too long
  if (cleaned.length > 500) {
    cleaned = cleaned.substring(0, 500).trim()
    // Try to truncate at a sentence boundary
    const lastPeriod = cleaned.lastIndexOf(".")
    const lastSpace = cleaned.lastIndexOf(" ")
    if (lastPeriod > 400) {
      cleaned = cleaned.substring(0, lastPeriod + 1)
    } else if (lastSpace > 400) {
      cleaned = cleaned.substring(0, lastSpace) + "..."
    } else {
      cleaned = cleaned + "..."
    }
  }

  return cleaned
}

/**
 * Formats source type names to be more user-friendly
 */
export function formatSourceType(type: string | undefined | null): string {
  if (!type) return "Unknown"
  
  const typeMap: Record<string, string> = {
    google_drive: "Google Drive",
    notion: "Notion",
    confluence: "Confluence",
    sharepoint: "SharePoint",
    dropbox: "Dropbox",
    direct_upload: "Uploaded",
    overheid_nl: "overheid.nl",
    workspace_generated: "Workspace",
  }
  
  return typeMap[type] || type
}

/** Case-insensitive substring match used by dashboard and authority search. */
export function matchesTextSearch(query: string, ...values: Array<string | null | undefined>) {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return true
  return values.some((value) => Boolean(value) && String(value).toLowerCase().includes(normalized))
}
