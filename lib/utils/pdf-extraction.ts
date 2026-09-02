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
