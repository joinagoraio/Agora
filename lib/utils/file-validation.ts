/**
 * File validation utilities
 * Validates file types by checking magic numbers (file signatures) in addition to MIME types
 */

// File magic numbers (first few bytes that identify file type)
const FILE_SIGNATURES: Record<string, number[][]> = {
  "application/pdf": [
    [0x25, 0x50, 0x44, 0x46], // %PDF
  ],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    // DOCX is a ZIP file, check for ZIP signature
    [0x50, 0x4b, 0x03, 0x04], // PK.. (ZIP)
    [0x50, 0x4b, 0x05, 0x06], // PK.. (ZIP empty)
    [0x50, 0x4b, 0x07, 0x08], // PK.. (ZIP spanned)
  ],
  "text/plain": [
    // Plain text files don't have a universal signature
    // We'll validate by checking for non-binary content
  ],
  "text/markdown": [
    // Markdown files are plain text, same as text/plain
  ],
}

/**
 * Read the first few bytes of a file to check its magic number
 */
async function readFileHeader(file: File, bytes: number = 8): Promise<Uint8Array> {
  const buffer = await file.slice(0, bytes).arrayBuffer()
  return new Uint8Array(buffer)
}

/**
 * Check if file header matches expected signature
 */
function matchesSignature(header: Uint8Array, signature: number[]): boolean {
  if (header.length < signature.length) {
    return false
  }
  return signature.every((byte, index) => header[index] === byte)
}

/**
 * Validate file type by checking magic number
 * Returns true if file signature matches expected type, false otherwise
 */
export async function validateFileMagicNumber(
  file: File,
  expectedMimeType: string,
): Promise<boolean> {
  const signatures = FILE_SIGNATURES[expectedMimeType]
  
  // If no signature defined (e.g., plain text), we can't validate by magic number
  // In this case, we'll do a basic check for binary content
  if (!signatures || signatures.length === 0) {
    if (expectedMimeType.startsWith("text/")) {
      // For text files, check that first bytes are printable ASCII/UTF-8
      const header = await readFileHeader(file, 512)
      // Check if all bytes are printable ASCII (0x20-0x7E) or common UTF-8 continuation bytes
      const isText = Array.from(header).every(
        (byte) =>
          (byte >= 0x20 && byte <= 0x7e) || // Printable ASCII
          byte === 0x09 || // Tab
          byte === 0x0a || // Newline
          byte === 0x0d || // Carriage return
          (byte >= 0xc0 && byte <= 0xf4), // UTF-8 start bytes
      )
      return isText
    }
    // For unknown types without signatures, we can't validate
    return true
  }

  // Check against all possible signatures for this MIME type
  const header = await readFileHeader(file, 8)
  return signatures.some((signature) => matchesSignature(header, signature))
}

/**
 * Get file type from magic number
 * Returns MIME type if detected, null otherwise
 */
export async function detectFileTypeFromMagicNumber(file: File): Promise<string | null> {
  const header = await readFileHeader(file, 8)

  // Check PDF
  if (matchesSignature(header, [0x25, 0x50, 0x44, 0x46])) {
    return "application/pdf"
  }

  // Check ZIP-based formats (DOCX, XLSX, PPTX, etc.)
  if (
    matchesSignature(header, [0x50, 0x4b, 0x03, 0x04]) ||
    matchesSignature(header, [0x50, 0x4b, 0x05, 0x06]) ||
    matchesSignature(header, [0x50, 0x4b, 0x07, 0x08])
  ) {
    // Check if it's a DOCX by looking for word/document.xml in the ZIP
    // For now, we'll return the generic ZIP type and let the caller check the extension
    // A more thorough check would require parsing the ZIP structure
    return "application/zip"
  }

  // Check for text files
  const isText = Array.from(header).every(
    (byte) =>
      (byte >= 0x20 && byte <= 0x7e) ||
      byte === 0x09 ||
      byte === 0x0a ||
      byte === 0x0d ||
      (byte >= 0xc0 && byte <= 0xf4),
  )
  if (isText) {
    // Could be text/plain or text/markdown - check extension
    const name = file.name.toLowerCase()
    if (name.endsWith(".md") || name.endsWith(".markdown")) {
      return "text/markdown"
    }
    return "text/plain"
  }

  return null
}

