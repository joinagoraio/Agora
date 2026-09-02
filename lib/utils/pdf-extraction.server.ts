import "server-only"

import { existsSync } from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"

import "./dommatrix-polyfill"
import type { PageData, TextItemWithCoords } from "@/lib/utils/pdf-extraction"

if (typeof Promise.withResolvers === "undefined") {
  ;(Promise as any).withResolvers = function <T>() {
    let resolve!: (value: T | PromiseLike<T>) => void
    let reject!: (reason?: any) => void
    const promise = new Promise<T>((res, rej) => {
      resolve = res
      reject = rej
    })
    return { promise, resolve, reject }
  }
}

function resolvePdfjsFile(relativePath: string) {
  const candidate = path.join(process.cwd(), "node_modules", "pdfjs-dist", relativePath)
  if (!existsSync(candidate)) {
    throw new Error(`pdfjs-dist file not found: ${relativePath}`)
  }
  return candidate
}

async function loadPdfjs() {
  const pdfSpecifier = pathToFileURL(resolvePdfjsFile("legacy/build/pdf.mjs")).href
  const workerSpecifier = pathToFileURL(resolvePdfjsFile("legacy/build/pdf.worker.mjs")).href
  const pdfjs = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ pdfSpecifier)
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = workerSpecifier
  }
  return pdfjs
}

async function extractTextItemsFromPage(page: {
  getTextContent: () => Promise<{ items: Array<{ str?: string; transform?: number[]; width?: number; height?: number; fontName?: string }> }>
  getViewport: (options: { scale: number }) => { height: number }
}): Promise<TextItemWithCoords[]> {
  const textContent = await page.getTextContent()
  const viewport = page.getViewport({ scale: 1.0 })
  const textItems: TextItemWithCoords[] = []

  for (const item of textContent.items) {
    if (item.str && item.transform) {
      const x = item.transform[4]
      const y = viewport.height - item.transform[5]
      textItems.push({
        text: item.str,
        x,
        y,
        width: item.width || 0,
        height: item.height || 0,
        fontSize: item.height || 12,
        fontName: item.fontName || "unknown",
      })
    }
  }

  return textItems
}

function buildCharacterOffsetMap(textItems: TextItemWithCoords[]): Record<number, number> {
  const offsets: Record<number, number> = {}
  let charIndex = 0

  textItems.forEach((item, itemIndex) => {
    for (let i = 0; i < item.text.length; i++) {
      offsets[charIndex] = itemIndex
      charIndex++
    }
    if (itemIndex < textItems.length - 1) {
      charIndex++
    }
  })

  return offsets
}

export async function extractPdfPages(buffer: Uint8Array | ArrayBuffer): Promise<PageData[]> {
  try {
    const pdfjs = await loadPdfjs()
    const uint8Array = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
    const loadingTask = pdfjs.getDocument({
      data: uint8Array,
      disableFontFace: true,
      isEvalSupported: false,
      useSystemFonts: true,
    })
    const pdf = await loadingTask.promise
    const pages: PageData[] = []

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum)
      const textItems = await extractTextItemsFromPage(page)
      pages.push({
        pageNumber: pageNum,
        textContent: textItems.map((item) => item.text).join(" "),
        textItems,
        characterOffsets: buildCharacterOffsetMap(textItems),
      })
    }

    return pages
  } catch (error) {
    console.warn("[PDF Extraction] Error extracting pages:", error)
    throw error
  }
}
