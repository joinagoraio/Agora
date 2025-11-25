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
import type { TextItem } from "pdfjs-dist/types/src/display/api"

// Configure PDF.js worker (Next.js 16/Turbopack compatible)
if (typeof window === "undefined") {
  // Server-side: disable worker to avoid bundler issues
  pdfjs.GlobalWorkerOptions.workerSrc = ""
} else {
  // Client-side: use CDN worker
  pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`
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
 * Find the exact span of a quote within the document text.
 * Attempts a direct substring search first, then falls back to a normalized mapping
 * that ignores markdown/punctuation differences while still returning precise character indices.
 */
export function findTextSpan(
  pageText: string,
  searchText: string,
): { start: number; end: number } | null {
  if (!pageText || !searchText) {
    return null
  }

  const directIndex = pageText.indexOf(searchText)
  if (directIndex !== -1) {
    return { start: directIndex, end: directIndex + searchText.length }
  }

  const { normalized: normalizedPage, map } = buildNormalizedTextMap(pageText)
  const normalizedSearch = buildNormalizedString(searchText)

  if (!normalizedPage || !normalizedSearch) {
    return null
  }

  const normalizedIndex = normalizedPage.indexOf(normalizedSearch)
  if (normalizedIndex === -1) {
    return null
  }

  const normalizedEndIndex = normalizedIndex + normalizedSearch.length - 1
  if (
    normalizedIndex < 0 ||
    normalizedEndIndex >= map.length ||
    map[normalizedIndex] === undefined ||
    map[normalizedEndIndex] === undefined
  ) {
    return null
  }

  const start = map[normalizedIndex]
  const end = map[normalizedEndIndex] + 1
  return { start, end }
}

function buildNormalizedTextMap(text: string): { normalized: string; map: number[] } {
  const normalizedChars: string[] = []
  const map: number[] = []
  let lastWasSpace = false

  for (let i = 0; i < text.length; i++) {
    let char = text[i]

    if (char === "\u201c" || char === "\u201d") {
      char = '"'
    } else if (char === "\u2018" || char === "\u2019") {
      char = "'"
    }

    if (/\s/.test(char)) {
      if (normalizedChars.length === 0 || lastWasSpace) {
        continue
      }
      normalizedChars.push(" ")
      map.push(i)
      lastWasSpace = true
      continue
    }

    if (/[*_`~]/.test(char)) {
      continue
    }

    if (/[.,!?;:]/.test(char)) {
      continue
    }

    const lower = char.toLowerCase()
    normalizedChars.push(lower)
    map.push(i)
    lastWasSpace = false
  }

  return {
    normalized: normalizedChars.join(""),
    map,
  }
}

function buildNormalizedString(text: string): string {
  return buildNormalizedTextMap(text).normalized
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
