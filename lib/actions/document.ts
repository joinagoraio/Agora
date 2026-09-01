"use server"

// Import polyfill FIRST before any PDF-related imports
import "@/lib/utils/dommatrix-polyfill"

import { randomUUID } from "node:crypto"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { revalidatePath } from "next/cache"
import { logger } from "@/lib/utils/logger"
// PDF extraction now handled by pdf2json directly
import { getRelevantContext, getAllWorkspaceKnowledge } from "@/lib/rag/search"
import { extractPdfPages } from "@/lib/utils/pdf-extraction"
import { compileSystemPrompt } from "@/lib/chat/playbook-compiler"
import { recordGenerationRun, computeUnusedDocumentIds } from "@/lib/actions/generation-run"
import { getLatestPlaybookBody } from "@/lib/actions/playbook"
import { parseProgrammeBindings } from "@/lib/programme/domain"
import OpenAI from "openai"
import { env } from "@/lib/env"
import MarkdownIt from "markdown-it"
import markdownItFootnote from "markdown-it-footnote"
import { requireAuthAndPermission } from "@/lib/middleware/authorization"
import { invalidateCacheByTag } from "@/lib/cache/api-cache"
const markdownParser = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
}).use(markdownItFootnote)

function markdownToHtml(markdown: string): string {
  if (!markdown || markdown.trim().length === 0) {
    return ""
  }

  try {
    return markdownParser.render(markdown)
  } catch (error) {
    logger.error("[WorkspaceDocument] Failed to convert markdown to HTML:", error)
    // Fallback: wrap plain text in paragraph tags
    const escaped = markdown
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;")
    return `<p>${escaped}</p>`
  }
}

