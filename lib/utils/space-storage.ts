export function isPlainTextSpaceDocument(opts: {
  title: string
  mimeType?: string | null
  fileName?: string | null
}) {
  const mime = (opts.mimeType ?? "").toLowerCase()
  const name = `${opts.fileName ?? ""} ${opts.title}`.toLowerCase()
  if (name.endsWith(".docx") || name.endsWith(".doc") || mime.includes("word") || mime.includes("msword")) {
    return false
  }
  return (
    mime.startsWith("text/") ||
    mime.includes("markdown") ||
    name.endsWith(".txt") ||
    name.endsWith(".md") ||
    name.endsWith(".markdown")
  )
}

export function isPdfSpaceDocument(opts: { mimeType?: string | null; fileName?: string | null; title: string }) {
  const mime = (opts.mimeType ?? "").toLowerCase()
  const name = `${opts.fileName ?? ""} ${opts.title}`.toLowerCase()
  return mime.includes("pdf") || name.endsWith(".pdf")
}

export function storagePathFromUrl(url: string, spaceId: string): string | null {
  try {
    const parsed = new URL(url, "http://local.invalid")
    for (const marker of ["/object/public/documents/", "/object/sign/documents/"]) {
      const index = parsed.pathname.indexOf(marker)
      if (index >= 0) {
        return decodeURIComponent(parsed.pathname.slice(index + marker.length).split("?")[0])
      }
    }
  } catch {
    // fall through
  }

  const needle = `spaces/${spaceId}/`
  const index = url.indexOf(needle)
  if (index >= 0) {
    return decodeURIComponent(url.slice(index).split("?")[0])
  }
  return null
}
