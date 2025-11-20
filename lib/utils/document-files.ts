type DocumentLike = {
  metadata?: Record<string, any> | null
  url?: string | null
  title?: string | null
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
  "jpg",
  "jpeg",
  "png",
  "gif",
  "svg",
])

function normalizeExtension(ext: string): string {
  if (ext === "htm") return "html"
  if (ext === "jpeg") return "jpg"
  return ext
}

export function getDocumentFileExtension(doc: DocumentLike): string {
  const metadata = doc.metadata || {}
  const contentType = String(metadata.contentType || "").toLowerCase()
  const typeValue = String(metadata.type || metadata.mime_type || contentType).toLowerCase()
  if (typeValue.includes("pdf")) return "pdf"
  if (typeValue.includes("msword")) return "doc"
  if (typeValue.includes("wordprocessingml") || typeValue.includes("word")) return "docx"
  if (typeValue.includes("html")) return "html"
  if (typeValue.includes("text/plain")) return "txt"
  if (typeValue.includes("text/markdown") || typeValue.includes("markdown")) return "md"
  if (typeValue.includes("spreadsheet") || typeValue.includes("excel") || typeValue.includes("sheet")) return "xlsx"
  if (typeValue.includes("presentation") || typeValue.includes("powerpoint") || typeValue.includes("slides")) return "pptx"
  if (typeValue.includes("image/jpeg") || typeValue.includes("jpeg")) return "jpg"
  if (typeValue.includes("image/png") || typeValue.includes("png")) return "png"
  if (typeValue.includes("image/gif") || typeValue.includes("gif")) return "gif"
  if (typeValue.includes("image/svg") || typeValue.includes("svg")) return "svg"

  if (contentType) {
    if (contentType.includes("application/pdf")) return "pdf"
    if (contentType.includes("application/msword")) return "doc"
    if (contentType.includes("wordprocessingml")) return "docx"
    if (contentType.includes("text/html")) return "html"
    if (contentType.includes("text/plain")) return "txt"
    if (contentType.includes("text/markdown")) return "md"
    if (contentType.includes("spreadsheet") || contentType.includes("excel") || contentType.includes("sheet")) return "xlsx"
    if (contentType.includes("presentation") || contentType.includes("powerpoint") || contentType.includes("slides")) return "pptx"
    if (contentType.includes("image/jpeg")) return "jpg"
    if (contentType.includes("image/png")) return "png"
    if (contentType.includes("image/gif")) return "gif"
    if (contentType.includes("image/svg")) return "svg"
  }

  const url = doc.url || doc.title || ""
  const filename = url.split("/").pop() || ""
  const ext = filename.split(".").pop()?.toLowerCase() || ""
  if (VALID_EXTENSIONS.has(ext)) {
    return normalizeExtension(ext)
  }

  return "file"
}


