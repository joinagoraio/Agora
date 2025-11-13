import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { revalidatePath } from "next/cache"
import OpenAI from "openai"

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
async function generateDocumentSummary(content: string, title?: string, isMarkdown = false): Promise<string> {
  // Only use AI if OpenAI is configured and content is substantial
  if (!process.env.OPENAI_API_KEY || !content || content.length < 100) {
    // Fallback: return first 150 characters
    const fallback = content.substring(0, 150).trim() + (content.length > 150 ? "..." : "")
    return isMarkdown ? stripMarkdown(fallback) : fallback
  }

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    
    // For markdown, strip syntax for better AI understanding
    let processedContent = isMarkdown ? stripMarkdown(content) : content
    
    // Take a sample of the content (first 2000 chars for efficiency)
    const contentSample = processedContent.substring(0, 2000)
    
    console.log("[Upload API] Generating summary for", isMarkdown ? "markdown" : "document", "- content length:", content.length, "processed length:", processedContent.length)
    
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
      console.log("[Upload API] Generated AI summary:", summary.substring(0, 100))
      return summary
    }
  } catch (error) {
    console.error("[Upload API] Error generating summary:", error)
  }

  // Fallback: return first 150 characters (strip markdown if needed)
  const fallback = content.substring(0, 150).trim() + (content.length > 150 ? "..." : "")
  return isMarkdown ? stripMarkdown(fallback) : fallback
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const adminClient = createAdminClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const formData = await req.formData()
    const file = formData.get("file") as File
    const workspaceId = formData.get("workspaceId") as string
    const title = formData.get("title") as string | null
    const classification = (formData.get("classification") as "public" | "internal" | "confidential") || "internal"

    if (!file || !workspaceId) {
      return NextResponse.json({ error: "File and workspaceId are required" }, { status: 400 })
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
        console.error("[Upload] Source creation error:", sourceError)
        return NextResponse.json(
          {
            error: `Failed to create upload source: ${sourceError?.message || "Unknown error"}. Make sure you've run the database migration to add 'direct_upload' source type.`,
          },
          { status: 500 }
        )
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
      return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 })
    }

    // Get public URL using admin client
    const {
      data: { publicUrl },
    } = adminClient.storage.from("documents").getPublicUrl(filePath)

    // Import the uploadDocument logic - we'll reuse the content extraction and document creation
    // For now, let's import the necessary functions or inline the logic
    // Extract text content from file
    let content = ""
    let pdfPages: any[] = []
    let isMarkdownFile = false
    
    // Check if file is markdown (by extension or MIME type)
    if (file.name.toLowerCase().endsWith(".md") || 
        file.name.toLowerCase().endsWith(".markdown") ||
        file.type === "text/markdown") {
      isMarkdownFile = true
    }
    
    if (file.type === "text/plain" || file.type === "text/markdown" || isMarkdownFile) {
      content = await file.text()
      console.log("[Upload API] Processing text/markdown file:", file.name, "Size:", file.size, "bytes", "Content length:", content.length)
    } else if (file.type === "application/pdf") {
      console.log("[Upload] Processing PDF file:", file.name, "Size:", file.size, "bytes")
      try {
        const arrayBuffer = await file.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)

        const PDFParser = (await import("pdf2json")).default

        const pdfData = await new Promise<string>((resolve, reject) => {
          const pdfParser = new PDFParser(null, true)

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

          pdfParser.parseBuffer(buffer)
        })

        content = pdfData || ""
        content = content.replace(/\\u(?![\da-fA-F]{4})/g, "u")
        content = content.replace(/\\(?![nrtbf\\'"xu0-7])/g, "")

        console.log(`[Upload API] Extracted ${content.length} characters from PDF`)
      } catch (pdfError) {
        console.error("[Upload API] PDF parsing error:", pdfError)
        content = `[Failed to extract PDF content: ${pdfError instanceof Error ? pdfError.message : "Unknown error"}]`
      }
    } else if (
      file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      console.log("[Upload API] Processing Word document (.docx):", file.name, "Size:", file.size, "bytes")
      try {
        // Convert File to ArrayBuffer, then to Buffer for Word parsing
        const arrayBuffer = await file.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)
        console.log("[Upload API] Converted to Buffer, size:", buffer.length, "bytes")
        
        // Use mammoth to extract text content from Word document
        const mammoth = await import("mammoth")
        const result = await mammoth.extractRawText({ buffer })
        
        content = result.value || ""
        
        if (result.messages.length > 0) {
          console.warn("[Upload API] Word document conversion warnings:", result.messages)
        }
        
        if (!content.trim()) {
          console.warn("[Upload API] Word document appears to be empty or contains no extractable text")
          content = "[Word document appears to be empty or contains only images/formatting that could not be extracted as text]"
        } else {
          console.log(`[Upload API] Successfully extracted ${content.length} characters from Word document`)
        }
      } catch (error) {
        console.error("[Upload API] Word document parsing error:", error)
        content = `[Failed to extract Word document content: ${error instanceof Error ? error.message : "Unknown error"}]`
      }
    } else if (file.type === "application/msword") {
      // Older .doc format - mammoth doesn't support it
      console.log("[Upload API] Processing Word document (.doc):", file.name, "Size:", file.size, "bytes")
      content = "[Word document (.doc) format is not supported. Please convert to .docx format for content extraction.]"
    } else {
      content = "[Binary file - content extraction not available]"
    }

    // Get workspace to derive tenant_id
    const { data: workspace } = await adminClient.from("workspaces").select("space_id").eq("id", workspaceId).single()

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
    
    console.log("[Upload API] Content check:", {
      contentLength: content?.length || 0,
      contentPreview: content?.substring(0, 50) || "empty",
      isBinaryOrFailed,
      fileName: file.name,
      fileType: file.type,
      isMarkdownFile,
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
      
      console.log("[Upload API] Binary/unsupported file detected:", {
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
      console.warn("[Upload API] No summary generated, using fallback")
    }
    
    // Ensure summary doesn't contain the binary file error message
    if (documentSummary.includes("[Binary file - content extraction not available]")) {
      const fileExt = file.name.split(".").pop()?.toLowerCase() || "unknown"
      documentSummary = `File (${fileExt.toUpperCase()}). Content extraction not available for this file type.`
      console.warn("[Upload API] Summary contained binary error message, replaced with file type description")
    }
    
    console.log("[Upload API] Final document summary:", documentSummary.substring(0, 100))

    // Sanitize content for database
    const sanitizeContentForDatabase = (text: string): string => {
      return text.replace(/\0/g, "").substring(0, 1000000)
    }

    // Create document record
    const { data: document, error: docError } = await adminClient
      .from("documents")
      .insert({
        source_id: source!.id,
        workspace_id: workspaceId,
        tenant_id: workspace?.space_id || null,
        external_id: fileName,
        title: documentTitle,
        content: sanitizeContentForDatabase(documentSummary),
        url: publicUrl,
        status: "active",
        classification: classification,
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
      await adminClient.storage.from("documents").remove([filePath])
      return NextResponse.json({ error: `Failed to create document: ${docError.message}` }, { status: 500 })
    }

    // Store PDF pages if we extracted them
    if (file.type === "application/pdf" && content && !content.startsWith("[Failed")) {
      try {
        const lines = content.split("\n").filter((line) => line.trim())
        const pages: any[] = []
        let currentPage = 1
        let currentPageText = ""

        for (const line of lines) {
          currentPageText += line + "\n"
          if (currentPageText.length > 50000) {
            pages.push({
              document_id: document.id,
              page_number: currentPage,
              text_content: sanitizeContentForDatabase(currentPageText),
              text_items: [],
              character_offsets: {},
            })
            currentPage++
            currentPageText = ""
          }
        }

        if (currentPageText.trim()) {
          pages.push({
            document_id: document.id,
            page_number: currentPage,
            text_content: sanitizeContentForDatabase(currentPageText),
            text_items: [],
            character_offsets: {},
          })
        }

        if (pages.length > 0) {
          const { error: pageError } = await adminClient.from("document_pages").insert(pages)
          if (pageError) {
            console.error("[Upload] Failed to store PDF pages:", pageError)
          }
        }
      } catch (pageError) {
        console.error("[Upload] Error storing PDF pages:", pageError)
      }
    } else if (
      file.type === "text/plain" ||
      file.type === "text/markdown" ||
      file.name.toLowerCase().endsWith(".md") ||
      file.name.toLowerCase().endsWith(".txt") ||
      file.name.toLowerCase().endsWith(".markdown")
    ) {
      if (content && content.trim() && !content.startsWith("[Failed") && !content.startsWith("[Binary")) {
        try {
          const { error: pageError } = await adminClient.from("document_pages").insert({
            document_id: document.id,
            page_number: 1,
            text_content: sanitizeContentForDatabase(content.substring(0, 100000)),
            text_items: [],
            character_offsets: {},
          })

          if (pageError) {
            console.error("[Upload API] Failed to store text/markdown content as page:", pageError)
          } else {
            console.log(`[Upload API] Successfully stored text/markdown content as page 1 for document ${document.id}`)
          }
        } catch (pageError) {
          console.error("[Upload API] Error storing text/markdown content as page:", pageError)
        }
      }
    } else if (
      file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      file.name.toLowerCase().endsWith(".docx")
    ) {
      // Store Word document content as pages for RAG/search
      if (content && content.trim() && !content.startsWith("[Failed") && !content.startsWith("[Binary")) {
        try {
          console.log(`[Upload API] Creating page record for Word document (${content.length} chars)`)
          const { error: pageError } = await adminClient.from("document_pages").insert({
            document_id: document.id,
            page_number: 1,
            text_content: sanitizeContentForDatabase(content.substring(0, 100000)),
            text_items: [],
            character_offsets: {},
          })

          if (pageError) {
            console.error("[Upload API] Failed to store Word document content as page:", pageError)
          } else {
            console.log(`[Upload API] Successfully stored Word document content as page 1 for document ${document.id}`)
          }
        } catch (pageError) {
          console.error("[Upload API] Error storing Word document content as page:", pageError)
        }
      }
    }

    revalidatePath(`/workspaces/${workspaceId}`)
    return NextResponse.json({ data: document })
  } catch (error) {
    console.error("[Upload API] Error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "An error occurred during upload" },
      { status: 500 }
    )
  }
}
