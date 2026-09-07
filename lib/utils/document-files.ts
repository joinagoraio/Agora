export type DocumentLike = {
  metadata?: Record<string, any> | null
  url?: string | null
  title?: string | null
  fileName?: string | null
  mimeType?: string | null
}

const VALID_EXTENSIONS = new Set([
  "pdf",
  "doc",
  "docx",
  "html",
  "htm",
  "txt",
  "md",
  "markdown",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "csv",
  "jpg",
  "jpeg",
  "png",
  "gif",
  "svg",
])

function normalizeExtension(ext: string): string {
  if (ext === "htm") return "html"
  if (ext === "jpeg") return "jpg"
  if (ext === "markdown") return "md"
  return ext
}

function extensionFromMime(typeValue: string): string | null {
  const value = typeValue.toLowerCase()
  if (!value) return null
  if (value.includes("pdf")) return "pdf"
  if (value.includes("msword")) return "doc"
  if (value.includes("wordprocessingml") || value.includes("google-apps.document") || value.includes("word")) {
    return "docx"
  }
  if (value.includes("html")) return "html"
  if (value.includes("text/plain") || value === "txt" || value === "text") return "txt"
  if (value.includes("text/markdown") || value.includes("markdown") || value === "md") return "md"
  if (value.includes("spreadsheet") || value.includes("excel") || value.includes("google-apps.spreadsheet") || value.includes("sheet")) {
    return "xlsx"
  }
  if (value.includes("presentation") || value.includes("powerpoint") || value.includes("google-apps.presentation") || value.includes("slides")) {
    return "pptx"
  }
  if (value.includes("image/jpeg") || value.includes("jpeg") || value === "jpg") return "jpg"
  if (value.includes("image/png") || value === "png") return "png"
  if (value.includes("image/gif") || value === "gif") return "gif"
  if (value.includes("image/svg") || value.includes("svg")) return "svg"
  return null
}

function extensionFromName(name: string): string | null {
  const filename = name.split("/").pop()?.split("?")[0] || ""
  const ext = filename.split(".").pop()?.toLowerCase() || ""
  if (ext && VALID_EXTENSIONS.has(ext)) {
    return normalizeExtension(ext)
  }
  return null
}

export function getDocumentFileExtension(doc: DocumentLike): string {
  const metadata = doc.metadata || {}
  const mimeCandidates = [
    doc.mimeType,
    metadata.contentType,
    metadata.content_type,
    metadata.mimeType,
    metadata.type,
    metadata.mime_type,
  ]

  for (const candidate of mimeCandidates) {
    const ext = extensionFromMime(String(candidate || ""))
    if (ext) return ext
  }

  const nameCandidates = [
    doc.fileName,
    metadata.filename,
    metadata.file_name,
    metadata.originalName,
    doc.url,
    doc.title,
  ]

  for (const candidate of nameCandidates) {
    const ext = extensionFromName(String(candidate || ""))
    if (ext) return ext
  }

  return "file"
}
