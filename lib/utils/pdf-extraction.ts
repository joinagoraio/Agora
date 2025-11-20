// Import polyfill FIRST before any pdf.js imports
import "./dommatrix-polyfill"

// Polyfill Promise.withResolvers for older Node.js versions (needed for pdfjs-dist)
if (typeof Promise.withResolvers === 'undefined') {
  (Promise as any).withResolvers = function<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void
    let reject!: (reason?: any) => void
    const promise = new Promise<T>((res, rej) => {
      resolve = res
      reject = rej
    })
    return { promise, resolve, reject }
  }
}

import * as pdfjs from "pdfjs-dist"
import pdfWorkerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url"
import type { TextItem } from "pdfjs-dist/types/src/display/api"

// Configure PDF.js worker
if (typeof window === "undefined") {
  // Server-side: disable worker to avoid bundler issues
  pdfjs.GlobalWorkerOptions.workerSrc = ""
} else {
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerSrc
}

export interface TextItemWithCoords {
  text: string
  x: number
  y: number
  width: number
  height: number
  fontSize: number
  fontName: string
}

export interface PageData {
  pageNumber: number
  textContent: string
  textItems: TextItemWithCoords[]
  characterOffsets: Record<number, number> // character index -> text item index
}

/**
 * Extract text items with coordinates from a PDF page
 */
async function extractTextItemsFromPage(page: any): Promise<TextItemWithCoords[]> {
  const textContent = await page.getTextContent()
  const viewport = page.getViewport({ scale: 1.0 })
  
  const textItems: TextItemWithCoords[] = []
  
  for (const item of textContent.items as TextItem[]) {
    if (item.str && item.transform) {
      // Transform matrix: [a, b, c, d, e, f]
      // e = x translation, f = y translation
      const x = item.transform[4]
      const y = viewport.height - item.transform[5] // Flip Y coordinate
      const width = item.width || 0
      const height = item.height || 0
      
      textItems.push({
        text: item.str,
        x,
        y,
        width,
        height,
        fontSize: item.height || 12,
        fontName: item.fontName || "unknown",
      })
    }
  }
  
  return textItems
}

/**
 * Build character offset map for text matching
 */
function buildCharacterOffsetMap(textItems: TextItemWithCoords[]): Record<number, number> {
  const offsets: Record<number, number> = {}
  let charIndex = 0
  
  textItems.forEach((item, itemIndex) => {
    for (let i = 0; i < item.text.length; i++) {
      offsets[charIndex] = itemIndex
      charIndex++
    }
    // Add space after each item except the last
    if (itemIndex < textItems.length - 1) {
      charIndex++
    }
  })
  
  return offsets
}

/**
 * Extract all pages from a PDF buffer with text and coordinates
 */
export async function extractPdfPages(buffer: Uint8Array | ArrayBuffer): Promise<PageData[]> {
  try {
    // pdfjs-dist requires Uint8Array, not Buffer
    const uint8Array = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
    const loadingTask = pdfjs.getDocument({ data: uint8Array })
    const pdf = await loadingTask.promise
    const numPages = pdf.numPages
    
    const pages: PageData[] = []
    
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const page = await pdf.getPage(pageNum)
      const textItems = await extractTextItemsFromPage(page)
      
      // Combine all text items into a single string
      const textContent = textItems.map((item) => item.text).join(" ")
      
      // Build character offset map
      const characterOffsets = buildCharacterOffsetMap(textItems)
      
      pages.push({
        pageNumber: pageNum,
        textContent,
        textItems,
        characterOffsets,
      })
    }
    
    return pages
  } catch (error) {
    console.error("[PDF Extraction] Error extracting pages:", error)
    throw error
  }
}

/**
 * Normalize text for matching by standardizing whitespace, punctuation, and case
 * This ensures quotes from AI responses match document text even with minor variations
 */
export function normalizeTextForMatching(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, ' ') // Normalize all whitespace to single spaces
    .replace(/[.,!?;:]/g, '') // Remove punctuation for matching
    .trim()
}

/**
 * Find text span in page text and return character positions
 * Enhanced with normalization and fuzzy matching support
 */