// Helper function to strip markdown syntax for better AI processing
function stripMarkdown(text: string): string {
  if (!text) return text
  
  // Remove markdown headers
  text = text.replace(/^#{1,6}\s+/gm, '')
  // Remove bold/italic
  text = text.replace(/\*\*([^*]+)\*\*/g, '$1')
  text = text.replace(/\*([^*]+)\*/g, '$1')
  text = text.replace(/__([^_]+)__/g, '$1')
  text = text.replace(/_([^_]+)_/g, '$1')
  // Remove links but keep text
  text = text.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
  // Remove code blocks
  text = text.replace(/```[\s\S]*?```/g, '')
  text = text.replace(/`([^`]+)`/g, '$1')
  // Remove images
  text = text.replace(/!\[([^\]]*)\]\([^\)]+\)/g, '')
  // Remove horizontal rules
  text = text.replace(/^---$/gm, '')
  text = text.replace(/^\*\*\*$/gm, '')
  // Remove list markers
  text = text.replace(/^[\*\-\+]\s+/gm, '')
  text = text.replace(/^\d+\.\s+/gm, '')
  // Remove blockquotes
  text = text.replace(/^>\s+/gm, '')
  
  return text.trim()
}

// Helper function to generate a concise AI summary of document content
export async function generateDocumentSummary(content: string, title?: string, isMarkdown = false): Promise<string> {
  // Only use AI if OpenAI is configured and content is substantial
  if (!env.OPENAI_API_KEY || !content || content.length < 100) {
    // Fallback: return first 150 characters
    const fallback = content.substring(0, 150).trim() + (content.length > 150 ? "..." : "")
    return isMarkdown ? stripMarkdown(fallback) : fallback
  }

  try {
    const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY })
    
    // For markdown, strip syntax for better AI understanding
    let processedContent = isMarkdown ? stripMarkdown(content) : content
    
    // Take a sample of the content (first 2000 chars for efficiency)
    const contentSample = processedContent.substring(0, 2000)
    
    logger.info("[Upload] Generating summary", {
      documentType: isMarkdown ? "markdown" : "document",
      contentLength: content.length,
      processedLength: processedContent.length,
    })
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Use cheaper model for summarization
      messages: [
        {
          role: "system",
          content: `You are a document summarization assistant. Create a concise, informative summary of the document content.

Rules:
- Write 1-2 sentences (max 150 characters)
- Focus on the main topic, purpose, or key information
- Use clear, professional language
- If the document title is provided, incorporate it naturally
- Do not include meta-commentary like "This document discusses..." - just state the information directly
${isMarkdown ? "- The content is from a markdown file - focus on the actual information, not the formatting" : ""}

Examples:
- "Security audit findings and recommendations for code quality improvements."
- "Municipal policy guidelines for public space management and maintenance procedures."
- "Annual budget report with financial projections and expenditure analysis."`
        },
        {
          role: "user",
          content: title 
            ? `Document title: ${title}\n\nContent:\n${contentSample}`
            : `Content:\n${contentSample}`
        }
      ],
      max_tokens: 60, // Limit to keep it concise
      temperature: 0.3, // Lower temperature for more consistent results
    })

    const summary = response.choices[0]?.message?.content?.trim()
    if (summary && summary.length > 0 && summary.length <= 200) {
      logger.debug("[Upload] Generated AI summary", { preview: summary.substring(0, 100) })
      return summary
    }
  } catch (error) {
    logger.error("[Upload] Error generating summary:", error)
  }

  // Fallback: return first 150 characters (strip markdown if needed)
  const fallback = content.substring(0, 150).trim() + (content.length > 150 ? "..." : "")
  return isMarkdown ? stripMarkdown(fallback) : fallback
}

// Helper function to sanitize content for PostgreSQL
function sanitizeContentForDatabase(content: string): string {
  if (!content) return content
  
  // Remove null bytes (PostgreSQL doesn't like them)
  content = content.replace(/\0/g, '')
  
  // Remove invalid Unicode escape sequences
  // Fix \u sequences that aren't followed by exactly 4 hex digits
  content = content.replace(/\\u(?![\da-fA-F]{4})/g, 'u')
  
  // Remove other invalid escape sequences (keep valid ones)
  content = content.replace(/\\(?![nrtbf\\'"xu0-7])/g, '')
  
  // Remove any remaining control characters except newlines, tabs, carriage returns
  content = content.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '')
  
  return content
}

export async function getDocumentPages(documentId: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { data: [], error: "Unauthorized" }
  }

  // Verify user has access to the document
  const { data: document } = await supabase
    .from("documents")
    .select("id, workspace_id")
    .eq("id", documentId)
    .single()

  if (!document) {
    return { data: [], error: "Document not found" }
  }

  // Fetch pages
  const { data, error } = await supabase
    .from("document_pages")
    .select("*")
    .eq("document_id", documentId)
    .order("page_number", { ascending: true })

  if (error) {
    return { data: [], error: error.message }
  }

  return { data: data || [] }
}

export async function getWorkspaceDocuments(workspaceId: string, includeArchived = false) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { data: [], error: "Unauthorized" }
  }

  let query = supabase
    .from("documents")
    .select("*, sources(type, name)")
    .eq("workspace_id", workspaceId)
    .neq("status", "deleted") // Exclude deleted documents

  if (!includeArchived) {
    query = query.neq("status", "archived") // Exclude archived documents by default
  }

  const { data, error } = await query.order("created_at", { ascending: false })

  if (error) {
    return { data: [], error: error.message }
  }

  return { data }
}

export async function getArchivedDocumentCount(workspaceId: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { count: 0, error: "Unauthorized" }
  }

  // Get archived documents, then filter out inherited ones
  const { data, error } = await supabase
    .from("documents")
    .select("metadata")
    .eq("workspace_id", workspaceId)
    .eq("status", "archived")

  if (error) {
    return { count: 0, error: error.message }
  }

  // Filter out inherited documents (origin: space_scope)
  const nonInheritedCount = (data || []).filter((doc: any) => {
    const metadata = doc?.metadata
    if (!metadata || typeof metadata !== "object") {
      return true // Include if no metadata
    }
    const origin = (metadata as Record<string, any>).origin
    return origin !== "space_scope" // Exclude inherited documents
  }).length

  return { count: nonInheritedCount }
}

export async function deleteDocument(documentId: string, workspaceId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const adminClient = createAdminClient()

  // Authorization check before admin operation
  try {
    await requireAuthAndPermission("workspace:delete", { workspaceId })
  } catch (authError) {
    return { error: authError instanceof Error ? authError.message : "Unauthorized" }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  // Get document to check workspace and get file path
  const { data: document, error: fetchError } = await adminClient
    .from("documents")
    .select("*, sources(type)")
    .eq("id", documentId)
    .eq("workspace_id", workspaceId)
    .single()

  if (fetchError || !document) {
    return { error: "Document not found" }
  }

  // Soft delete: set status to 'deleted'
  const { error: deleteError } = await adminClient
    .from("documents")
    .update({ status: "deleted", updated_at: new Date().toISOString() })
    .eq("id", documentId)

  if (deleteError) {
    return { error: deleteError.message }
  }

  // If it's a direct upload, also delete the file from storage
  if (document.sources?.type === "direct_upload" && document.url) {
    try {
      // Extract file path from URL
      const urlParts = document.url.split("/documents/")
      if (urlParts.length > 1) {
        const filePath = urlParts[1].split("?")[0]
        await adminClient.storage.from("documents").remove([filePath])
      }
    } catch (storageError) {
      logger.error("[Delete] Failed to remove file from storage:", storageError)
      // Don't fail the delete operation if storage cleanup fails
    }
  }

  revalidatePath(`/workspaces/${workspaceId}`)
  
  // Invalidate search cache for this workspace
  await invalidateCacheByTag(`search:workspace:${workspaceId}`)
  
  return {}
}

export async function archiveDocument(documentId: string, workspaceId: string, archive: boolean): Promise<{ error?: string }> {
  const supabase = await createClient()
  const adminClient = createAdminClient()

  // Authorization check before admin operation
  try {
    await requireAuthAndPermission("workspace:update", { workspaceId })
  } catch (authError) {
    return { error: authError instanceof Error ? authError.message : "Unauthorized" }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  // Verify document belongs to workspace
  const { data: document, error: fetchError } = await adminClient
    .from("documents")
    .select("id")
    .eq("id", documentId)
    .eq("workspace_id", workspaceId)
    .single()

  if (fetchError || !document) {
    return { error: "Document not found" }
  }

  // Update status: archive = 'archived', unarchive = 'active'
  const { error: updateError } = await adminClient
    .from("documents")
    .update({ 
      status: archive ? "archived" : "active",
      updated_at: new Date().toISOString()
    })
    .eq("id", documentId)

  if (updateError) {
    return { error: updateError.message }
  }

  revalidatePath(`/workspaces/${workspaceId}`)
  
  // Invalidate search cache for this workspace
  await invalidateCacheByTag(`search:workspace:${workspaceId}`)
  
  return {}
}

export async function uploadDocument(
  workspaceId: string,
  file: File,
  title?: string,
  classification?: "public" | "internal" | "confidential",
): Promise<{ data?: any; error?: string }> {
  const supabase = await createClient()
  const adminClient = createAdminClient()

  // Authorization check before admin operation
  try {
    await requireAuthAndPermission("workspace_item:create", { workspaceId })
  } catch (authError) {
    return { error: authError instanceof Error ? authError.message : "Unauthorized" }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  // Create or get a "direct_upload" source for this workspace
  let { data: source } = await adminClient
    .from("sources")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("type", "direct_upload")
    .maybeSingle()

  if (!source) {
    const { data: newSource, error: sourceError } = await adminClient
      .from("sources")
      .insert({
        workspace_id: workspaceId,
        name: "Direct Uploads",
        type: "direct_upload",
        config: {},
        created_by: user.id,
        status: "active",
      })
      .select()
      .single()

    if (sourceError || !newSource) {
      logger.error("[Upload] Source creation error:", sourceError)
      return { 
        error: `Failed to create upload source: ${sourceError?.message || "Unknown error"}. Make sure you've run the database migration to add 'direct_upload' source type.` 
      }
    }
    source = newSource
  }

  // Upload file to Supabase Storage using admin client to bypass RLS
  const fileExt = file.name.split(".").pop()
  const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`
  const filePath = `workspaces/${workspaceId}/${fileName}`

  const { error: uploadError } = await adminClient.storage.from("documents").upload(filePath, file, {
    cacheControl: "3600",
    upsert: false,
  })

  if (uploadError) {
    return { error: `Upload failed: ${uploadError.message}` }
  }

  // Get public URL using admin client
  const {
    data: { publicUrl },
  } = adminClient.storage.from("documents").getPublicUrl(filePath)

  // Extract text content from file
  let content = ""
  let pdfPages: any[] = [] // Declare outside to use after document creation
  let isMarkdownFile = false
  
  // Check if file is markdown (by extension or MIME type)
  if (file.name.toLowerCase().endsWith(".md") || 
      file.name.toLowerCase().endsWith(".markdown") ||
      file.type === "text/markdown") {
    isMarkdownFile = true
  }
  
  if (file.type === "text/plain" || file.type === "text/markdown" || isMarkdownFile) {
    content = await file.text()
  } else if (file.type === "application/pdf") {
    logger.info("[Upload] Processing PDF file", { name: file.name, size: file.size })
    try {
      // Convert File to ArrayBuffer for PDF parsing
      const arrayBuffer = await file.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      logger.debug("[Upload] Converted PDF to buffer", { size: buffer.length })
      
      try {
        logger.debug("[Upload] Extracting structured PDF data with pdfjs", { name: file.name })
        const extractedPages = await extractPdfPages(arrayBuffer)
        if (extractedPages && extractedPages.length > 0) {
          pdfPages = extractedPages.map((page) => ({
            pageNumber: page.pageNumber,
            textContent: sanitizeContentForDatabase(page.textContent || ""),
            textItems: page.textItems,
            characterOffsets: page.characterOffsets,
          }))
          if (!content?.trim()) {
            content = pdfPages.map((page) => page.textContent).join("\n\n")
          }
          logger.debug("[Upload] Structured PDF extraction complete", {
            pages: pdfPages.length,
          })
        }
      } catch (structuredError) {
        logger.warn(
          "[Upload] Structured PDF extraction failed (falling back to pdf2json)",
          structuredError instanceof Error ? { message: structuredError.message } : { structuredError },
        )
      }
      
      if (pdfPages.length === 0) {
        // Use pdf2json - a pure Node.js library with no worker dependencies
        logger.debug("[Upload] Extracting PDF content with pdf2json...")
        const PDFParser = (await import("pdf2json")).default
        
        // pdf2json is event-based, so we need to wrap it in a promise
        const pdfData = await new Promise<string>((resolve, reject) => {
          const pdfParser = new PDFParser(null, true) // true = verbose mode
          
          pdfParser.on("pdfParser_dataError", (errData: any) => {
            reject(new Error(errData.parserError))
          })
          
          pdfParser.on("pdfParser_dataReady", () => {
            try {
              const text = pdfParser.getRawTextContent() || ""
              resolve(text)
            } catch (err) {
              reject(err)
            }
          })
          
          // Parse the buffer
          pdfParser.parseBuffer(buffer)
        })
        
        content = pdfData || ""
        
        // Sanitize content to remove invalid Unicode escape sequences
        // PostgreSQL doesn't like certain escape sequences in text fields
        // Remove invalid \u escape sequences (must be followed by exactly 4 hex digits)
        content = content.replace(/\\u(?![\da-fA-F]{4})/g, 'u')
        
        // Remove other invalid escape sequences (keep only valid ones: \n, \r, \t, \\, etc.)
        content = content.replace(/\\(?![nrtbf\\'"xu0-7])/g, '')
        
        // Fix any remaining invalid \u sequences that might have partial hex
        content = content.replace(/\\u([0-9a-fA-F]{0,3})(?![0-9a-fA-F])/g, (match, hex) => {
          // If we have a partial hex sequence, try to convert it or remove it
          if (hex.length === 0) return 'u'
          if (hex.length < 4) return hex // Just return the hex digits without the \u
          return match // Keep valid 4-digit sequences
        })
        
        logger.debug("[Upload] pdf2json extraction complete", { contentLength: content.length })
        
        // Extract page data for document_pages table
        // pdf2json doesn't provide page-by-page text easily, so we'll create a single page entry
        // or split by form feeds if present
        try {
          const pages = content.split(/\f/) // Form feed character separates pages
          
          pdfPages = pages.map((pageText: string, index: number) => ({
            pageNumber: index + 1,
            textContent: sanitizeContentForDatabase(pageText.trim()),
            textItems: [],
            characterOffsets: {},
          }))
          
          // If no form feeds, create a single page
          if (pdfPages.length === 1 && !content.includes('\f')) {
            pdfPages = [{
              pageNumber: 1,
              textContent: sanitizeContentForDatabase(content),
              textItems: [],
              characterOffsets: {},
            }]
          }
          
          logger.debug("[Upload] Extracted pages from PDF", { pages: pdfPages.length })
        } catch (pageError) {
          logger.warn(
            "[Upload] Could not extract page data (non-critical)",
            pageError instanceof Error ? { message: pageError.message } : { message: String(pageError) },
          )
          // Create a single page entry as fallback
          pdfPages = [{
            pageNumber: 1,
            textContent: sanitizeContentForDatabase(content),
            textItems: [],
            characterOffsets: {},
          }]
        }
      }
      
      // If no text was extracted, it's likely a scanned/image-based PDF - use OCR
      if (!content.trim()) {
        logger.info("[Upload] No text found in PDF, attempting OCR...")
        
        try {
          const { createWorker } = await import("tesseract.js")
          const worker = await createWorker("eng") // English language
          
          // Tesseract can process PDFs directly
          const { data: ocrData } = await worker.recognize(buffer)
          content = ocrData.text || ""
          
          await worker.terminate()
          
          if (!content.trim()) {
            content = "[PDF appears to be image-based but OCR did not extract any text. The document may be too low quality or contain only images.]"
          } else {
            logger.debug("[Upload] OCR extracted content from scanned PDF", { contentLength: content.length })
          }
        } catch (ocrError) {
          logger.error("[Upload] OCR error:", ocrError)
          content = `[Failed to perform OCR on PDF: ${ocrError instanceof Error ? ocrError.message : "Unknown error"}]`
        }
      }
    } catch (error) {
      logger.error("[Upload] PDF parsing error:", error)
      logger.error("[Upload] Error details:", error instanceof Error ? error.stack : String(error))
      content = `[Failed to extract PDF content: ${error instanceof Error ? error.message : "Unknown error"}]`
    }
  } else if (
    file.type ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    logger.info("[Upload] Processing Word document (.docx)", { name: file.name, size: file.size })
    try {
      // Convert File to ArrayBuffer, then to Buffer for Word parsing
      // In server-side Node.js context, mammoth expects { buffer: Buffer }
      const arrayBuffer = await file.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      logger.debug("[Upload] Converted Word document to buffer", { size: buffer.length })
      
      // Use mammoth to extract text content from Word document
      const mammoth = await import("mammoth")
      const result = await mammoth.extractRawText({ buffer })
      
      content = result.value || ""
      
      if (result.messages.length > 0) {
        logger.warn("[Upload] Word document conversion warnings:", { warnings: result.messages })
      }
      
      if (!content.trim()) {
        logger.warn("[Upload] Word document appears empty or lacks extractable text")
        content = "[Word document appears to be empty or contains only images/formatting that could not be extracted as text]"
      } else {
        logger.debug("[Upload] Extracted characters from Word document", { contentLength: content.length })
      }
    } catch (error) {
      logger.error("[Upload] Word document parsing error:", error)
      content = `[Failed to extract Word document content: ${error instanceof Error ? error.message : "Unknown error"}]`
    }
  } else if (file.type === "application/msword") {
    // Older .doc format - mammoth doesn't support it, but we can try to provide a helpful message
    logger.info("[Upload] Processing Word document (.doc)", { name: file.name, size: file.size })
    content = "[Word document (.doc) format is not supported. Please convert to .docx format for content extraction.]"
  } else {
    content = await file.text().catch(() => "[Binary file - content extraction not available]")
  }

  // Get workspace to derive tenant_id
  const { data: workspace } = await adminClient
    .from("workspaces")
    .select("space_id")
    .eq("id", workspaceId)
    .single()

  // Generate concise AI summary for the document card
  const documentTitle = title || file.name
  let documentSummary = ""
  
  // Check if content extraction failed or file is binary
  const binaryFileMessage = "[Binary file - content extraction not available]"
  const isBinaryOrFailed = 
    !content || 
    content.startsWith("[Failed") || 
    content.startsWith("[Binary") ||
    content === binaryFileMessage ||
    content.trim() === binaryFileMessage.trim()
  
  logger.debug("[Upload] Content check", {
    contentLength: content?.length || 0,
    contentPreview: content?.substring(0, 50) || "empty",
    isBinaryOrFailed,
    fileName: file.name,
    fileType: file.type,
  })
  
  if (!isBinaryOrFailed && content.length > 100) {
    // Content was successfully extracted - generate AI summary
    documentSummary = await generateDocumentSummary(content, documentTitle, isMarkdownFile)
  } else if (isBinaryOrFailed) {
    // Binary file or extraction failed - create a descriptive summary based on file type
    const fileNameParts = file.name.split(".")
    const fileExt = fileNameParts.length > 1 ? fileNameParts.pop()?.toLowerCase() : ""
    
    const fileTypeMap: Record<string, string> = {
      "jpg": "Image file (JPEG)",
      "jpeg": "Image file (JPEG)",
      "png": "Image file (PNG)",
      "gif": "Image file (GIF)",
      "svg": "Image file (SVG)",
      "webp": "Image file (WebP)",
      "bmp": "Image file (BMP)",
      "tiff": "Image file (TIFF)",
      "zip": "Archive file (ZIP)",
      "rar": "Archive file (RAR)",
      "7z": "Archive file (7Z)",
      "tar": "Archive file (TAR)",
      "gz": "Archive file (GZIP)",
      "xlsx": "Spreadsheet file (Excel)",
      "xls": "Spreadsheet file (Excel)",
      "pptx": "Presentation file (PowerPoint)",
      "ppt": "Presentation file (PowerPoint)",
      "doc": "Word document (legacy format)",
    }
    
    // Also check MIME type as fallback
    let fileTypeDescription = fileTypeMap[fileExt || ""]
    if (!fileTypeDescription && file.type) {
      if (file.type.startsWith("image/")) {
        fileTypeDescription = `Image file (${file.type.split("/")[1].toUpperCase()})`
      } else if (file.type.startsWith("application/zip") || file.type.includes("archive")) {
        fileTypeDescription = "Archive file"
      } else if (file.type.includes("spreadsheet") || file.type.includes("excel")) {
        fileTypeDescription = "Spreadsheet file"
      } else if (file.type.includes("presentation") || file.type.includes("powerpoint")) {
        fileTypeDescription = "Presentation file"
      }
    }
    
    if (!fileTypeDescription) {
      fileTypeDescription = fileExt ? `File (${fileExt.toUpperCase()})` : "Binary file"
    }
    
    documentSummary = `${fileTypeDescription}. Content extraction not available for this file type.`
    
    logger.warn("[Upload] Binary/unsupported file detected", {
      fileName: file.name,
      fileExt,
      fileType: file.type,
      summary: documentSummary,
    })
  } else {
    // Short content - use as-is (already concise)
    documentSummary = content.substring(0, 150).trim() + (content.length > 150 ? "..." : "")
    if (isMarkdownFile) {
      documentSummary = stripMarkdown(documentSummary)
    }
  }

  // Ensure we have a summary (fallback if somehow none was generated)
  if (!documentSummary || documentSummary.trim().length === 0) {
    documentSummary = "Document uploaded. Content preview not available."
    logger.warn("[Upload] No summary generated, using fallback")
  }
  
  // Ensure summary doesn't contain the binary file error message
  if (documentSummary.includes("[Binary file - content extraction not available]")) {
    const fileExt = file.name.split(".").pop()?.toLowerCase() || "unknown"
    documentSummary = `File (${fileExt.toUpperCase()}). Content extraction not available for this file type.`
    logger.warn("[Upload] Summary contained binary error message, replaced with file type description")
  }
  
  logger.info("[Upload] Final document summary", { preview: documentSummary.substring(0, 100) })

  // Create document record
  // Store AI summary in content field for card display
  // Full content will be stored in document_pages for RAG/search
  const { data: document, error: docError } = await adminClient
    .from("documents")
    .insert({
      source_id: source!.id, // Safe to use ! here since we created source above
      workspace_id: workspaceId,
      tenant_id: workspace?.space_id || null, // Denormalized for RLS performance
      external_id: fileName,
      title: documentTitle,
      content: sanitizeContentForDatabase(documentSummary), // Store AI-generated summary for card display
      url: publicUrl,
      status: "active", // Set status to active for new uploads
      classification: classification || "internal", // Default to internal
      metadata: {
        filename: file.name,
        size: file.size,
        type: file.type,
        uploaded_at: new Date().toISOString(),
      },
    })
    .select()
    .single()

  if (docError) {
    // Clean up uploaded file if document creation fails
    await adminClient.storage.from("documents").remove([filePath])
    return { error: `Failed to create document: ${docError.message}` }
  }

  // Store PDF pages if we extracted them, or create from content if we have content but no pages
  if (file.type === "application/pdf") {
    if (pdfPages && pdfPages.length > 0) {
      // Store pages with coordinate data
      try {
        logger.debug("[Upload] Preparing to store PDF pages", {
          pages: pdfPages.length,
          documentId: document.id,
        })
        const pageInserts = pdfPages.map((page) => ({
          document_id: document.id,
          page_number: page.pageNumber ?? page.page_number,
          text_content: sanitizeContentForDatabase(page.textContent ?? page.text_content ?? ""),
          text_items: page.textItems ?? page.text_items ?? [],
          character_offsets: page.characterOffsets ?? page.character_offsets ?? {},
        }))

        logger.debug("[Upload] Inserting page records", { count: pageInserts.length, documentId: document.id })
        const { error: pagesError } = await adminClient
          .from("document_pages")
          .insert(pageInserts)

        if (pagesError) {
          logger.error("[Upload] Failed to store document pages:", pagesError)
          logger.error("[Upload] Pages error details:", {
            message: pagesError.message,
            details: pagesError.details,
          })
        } else {
          logger.debug("[Upload] Stored document pages", { count: pageInserts.length, documentId: document.id })
        }
      } catch (pagesError) {
        logger.error("[Upload] Error storing document pages:", pagesError)
        logger.error(
          "[Upload] Pages error stack:",
          pagesError instanceof Error ? pagesError.stack : String(pagesError),
        )
      }
    } else if (content && content.trim() && !content.startsWith("[Failed")) {
      // We have content but no pages - create a single page record from the content
      // This ensures the content is available for chat context
      try {
        logger.debug("[Upload] Creating page record from extracted content", { contentLength: content.length })
        const { error: pageError } = await adminClient
          .from("document_pages")
          .insert({
            document_id: document.id,
            page_number: 1,
            text_content: sanitizeContentForDatabase(content.substring(0, 100000)), // Limit and sanitize to reasonable size
            text_items: [],
            character_offsets: {},
          })

        if (pageError) {
          logger.error("[Upload] Failed to store content as page:", pageError)
        } else {
          logger.debug("[Upload] Stored extracted content as page", { documentId: document.id })
        }
      } catch (pageError) {
        logger.error("[Upload] Error storing content as page:", pageError)
      }
    } else {
      logger.warn("[Upload] PDF lacked pages/content post-processing", {
        pages: pdfPages ? pdfPages.length : null,
        contentLength: content?.length || 0,
      })
    }
  } else if (
    // Store text/markdown files as pages for highlighting support
    file.type === "text/plain" ||
    file.type === "text/markdown" ||
    file.name.toLowerCase().endsWith(".md") ||
    file.name.toLowerCase().endsWith(".txt") ||
    file.name.toLowerCase().endsWith(".markdown")
  ) {
    // Create a single page record for text/markdown files
    // This enables text span highlighting in the document viewer
    if (content && content.trim() && !content.startsWith("[Failed") && !content.startsWith("[Binary")) {
      try {
      logger.debug("[Upload] Creating page record for text/markdown file", { contentLength: content.length })
        const { error: pageError } = await adminClient
          .from("document_pages")
          .insert({
            document_id: document.id,
            page_number: 1,
            text_content: sanitizeContentForDatabase(content.substring(0, 100000)), // Limit and sanitize to reasonable size
            text_items: [],
            character_offsets: {},
          })

        if (pageError) {
          logger.error("[Upload] Failed to store text/markdown content as page:", pageError)
        } else {
          logger.debug("[Upload] Stored text/markdown content as page", { documentId: document.id })
        }
      } catch (pageError) {
        logger.error("[Upload] Error storing text/markdown content as page:", pageError)
      }
    }
  }

  revalidatePath(`/workspaces/${workspaceId}`)
  return { data: document }
}

export async function addDocumentsFromSource(
  workspaceId: string,
  sourceId: string,
  documents: Array<{
    title: string
    identifier: string
    type: string
    date?: string
    description?: string
    url?: string
  }>,
  classification?: "public" | "internal" | "confidential",
): Promise<{ data?: any[]; error?: string; addedCount?: number }> {
  const supabase = await createClient()
  const adminClient = createAdminClient()
  const { cleanOverheidDescription } = await import("@/lib/utils")

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  // Verify source belongs to workspace and get source type
  const { data: source, error: sourceError } = await supabase
    .from("sources")
    .select("id, workspace_id, type")
    .eq("id", sourceId)
    .eq("workspace_id", workspaceId)
    .single()

  if (sourceError || !source) {
    return { error: "Source not found or access denied" }
  }

  const sourceType = source.type

  let addedCount = 0
  const addedDocuments: any[] = []
  const errors: string[] = []

  for (const doc of documents) {
    let filePath: string | null = null
    let publicUrl: string | null = doc.url || null
    // Clean description before using it
    const cleanedDescription = cleanOverheidDescription(doc.description)
    let content = cleanedDescription || doc.title || ""

    // If URL is provided, fetch and store the document
    if (doc.url) {
      try {
        // Fetch the document from the URL
        const response = await fetch(doc.url)
        if (!response.ok) {
          logger.error(`[AddFromSource] Failed to fetch ${doc.url}: ${response.statusText}`)
          // Continue with metadata only if fetch fails
        } else {
          const contentType = response.headers.get("content-type") || ""
          const blob = await response.blob()
          
          // Determine file extension from content type or URL
          let fileExt = "pdf"
          if (contentType.includes("pdf")) {
            fileExt = "pdf"
          } else if (contentType.includes("html")) {
            fileExt = "html"
          } else if (contentType.includes("text")) {
            fileExt = "txt"
          } else {
            // Try to get extension from URL
            const urlMatch = doc.url.match(/\.([a-z0-9]+)(?:\?|$)/i)
            if (urlMatch) {
              fileExt = urlMatch[1]
            }
          }

          // Upload to storage bucket
          const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}_${doc.identifier || doc.title.replace(/[^a-z0-9]/gi, "_")}.${fileExt}`
          filePath = `workspaces/${workspaceId}/${fileName}`

          const { error: uploadError } = await adminClient.storage
            .from("documents")
            .upload(filePath, blob, {
              cacheControl: "3600",
              upsert: false,
            })

          if (uploadError) {
            logger.error(`[AddFromSource] Failed to upload ${doc.url}:`, uploadError)
            // Continue with metadata only if upload fails
          } else {
            // Get public URL
            const {
              data: { publicUrl: storageUrl },
            } = adminClient.storage.from("documents").getPublicUrl(filePath)
            publicUrl = storageUrl

            // Extract text content if it's a text-based file
            if (contentType.includes("text") || contentType.includes("html")) {
              try {
                const htmlText = await blob.text()
                // If it's HTML, extract text content by removing HTML tags
                if (contentType.includes("html")) {
                  // Use a simple HTML tag removal approach
                  // Remove script and style tags and their content
                  content = htmlText
                    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
                    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
                    .replace(/<[^>]+>/g, " ") // Remove HTML tags
                    .replace(/\s+/g, " ") // Normalize whitespace
                    .trim()
                  
                  // If we didn't get meaningful content, fall back to cleaned description/title
                  if (!content || content.length < 50) {
                    content = cleanedDescription || doc.title || ""
                  }
                } else {
                  content = htmlText
                }
              } catch (e) {
                logger.error(`[AddFromSource] Failed to extract text from ${doc.url}:`, e)
              }
            } else if (contentType.includes("pdf")) {
              try {
                // Convert Blob to ArrayBuffer for PDF parsing
                const arrayBuffer = await blob.arrayBuffer()
                const buffer = Buffer.from(arrayBuffer)
                
                // pdf-parse is a CommonJS module, use require for better compatibility
                let pdfParse: any
                try {
                  pdfParse = require("pdf-parse")
                } catch (requireError) {
                  // Fallback to ES module import
                  const pdfParseModule = await import("pdf-parse")
                  pdfParse = (pdfParseModule as any).default || pdfParseModule
                }
                
                if (typeof pdfParse !== 'function') {
                  throw new Error("pdfParse is not a function")
                }
                
                const pdfData = await pdfParse(buffer)
                content = pdfData.text || cleanedDescription || doc.title || ""
              } catch (e) {
                logger.error(`[AddFromSource] Failed to parse PDF from ${doc.url}:`, e)
                content = cleanedDescription || doc.title || ""
              }
            } else if (
              contentType.includes("wordprocessingml") ||
              contentType.includes("msword") ||
              contentType.includes("application/vnd.openxmlformats-officedocument.wordprocessingml.document") ||
              contentType.includes("application/msword")
            ) {
              try {
                // Convert Blob to ArrayBuffer, then to Buffer for Word parsing
                // In server-side Node.js context, mammoth expects { buffer: Buffer }
                const arrayBuffer = await blob.arrayBuffer()
                const buffer = Buffer.from(arrayBuffer)
                
                // Use mammoth to extract text content from Word document
                const mammoth = await import("mammoth")
                
                // Check if it's .docx (supported) or .doc (not supported by mammoth)
                if (contentType.includes("wordprocessingml") || contentType.includes("application/vnd.openxmlformats-officedocument.wordprocessingml.document")) {
                  const result = await mammoth.extractRawText({ buffer })
                  content = result.value || cleanedDescription || doc.title || ""
                  
                  if (result.messages.length > 0) {
                    logger.warn(`[AddFromSource] Word document conversion warnings for ${doc.url}:`, result.messages)
                  }
                  
                  if (!content.trim()) {
                    content = cleanedDescription || doc.title || ""
                  }
                } else {
                  // Older .doc format - not supported
                  logger.warn(`[AddFromSource] Word document (.doc) format not supported for ${doc.url}`)
                  content = cleanedDescription || doc.title || "[Word document (.doc) format is not supported. Please convert to .docx format for content extraction.]"
                }
              } catch (e) {
                logger.error(`[AddFromSource] Failed to parse Word document from ${doc.url}:`, e)
                content = cleanedDescription || doc.title || ""
              }
            }
          }
        }
      } catch (fetchError) {
        logger.error(`[AddFromSource] Error fetching ${doc.url}:`, fetchError)
        // Continue with metadata only if fetch fails
      }
    }

    // Clean content if it looks like it contains Overheid.nl navigation text
    // This handles cases where content was extracted from HTML pages
    if (content && content.length > 0 && !content.includes("\n") && content.length < 1000) {
      // If content is short and looks like a description, clean it
      const cleanedContent = cleanOverheidDescription(content)
      if (cleanedContent) {
        content = cleanedContent
      } else if (cleanedDescription) {
        // If cleaned content is empty but we have a cleaned description, use that
        content = cleanedDescription
      }
    }

    // Get workspace to derive tenant_id
    const { data: workspace } = await adminClient
      .from("workspaces")
      .select("space_id")
      .eq("id", workspaceId)
      .single()

    // Generate AI summary for the document card
    // Check if content extraction failed or file is binary
    const binaryFileMessage = "[Binary file - content extraction not available]"
    const isBinaryOrFailed = 
      !content || 
      content.startsWith("[Failed") || 
      content.startsWith("[Binary") ||
      content === binaryFileMessage ||
      content.trim() === binaryFileMessage.trim()
    
    // Check if file is markdown (by extension or MIME type)
    const fileName = doc.title || doc.identifier || ""
    const isMarkdownFile = 
      fileName.toLowerCase().endsWith(".md") || 
      fileName.toLowerCase().endsWith(".markdown") ||
      doc.type === "text/markdown"
    
    let documentSummary = ""
    
    logger.debug("[AddFromSource] Content check:", {
      contentLength: content?.length || 0,
      contentPreview: content?.substring(0, 50) || "empty",
      isBinaryOrFailed,
      fileName,
      docType: doc.type,
      isMarkdownFile,
    })
    
    if (!isBinaryOrFailed && content.length > 100) {
      // Content was successfully extracted - generate AI summary
      documentSummary = await generateDocumentSummary(content, doc.title, isMarkdownFile)
    } else if (isBinaryOrFailed) {
      // Binary file or extraction failed - create a descriptive summary based on file type
      const fileNameParts = fileName.split(".")
      const fileExt = fileNameParts.length > 1 ? fileNameParts.pop()?.toLowerCase() : ""
      
      const fileTypeMap: Record<string, string> = {
        "jpg": "Image file (JPEG)",
        "jpeg": "Image file (JPEG)",
        "png": "Image file (PNG)",
        "gif": "Image file (GIF)",
        "svg": "Image file (SVG)",
        "webp": "Image file (WebP)",
        "bmp": "Image file (BMP)",
        "tiff": "Image file (TIFF)",
        "zip": "Archive file (ZIP)",
        "rar": "Archive file (RAR)",
        "7z": "Archive file (7Z)",
        "tar": "Archive file (TAR)",
        "gz": "Archive file (GZIP)",
        "xlsx": "Spreadsheet file (Excel)",
        "xls": "Spreadsheet file (Excel)",
        "pptx": "Presentation file (PowerPoint)",
        "ppt": "Presentation file (PowerPoint)",
        "doc": "Word document (legacy format)",
        "pdf": "PDF document",
        "docx": "Word document",
      }
      
      // Also check MIME type as fallback
      let fileTypeDescription = fileTypeMap[fileExt || ""]
      if (!fileTypeDescription && doc.type) {
        if (doc.type.startsWith("image/")) {
          fileTypeDescription = `Image file (${doc.type.split("/")[1].toUpperCase()})`
        } else if (doc.type.startsWith("application/pdf")) {
          fileTypeDescription = "PDF document"
        } else if (doc.type.startsWith("application/zip") || doc.type.includes("archive")) {
          fileTypeDescription = "Archive file"
        } else if (doc.type.includes("spreadsheet") || doc.type.includes("excel")) {
          fileTypeDescription = "Spreadsheet file"
        } else if (doc.type.includes("presentation") || doc.type.includes("powerpoint")) {
          fileTypeDescription = "Presentation file"
        } else if (doc.type.includes("wordprocessingml") || doc.type.includes("msword")) {
          fileTypeDescription = "Word document"
        }
      }
      
      if (!fileTypeDescription) {
        fileTypeDescription = fileExt ? `File (${fileExt.toUpperCase()})` : "Document"
      }
      
      documentSummary = `${fileTypeDescription}. Content extraction not available for this file type.`
      
      logger.warn("[AddFromSource] Binary/unsupported file detected:", {
        fileName,
        fileExt,
        docType: doc.type,
        summary: documentSummary,
      })
    } else {
      // Short content - check if it's just a filename (for Google Drive or other sources without content)
      // If content is just the title/filename and we have a Google Drive source, generate AI summary from filename
      const isJustFilename = content === doc.title || (content.length < 200 && content.trim() === doc.title.trim())
      
      if (sourceType === "google_drive" && isJustFilename) {
        // For Google Drive documents, generate AI summary from filename
        const fileExt = fileName.split(".").pop()?.toLowerCase() || ""
        const fileTypeMap: Record<string, string> = {
          "pdf": "PDF document",
          "docx": "Word document",
          "doc": "Word document (legacy format)",
          "xlsx": "Spreadsheet file (Excel)",
          "xls": "Spreadsheet file (Excel)",
          "pptx": "Presentation file (PowerPoint)",
          "ppt": "Presentation file (PowerPoint)",
          "jpg": "Image file (JPEG)",
          "jpeg": "Image file (JPEG)",
          "png": "Image file (PNG)",
          "gif": "Image file (GIF)",
          "txt": "Text file",
          "md": "Markdown file",
        }
        
        const fileTypeDescription = fileTypeMap[fileExt] || (fileExt ? `File (${fileExt.toUpperCase()})` : "Document")
        const fileNameWithoutExt = fileName.replace(/\.[^/.]+$/, "")
        
        // Try to generate AI summary from filename (if it's descriptive)
        if (fileNameWithoutExt.length > 10 && !fileName.match(/^[A-Z0-9_-]+$/)) {
          try {
            const openai = (await import("openai")).default
            if (env.OPENAI_API_KEY) {
              const ai = new openai({ apiKey: env.OPENAI_API_KEY })
              const response = await ai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                  {
                    role: "system",
                    content: `You are a document description assistant. Based on a filename, create a concise 1-2 sentence description of what the document might contain.

Rules:
- Write 1-2 sentences (max 150 characters)
- Focus on the document's likely purpose or content based on the filename
- Use clear, professional language
- If the filename is just a code/ID, describe it as a document with that identifier

Examples:
- "KORZ Studio Work Order KS001.pdf" → "Work order document for KORZ Studio project KS001."
- "Q4_2024_Budget_Report.xlsx" → "Quarterly budget report for Q4 2024 with financial data and projections."`
                  },
                  {
                    role: "user",
                    content: `Filename: ${fileName}\nFile type: ${fileTypeDescription}`
                  }
                ],
                max_tokens: 60,
                temperature: 0.3,
              })
              
              const summary = response.choices[0]?.message?.content?.trim()
              if (summary && summary.length > 0 && summary.length <= 200) {
                documentSummary = summary
                logger.debug("[AddFromSource] Generated AI summary from Google Drive filename:", {
                  preview: summary.substring(0, 100),
                })
              } else {
                documentSummary = `${fileTypeDescription} from Google Drive: ${fileNameWithoutExt}`
              }
            } else {
              documentSummary = `${fileTypeDescription} from Google Drive: ${fileNameWithoutExt}`
            }
          } catch (error) {
            logger.error("[AddFromSource] Error generating summary from filename:", error)
            documentSummary = `${fileTypeDescription} from Google Drive: ${fileNameWithoutExt}`
          }
        } else {
          // Filename is not descriptive, use file type
          documentSummary = `${fileTypeDescription} from Google Drive: ${fileNameWithoutExt}`
        }
      } else if (content.length > 50) {
        // For other sources or when we have actual content, generate summary normally
        documentSummary = await generateDocumentSummary(content, doc.title, isMarkdownFile)
      } else {
        // Very short content - use as-is
        documentSummary = content.substring(0, 150).trim() + (content.length > 150 ? "..." : "")
        if (isMarkdownFile) {
          documentSummary = stripMarkdown(documentSummary)
        }
      }
    }
    
    // Ensure we have a summary (fallback if somehow none was generated)
    if (!documentSummary || documentSummary.trim().length === 0) {
      documentSummary = "Document from external source. Content preview not available."
      logger.warn("[AddFromSource] No summary generated, using fallback")
    }
    
    // Ensure summary doesn't contain the binary file error message
    if (documentSummary.includes("[Binary file - content extraction not available]")) {
      const fileExt = fileName.split(".").pop()?.toLowerCase() || "unknown"
      documentSummary = `File (${fileExt.toUpperCase()}). Content extraction not available for this file type.`
      logger.warn("[AddFromSource] Summary contained binary error message, replaced with file type description")
    }
    
    logger.info("[AddFromSource] Final document summary:", { preview: documentSummary.substring(0, 100) })

    // Create or update document record using adminClient to bypass RLS
    // Store AI summary in content field for card display
    // Full content will be stored in document_pages for RAG/search
    const { data: document, error: insertError } = await adminClient
      .from("documents")
      .upsert(
        {
          source_id: sourceId,
          workspace_id: workspaceId,
          tenant_id: workspace?.space_id || null, // Denormalized for RLS performance
          external_id: doc.identifier || doc.title,
          title: doc.title,
          content: sanitizeContentForDatabase(documentSummary), // Store AI-generated summary for card display
          url: publicUrl,
          classification: classification || "internal", // Default to internal
          metadata: {
            type: doc.type,
            date: doc.date,
            identifier: doc.identifier,
            original_url: doc.url,
            file_path: filePath,
          },
          status: "active",
        },
        {
          onConflict: "source_id,external_id",
        },
      )
      .select()
      .single()

    if (!insertError && document) {
      // Store full content in document_pages for RAG/search (if we have meaningful content)
      if (content && content.trim() && !content.startsWith("[Failed") && !content.startsWith("[Binary") && content.length > 50) {
        try {
          // Check if pages already exist (in case of upsert)
          const { data: existingPages } = await adminClient
            .from("document_pages")
            .select("id")
            .eq("document_id", document.id)
            .limit(1)
          
          if (!existingPages || existingPages.length === 0) {
            // Determine file type for proper page storage
            const isPDF = doc.type?.includes("pdf") || fileName.toLowerCase().endsWith(".pdf")
            const isWord = doc.type?.includes("wordprocessingml") || doc.type?.includes("msword") || fileName.toLowerCase().endsWith(".docx")
            const isText = doc.type?.includes("text") || fileName.toLowerCase().endsWith(".txt") || fileName.toLowerCase().endsWith(".md")
            
            if (isPDF || isWord || isText) {
              logger.debug("[AddFromSource] Creating page record for document", {
                documentId: document.id,
                contentLength: content.length,
              })
              const { error: pageError } = await adminClient
                .from("document_pages")
                .insert({
                  document_id: document.id,
                  page_number: 1,
                  text_content: sanitizeContentForDatabase(content.substring(0, 100000)), // Limit and sanitize to reasonable size
                  text_items: [],
                  character_offsets: {},
                })

              if (pageError) {
                logger.error("[AddFromSource] Failed to store content as page:", pageError)
              } else {
                logger.debug("[AddFromSource] Stored content as single page", { documentId: document.id })
              }
            }
          }
        } catch (pageError) {
          logger.error("[AddFromSource] Error storing content as page:", pageError)
        }
      }
      
      addedCount++
      addedDocuments.push(document)
    } else if (insertError) {
      const errorMsg = `Failed to insert document "${doc.title}": ${insertError.message}`
      logger.error(`[AddFromSource] ${errorMsg}`, insertError)
      errors.push(errorMsg)
      // Clean up uploaded file if document creation fails
      if (filePath) {
        try {
          await adminClient.storage.from("documents").remove([filePath])
        } catch (cleanupError) {
          logger.error(`[AddFromSource] Failed to cleanup file ${filePath}:`, cleanupError)
        }
      }
    }
  }

  revalidatePath(`/workspaces/${workspaceId}`)
  
  // If no documents were added and there were errors, return the first error
  if (addedCount === 0 && errors.length > 0) {
    return { error: errors[0], addedCount: 0 }
  }
  
  // If no documents were added but no errors were recorded, return a generic error
  if (addedCount === 0 && documents.length > 0) {
    return { error: "Failed to add documents. No documents were inserted.", addedCount: 0 }
  }
  
  return { data: addedDocuments, addedCount }
}

