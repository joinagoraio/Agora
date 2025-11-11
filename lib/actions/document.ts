"use server"

// Import polyfill FIRST before any PDF-related imports
import "@/lib/utils/dommatrix-polyfill"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { revalidatePath } from "next/cache"
import { extractPdfPages } from "@/lib/utils/pdf-extraction"

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

export async function deleteDocument(documentId: string, workspaceId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const adminClient = createAdminClient()

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
      console.error("[Delete] Failed to remove file from storage:", storageError)
      // Don't fail the delete operation if storage cleanup fails
    }
  }

  revalidatePath(`/workspaces/${workspaceId}`)
  return {}
}

export async function archiveDocument(documentId: string, workspaceId: string, archive: boolean): Promise<{ error?: string }> {
  const supabase = await createClient()
  const adminClient = createAdminClient()

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
  return {}
}

export async function uploadDocument(
  workspaceId: string,
  file: File,
  title?: string,
): Promise<{ data?: any; error?: string }> {
  const supabase = await createClient()
  const adminClient = createAdminClient()

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
      console.error("[Upload] Source creation error:", sourceError)
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
  
  if (file.type === "text/plain" || file.type === "text/markdown") {
    content = await file.text()
  } else if (file.type === "application/pdf") {
    try {
      // Convert File to ArrayBuffer for PDF parsing
      const arrayBuffer = await file.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      
      // Extract pages with coordinates for highlighting
      try {
        pdfPages = await extractPdfPages(buffer)
        // Combine all page text for the main content field
        content = pdfPages.map((page) => page.textContent).join("\n\n")
      } catch (extractError) {
        console.error("[Upload] PDF page extraction error:", extractError)
        // Fallback to pdf-parse for basic text extraction
        const pdfParse = await import("pdf-parse")
        const pdfData = await pdfParse.default(buffer)
        content = pdfData.text || ""
      }
      
      // If no text was extracted, it's likely a scanned/image-based PDF - use OCR
      if (!content.trim()) {
        console.log("[Upload] No text found in PDF, attempting OCR...")
        
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
            console.log(`[Upload] OCR extracted ${content.length} characters from scanned PDF`)
          }
        } catch (ocrError) {
          console.error("[Upload] OCR error:", ocrError)
          content = `[Failed to perform OCR on PDF: ${ocrError instanceof Error ? ocrError.message : "Unknown error"}]`
        }
      }
      
      // Store pages in document_pages table after document is created (see below)
      // We'll do this after document creation to get the document ID
    } catch (error) {
      console.error("[Upload] PDF parsing error:", error)
      content = `[Failed to extract PDF content: ${error instanceof Error ? error.message : "Unknown error"}]`
    }
  } else if (
    file.type ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    content = "[Word document content extraction not yet implemented]"
  } else {
    content = await file.text().catch(() => "[Binary file - content extraction not available]")
  }

  // Create document record
  const documentTitle = title || file.name
  const { data: document, error: docError } = await adminClient
    .from("documents")
    .insert({
      source_id: source!.id, // Safe to use ! here since we created source above
      workspace_id: workspaceId,
      external_id: fileName,
      title: documentTitle,
      content: content.substring(0, 100000), // Limit content size
      url: publicUrl,
      status: "active", // Set status to active for new uploads
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

  // Store PDF pages if we extracted them
  if (file.type === "application/pdf" && pdfPages && pdfPages.length > 0) {
    try {
      const pageInserts = pdfPages.map((page) => ({
        document_id: document.id,
        page_number: page.pageNumber,
        text_content: page.textContent,
        text_items: page.textItems,
        character_offsets: page.characterOffsets,
      }))

      const { error: pagesError } = await adminClient
        .from("document_pages")
        .insert(pageInserts)

      if (pagesError) {
        console.error("[Upload] Failed to store document pages:", pagesError)
        // Don't fail the upload if page storage fails, just log it
      } else {
        console.log(`[Upload] Stored ${pageInserts.length} pages for document ${document.id}`)
      }
    } catch (pagesError) {
      console.error("[Upload] Error storing document pages:", pagesError)
      // Don't fail the upload if page storage fails
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
): Promise<{ data?: any[]; error?: string; addedCount?: number }> {
  const supabase = await createClient()
  const adminClient = createAdminClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  // Verify source belongs to workspace
  const { data: source, error: sourceError } = await supabase
    .from("sources")
    .select("id, workspace_id")
    .eq("id", sourceId)
    .eq("workspace_id", workspaceId)
    .single()

  if (sourceError || !source) {
    return { error: "Source not found or access denied" }
  }

  let addedCount = 0
  const addedDocuments: any[] = []

  for (const doc of documents) {
    let filePath: string | null = null
    let publicUrl: string | null = doc.url || null
    let content = doc.description || doc.title || ""

    // If URL is provided, fetch and store the document
    if (doc.url) {
      try {
        // Fetch the document from the URL
        const response = await fetch(doc.url)
        if (!response.ok) {
          console.error(`[AddFromSource] Failed to fetch ${doc.url}: ${response.statusText}`)
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
            console.error(`[AddFromSource] Failed to upload ${doc.url}:`, uploadError)
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
                content = await blob.text()
              } catch (e) {
                console.error(`[AddFromSource] Failed to extract text from ${doc.url}:`, e)
              }
            } else if (contentType.includes("pdf")) {
              try {
                // Convert Blob to ArrayBuffer for PDF parsing
                const arrayBuffer = await blob.arrayBuffer()
                const buffer = Buffer.from(arrayBuffer)
                
                const pdfParse = await import("pdf-parse")
                const pdfData = await pdfParse.default(buffer)
                content = pdfData.text || doc.description || doc.title || ""
              } catch (e) {
                console.error(`[AddFromSource] Failed to parse PDF from ${doc.url}:`, e)
                content = doc.description || doc.title || ""
              }
            }
          }
        }
      } catch (fetchError) {
        console.error(`[AddFromSource] Error fetching ${doc.url}:`, fetchError)
        // Continue with metadata only if fetch fails
      }
    }

    // Create or update document record
    const { data: document, error: insertError } = await supabase
      .from("documents")
      .upsert(
        {
          source_id: sourceId,
          workspace_id: workspaceId,
          external_id: doc.identifier || doc.title,
          title: doc.title,
          content: content.substring(0, 100000), // Limit content size
          url: publicUrl,
          metadata: {
            type: doc.type,
            date: doc.date,
            identifier: doc.identifier,
            original_url: doc.url,
            file_path: filePath,
          },
          status: "active",
          synced_at: new Date().toISOString(),
        },
        {
          onConflict: "source_id,external_id",
        },
      )
      .select()
      .single()

    if (!insertError && document) {
      addedCount++
      addedDocuments.push(document)
    } else if (insertError) {
      console.error(`[AddFromSource] Failed to insert document ${doc.title}:`, insertError)
      // Clean up uploaded file if document creation fails
      if (filePath) {
        try {
          await adminClient.storage.from("documents").remove([filePath])
        } catch (cleanupError) {
          console.error(`[AddFromSource] Failed to cleanup file ${filePath}:`, cleanupError)
        }
      }
    }
  }

  revalidatePath(`/workspaces/${workspaceId}`)
  return { data: addedDocuments, addedCount }
}