export function findTextSpan(
  pageText: string, 
  searchText: string, 
  options?: { useNormalization?: boolean; fuzzy?: boolean }
): { start: number; end: number } | null {
  const useNormalization = options?.useNormalization ?? false
  const fuzzy = options?.fuzzy ?? false
  
  // Strategy 1: Exact match (case-insensitive)
  const normalizedPageText = pageText.toLowerCase()
  const normalizedSearchText = searchText.toLowerCase()
  
  let startIndex = normalizedPageText.indexOf(normalizedSearchText)
  
  if (startIndex !== -1) {
  return {
    start: startIndex,
    end: startIndex + searchText.length,
  }
  }
  
  // Strategy 2: Normalized match (remove punctuation, normalize whitespace)
  if (useNormalization) {
    const normalizedPage = normalizeTextForMatching(pageText)
    const normalizedSearch = normalizeTextForMatching(searchText)
    
    startIndex = normalizedPage.indexOf(normalizedSearch)
    
    if (startIndex !== -1) {
      // Map back to original text positions
      // This is approximate - for exact mapping, we'd need character-by-character tracking
      // For now, we'll use the normalized position as a starting point
      const originalStart = findOriginalPosition(pageText, normalizedPage, startIndex)
      if (originalStart !== -1) {
        return {
          start: originalStart,
          end: originalStart + searchText.length,
        }
      }
    }
  }
  
  // Strategy 3: Fuzzy matching (find closest match)
  if (fuzzy) {
    const bestMatch = findFuzzyMatch(pageText, searchText)
    if (bestMatch) {
      return bestMatch
    }
  }
  
  return null
}

/**
 * Find the original position in the source text given a normalized position
 * This is a helper for mapping normalized positions back to original text
 */
function findOriginalPosition(originalText: string, normalizedText: string, normalizedPos: number): number {
  // Simple approach: count characters in normalized text up to position
  // Then find equivalent position in original text
  let normalizedCount = 0
  let originalCount = 0
  
  const normalizedSearch = normalizedText.substring(0, normalizedPos)
  const normalizedLength = normalizedSearch.length
  
  // Count normalized characters in original text
  for (let i = 0; i < originalText.length && normalizedCount < normalizedLength; i++) {
    const char = originalText[i].toLowerCase()
    if (char.match(/\s/)) {
      normalizedCount++
      originalCount++
    } else if (char.match(/[a-z0-9]/)) {
      normalizedCount++
      originalCount++
    } else if (char.match(/[.,!?;:]/)) {
      // Skip punctuation in normalized count
    } else {
      originalCount++
    }
  }
  
  return originalCount
}

/**
 * Find fuzzy match using Levenshtein distance for near-matches
 * Returns the best matching textSpan if found
 */
function findFuzzyMatch(pageText: string, searchText: string): { start: number; end: number } | null {
  const normalizedPage = normalizeTextForMatching(pageText)
  const normalizedSearch = normalizeTextForMatching(searchText)
  
  if (normalizedSearch.length < 10) {
    // Too short for fuzzy matching
    return null
  }
  
  // Try sliding window approach
  const windowSize = normalizedSearch.length
  const maxDistance = Math.floor(windowSize * 0.2) // Allow 20% character difference
  
  let bestMatch: { start: number; end: number; distance: number } | null = null
  
  for (let i = 0; i <= normalizedPage.length - windowSize; i++) {
    const window = normalizedPage.substring(i, i + windowSize)
    const distance = levenshteinDistance(window, normalizedSearch)
    
    if (distance <= maxDistance) {
      if (!bestMatch || distance < bestMatch.distance) {
        // Map back to original position
        const originalStart = findOriginalPosition(pageText, normalizedPage, i)
        if (originalStart !== -1) {
          bestMatch = {
            start: originalStart,
            end: originalStart + searchText.length,
            distance,
          }
        }
      }
    }
  }
  
  return bestMatch ? { start: bestMatch.start, end: bestMatch.end } : null
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = []
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i]
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1 // deletion
        )
      }
    }
  }
  
  return matrix[str2.length][str1.length]
}

/**
 * Get bounding box coordinates for a text span
 */
export function getHighlightCoordinates(
  textSpan: { start: number; end: number },
  textItems: TextItemWithCoords[],
  characterOffsets: Record<number, number>,
): { x: number; y: number; width: number; height: number } | null {
  if (textItems.length === 0) {
    return null
  }
  
  // Find text items that contain the span
  const startItemIndex = characterOffsets[textSpan.start]
  const endItemIndex = characterOffsets[textSpan.end - 1]
  
  if (startItemIndex === undefined || endItemIndex === undefined) {
    return null
  }
  
  const startItem = textItems[startItemIndex]
  const endItem = textItems[endItemIndex]
  
  if (!startItem || !endItem) {
    return null
  }
  
  // Calculate bounding box
  const minX = Math.min(startItem.x, endItem.x)
  const maxX = Math.max(startItem.x + startItem.width, endItem.x + endItem.width)
  const minY = Math.min(startItem.y, endItem.y)
  const maxY = Math.max(startItem.y + startItem.height, endItem.y + endItem.height)
  
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  }
}
