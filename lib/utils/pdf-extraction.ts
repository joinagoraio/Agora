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

// Configure PDF.js worker
if (typeof window === "undefined") {
  // Server-side: Use legacy build or disable worker
  // In server actions, we can't use require.resolve, so disable worker
  pdfjs.GlobalWorkerOptions.workerSrc = ""
} else {
  // Client-side: Use CDN or local worker
  pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`
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
export async function extractPdfPages(buffer: Buffer): Promise<PageData[]> {
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
 * Find text span in page text and return character positions
 */
export function findTextSpan(pageText: string, searchText: string): { start: number; end: number } | null {
  const normalizedPageText = pageText.toLowerCase()
  const normalizedSearchText = searchText.toLowerCase()
  
  const startIndex = normalizedPageText.indexOf(normalizedSearchText)
  if (startIndex === -1) {
    return null
  }
  
  return {
    start: startIndex,
    end: startIndex + searchText.length,
  }
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