async function ensureWorkspaceGeneratedSource(
  workspaceId: string,
  adminClient: ReturnType<typeof createAdminClient>,
  userId: string,
) {
  const { data: existingSource, error: fetchError } = await adminClient
    .from("sources")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("type", "workspace_generated")
    .maybeSingle()

  if (fetchError) {
    throw new Error(fetchError.message)
  }

  if (existingSource) {
    return existingSource
  }

  const { data: newSource, error: insertError } = await adminClient
    .from("sources")
    .insert({
      workspace_id: workspaceId,
      name: "Workspace Documents",
      type: "workspace_generated",
      config: {},
      created_by: userId,
      status: "active",
    })
    .select("id")
    .single()

  if (insertError || !newSource) {
    throw new Error(insertError?.message || "Failed to create workspace document source")
  }

  return newSource
}

export async function ensureOverheidNLSource(
  workspaceId: string,
): Promise<{ data?: { id: string }; error?: string }> {
  const supabase = await createClient()
  
  // Authorization check before admin operation
  try {
    await requireAuthAndPermission("source:create", { workspaceId })
  } catch (authError) {
    return { error: authError instanceof Error ? authError.message : "Unauthorized" }
  }

  const adminClient = createAdminClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  const { data: existingSource, error: fetchError } = await adminClient
    .from("sources")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("type", "overheid_nl")
    .maybeSingle()

  if (fetchError) {
    return { error: fetchError.message }
  }

  if (existingSource) {
    return { data: existingSource }
  }

  const { data: newSource, error: insertError } = await adminClient
    .from("sources")
    .insert({
      workspace_id: workspaceId,
      name: "Overheid.nl",
      type: "overheid_nl",
      config: {},
      created_by: user.id,
      status: "active",
    })
    .select("id")
    .single()

  if (insertError || !newSource) {
    return { error: insertError?.message || "Failed to create Overheid.nl source" }
  }

  return { data: newSource }
}

export async function createWorkspaceDocument(
  workspaceId: string,
  {
    title,
    content,
    instructions,
    classification,
  }: {
    title: string
    content?: string
    instructions?: string
    classification?: "public" | "internal" | "confidential"
  },
) {
  const supabase = await createClient()
  
  // Authorization check before admin operation
  try {
    await requireAuthAndPermission("workspace_item:create", { workspaceId })
  } catch (authError) {
    return { error: authError instanceof Error ? authError.message : "Unauthorized" }
  }

  const adminClient = createAdminClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Unauthorized" }
  }

  const { data: workspace, error: workspaceError } = await supabase
    .from("workspaces")
    .select("id, space_id")
    .eq("id", workspaceId)
    .single()

  if (workspaceError || !workspace) {
    return { error: "Workspace not found" }
  }

  let source
  try {
    source = await ensureWorkspaceGeneratedSource(workspaceId, adminClient, user.id)
  } catch (error) {
    logger.error("[WorkspaceDocument] Failed to ensure source:", error)
    return {
      error: error instanceof Error ? error.message : "Failed to prepare workspace document source",
    }
  }

  const now = new Date().toISOString()
  const metadata: Record<string, any> = {
    ...(instructions ? { instructions } : {}),
    createdBy: user.id,
    lastEditedBy: user.id,
    lastEditedAt: now,
    origin: "workspace_generated",
  }

  const { data: document, error: docError } = await adminClient
    .from("documents")
    .insert({
      source_id: source.id,
      workspace_id: workspaceId,
      tenant_id: workspace.space_id || null,
      external_id: randomUUID(),
      title: title.trim() || "Untitled Document",
      content: sanitizeContentForDatabase(content ?? ""),
      status: "active",
      classification: classification || "internal",
      metadata,
    })
    .select("*, sources(type, name)")
    .single()

  if (docError || !document) {
    logger.error("[WorkspaceDocument] Failed to create document:", docError)
    return { error: docError?.message || "Failed to create document" }
  }

  // If instructions are provided, automatically generate a draft
  if (instructions && instructions.trim()) {
    try {
      logger.info("[WorkspaceDocument] Auto-generating draft with instructions")
      const draftResult = await generateWorkspaceDocumentDraft(workspaceId, document.id, {
        instructions: instructions.trim(),
        temperature: 0.4,
      })

      if (draftResult.error) {
        logger.error("[WorkspaceDocument] Failed to auto-generate draft:", draftResult.error)
        // Don't fail document creation if draft generation fails, just log it
        // The document is created and user can manually generate draft later
      } else {
        logger.info("[WorkspaceDocument] Successfully auto-generated draft")
        // Re-fetch the document to get the updated content
        const { data: updatedDoc } = await adminClient
          .from("documents")
          .select("*, sources(type, name)")
          .eq("id", document.id)
          .single()
        
        if (updatedDoc) {
          revalidatePath(`/workspaces/${workspaceId}`)
          return { data: updatedDoc }
        }
      }
    } catch (error) {
      logger.error("[WorkspaceDocument] Error during auto-draft generation:", error)
      // Don't fail document creation if draft generation fails
    }
  }

  revalidatePath(`/workspaces/${workspaceId}`)
  return { data: document }
}

export async function updateWorkspaceDocument(
  workspaceId: string,
  documentId: string,
  updates: {
    title?: string
    content?: string
    instructions?: string | null
  },
) {
  const supabase = await createClient()
  const adminClient = createAdminClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Unauthorized" }
  }

  const { data: document, error: fetchError } = await supabase
    .from("documents")
    .select("id, title, content, metadata, workspace_id, source_id, sources(type)")
    .eq("id", documentId)
    .eq("workspace_id", workspaceId)
    .single()

  if (fetchError || !document) {
    return { error: "Document not found" }
  }

  const sourceRelation = document.sources as
    | { type?: string | null }
    | { type?: string | null }[]
    | null
    | undefined
  const sourceType = Array.isArray(sourceRelation) ? sourceRelation[0]?.type : sourceRelation?.type

  if (sourceType !== "workspace_generated") {
    return { error: "Document is not editable" }
  }

  const { parseProgrammeBindings } = await import("@/lib/programme/domain")
  const { data: workspace } = await supabase.from("workspaces").select("metadata").eq("id", workspaceId).single()
  const bindings = parseProgrammeBindings((workspace?.metadata as Record<string, unknown>) || {})
  const outlineNodeId = Object.entries(bindings.chapterDocuments || {}).find(([, id]) => id === documentId)?.[0]
  if (outlineNodeId) {
    const { requireSectionLock } = await import("@/lib/actions/collaboration")
    const lock = await requireSectionLock(workspaceId, `chapter:${outlineNodeId}`)
    if (lock.error) return { error: lock.error }
  }

  const updatedMetadata: Record<string, any> = {
    ...(document.metadata || {}),
    lastEditedBy: user.id,
    lastEditedAt: new Date().toISOString(),
  }

  if (Object.prototype.hasOwnProperty.call(updates, "instructions")) {
    if (updates.instructions && updates.instructions.trim().length > 0) {
      updatedMetadata.instructions = updates.instructions
    } else {
      delete updatedMetadata.instructions
    }
  }

  const updatePayload: Record<string, any> = {
    metadata: updatedMetadata,
    updated_at: new Date().toISOString(),
  }

  if (typeof updates.title === "string") {
    updatePayload.title = updates.title.trim() || "Untitled Document"
  }

  if (typeof updates.content === "string") {
    updatePayload.content = updates.content
  }

  const { data: updatedDocument, error: updateError } = await adminClient
    .from("documents")
    .update(updatePayload)
    .eq("id", documentId)
    .select("*, sources(type, name)")
    .single()

  if (updateError || !updatedDocument) {
    logger.error("[WorkspaceDocument] Failed to update document:", updateError)
    return { error: updateError?.message || "Failed to update document" }
  }

  if (outlineNodeId && typeof updates.content === "string") {
    const { snapshotArtefact } = await import("@/lib/actions/collaboration")
    await snapshotArtefact({
      workspaceId,
      artefactType: "document",
      artefactId: documentId,
      snapshot: { content: updates.content, outlineNodeId },
      reason: "chapter save",
    })
  }

  revalidatePath(`/workspaces/${workspaceId}`)
  revalidatePath(`/workspaces/${workspaceId}/my-documents/${documentId}`)
  return { data: updatedDocument }
}

export async function generateWorkspaceDocumentDraft(
  workspaceId: string,
  documentId: string,
  {
    instructions,
    temperature = 0.4,
    citationMode,
    outlineNodeId,
    privilegedContext,
  }: {
    instructions: string
    temperature?: number
    citationMode?: "standard" | "strict"
    outlineNodeId?: string
    privilegedContext?: string
  },
) {
  const supabase = await createClient()
  const adminClient = createAdminClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Unauthorized" }
  }

  if (!instructions || !instructions.trim()) {
    return { error: "Provide drafting instructions before generating a document" }
  }

  const { data: document, error: documentError } = await supabase
    .from("documents")
    .select("id, title, content, metadata, workspace_id, sources(type)")
    .eq("id", documentId)
    .eq("workspace_id", workspaceId)
    .single()

  if (documentError || !document) {
    return { error: "Document not found" }
  }

  const draftSourceRelation = document.sources as
    | { type?: string | null }
    | { type?: string | null }[]
    | null
    | undefined
  const draftSourceType = Array.isArray(draftSourceRelation) ? draftSourceRelation[0]?.type : draftSourceRelation?.type

  if (draftSourceType !== "workspace_generated") {
    return { error: "Only workspace-authored documents can be generated" }
  }

  const { data: workspace, error: workspaceError } = await supabase
    .from("workspaces")
    .select("name, context, location, metadata")
    .eq("id", workspaceId)
    .single()

  if (workspaceError || !workspace) {
    return { error: "Workspace not found" }
  }

  // Get user's language preference
  const { data: profile } = await supabase
    .from("profiles")
    .select("language")
    .eq("id", user.id)
    .single()
  
  const userLanguage = profile?.language === "nl" ? "Dutch" : "English"

  // Use all workspace knowledge for initial document generation
  // This ensures the AI has access to all available workspace knowledge
  const { context, sources } = await getAllWorkspaceKnowledge(workspaceId, [documentId])

  const bindings = parseProgrammeBindings((workspace.metadata as Record<string, unknown>) || {})
  const { boundAgentId } = await import("@/lib/programme/domain")
  const { getLatestAgentVersion } = await import("@/lib/actions/agent")
  const { listProgrammeOutlineNodes } = await import("@/lib/actions/outline")
  const { listProgrammeMeasures } = await import("@/lib/actions/measures")
  const draftAgentId = boundAgentId(bindings, "draft")
  const agentVersion = draftAgentId ? (await getLatestAgentVersion(draftAgentId)).data : null

  let playbookBody: string | undefined = agentVersion?.instructions
  let playbookVersionId: string | undefined
  let playbookConfig: unknown = {}
  if (!playbookBody && bindings.playbookId) {
    const latest = await getLatestPlaybookBody(bindings.playbookId)
    playbookBody = latest.body
    playbookVersionId = latest.versionId
    playbookConfig = latest.config ?? {}
  }

  const { parsePlaybookRuntimeConfig, resolveModelForTask } = await import("@/lib/programme/model-tiers")
  const runtimeConfig = parsePlaybookRuntimeConfig(playbookConfig)
  const effectiveCitationMode = citationMode ?? runtimeConfig.citationMode
  const model = agentVersion?.model || resolveModelForTask("draft", runtimeConfig)
  const provider = agentVersion?.provider || "openai-compatible"

  let nodeConstraint = ""
  if (outlineNodeId && bindings.templateId) {
    const outline = await listProgrammeOutlineNodes(bindings.templateId)
    const node = outline.data.find((n) => n.id === outlineNodeId)
    if (node) {
      const nodeMeasures = (await listProgrammeMeasures(workspaceId)).data || []
      const placed = nodeMeasures.filter((m: { outline_node_id?: string }) => m.outline_node_id === node.id)
      nodeConstraint = [
        `TEMPLATE NODE CONSTRAINTS (mandatory):`,
        `Title: ${node.title}`,
        `Required: ${node.required ? "yes" : "no"}`,
        node.purpose ? `Purpose: ${node.purpose.replace(/<[^>]+>/g, " ").slice(0, 800)}` : "",
        node.instructions ? `Section instructions: ${node.instructions}` : "",
        node.qualityRules ? `Quality rules: ${node.qualityRules}` : "",
        node.outputForm ? `Output form: ${node.outputForm}` : "",
        node.relationHints ? `Relation hints: ${node.relationHints}` : "",
        placed.length
          ? `Linked measures:\n${placed.map((m: { title: string; specific_action?: string }) => `- ${m.title}: ${m.specific_action || ""}`).join("\n")}`
          : "Linked measures: (none placed on this node)",
      ]
        .filter(Boolean)
        .join("\n")
    }
  }

  const { systemPrompt } = compileSystemPrompt({
    kind: "draft",
    userLanguage,
    playbookBody,
    runInstructions: instructions.trim(),
    citationMode: effectiveCitationMode,
    runtimeSections: [nodeConstraint, privilegedContext, agentVersion?.qualityRules ? `QUALITY RULES:\n${agentVersion.qualityRules}` : ""]
      .filter(Boolean)
      .join("\n\n"),
  })

  const workspaceDetails = [
    `Workspace: ${workspace.name}`,
    workspace.context ? `Workspace Context: ${workspace.context}` : null,
    workspace.location ? `Location: ${workspace.location}` : null,
  ]
    .filter(Boolean)
    .join("\n")

  const existingDraft = document.content?.trim()
    ? `Existing draft (for reference, you may replace or improve it):\n${document.content}\n`
    : ""

  const citationInstruction =
    effectiveCitationMode === "strict"
      ? `Output a polished document in Markdown. For EVERY factual claim include a structured citation [citation:{"quote":"exact text","documentId":"…","pageNumber":1}] using only evidence document IDs. Write extensively in long-form prose.`
      : `Output a polished document in Markdown. Include citations inline when referring to specific evidence, using footnote-style references like [^1]. Write extensively: use the full workspace evidence to develop your argument in long-form prose. You may include a substantive executive summary at the top if useful, but the main content must be detailed, paragraph-based narrative that explores the available knowledge in depth—not a short summary or bullet-point overview.`

  const userPrompt = `Draft a document according to the following instructions.

${workspaceDetails}

Instructions:
${instructions.trim()}

${existingDraft}

Workspace evidence:
${context}

${citationInstruction}`

  let generatedText = ""
  try {
    const { completeLlm } = await import("@/lib/llm")
    const completion = await completeLlm({
      provider,
      endpoint: agentVersion?.endpoint,
      credentialsRef: agentVersion?.credentialsRef,
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature,
      maxTokens: 16000,
    })

    const markdownDraft = completion.text
    generatedText = markdownToHtml(markdownDraft)
  } catch (error) {
    logger.error("[WorkspaceDocument] Failed to generate draft:", error)
    return {
      error: error instanceof Error ? error.message : "Failed to generate document draft",
    }
  }

  if (!generatedText) {
    return { error: "The AI did not return any content" }
  }

  const sourceIds = (sources || [])
    .map((s: any) => s.documentId || s.id)
    .filter((id: unknown): id is string => typeof id === "string")

  const evidenceDocs = (sources || [])
    .map((s: any) => {
      const documentId = s.documentId || s.id
      const text = typeof s.content === "string" ? s.content : typeof s.text === "string" ? s.text : ""
      if (typeof documentId !== "string" || !documentId) return null
      return { documentId, text }
    })
    .filter((e): e is { documentId: string; text: string } => Boolean(e))

  const { assessGroundedness } = await import("@/lib/programme/reliability")
  const groundedness = assessGroundedness(generatedText, evidenceDocs)

  const unused = await computeUnusedDocumentIds(workspaceId, sourceIds)
  await recordGenerationRun({
    workspaceId,
    kind: "draft",
    playbookVersionId,
    agentVersionId: agentVersion?.id ?? null,
    provider,
    model,
    temperature,
    instructions: instructions.trim(),
    sourceDocumentIds: sourceIds,
    unusedDocumentIds: unused.data || [],
    outputRef: documentId,
    citations: { sources, groundedness },
    userId: user.id,
  })

  const metadata: Record<string, any> = {
    ...(document.metadata || {}),
    instructions: instructions.trim(),
    lastEditedBy: user.id,
    lastEditedAt: new Date().toISOString(),
    lastGeneratedAt: new Date().toISOString(),
    lastGeneratedBy: user.id,
    lastGenerationSources: sources,
    lastGroundedness: groundedness,
    lastCitationMode: effectiveCitationMode,
  }

  const { data: updatedDocument, error: updateError } = await adminClient
    .from("documents")
    .update({
      content: generatedText,
      metadata,
      updated_at: new Date().toISOString(),
    })
    .eq("id", documentId)
    .select("id")
    .single()

  if (updateError || !updatedDocument) {
    logger.error("[WorkspaceDocument] Failed to persist generated draft:", updateError)
    return { error: updateError?.message || "Failed to save generated draft" }
  }

  revalidatePath(`/workspaces/${workspaceId}`)
  revalidatePath(`/workspaces/${workspaceId}/my-documents/${documentId}`)
  revalidatePath(`/workspaces/${workspaceId}/programme`)

  return { data: { content: generatedText, sources, groundedness, model, citationMode: effectiveCitationMode } }
}
