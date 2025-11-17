"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { env } from "@/lib/env"

type SourceType =
  | "google_drive"
  | "notion"
  | "confluence"
  | "sharepoint"
  | "dropbox"
  | "direct_upload"
  | "overheid_nl"
  | "workspace_generated"

export async function createSource(
  workspaceId: string,
  name: string,
  type: SourceType,
  config: Record<string, any>,
) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  const { data, error } = await supabase
    .from("sources")
    .insert({
      workspace_id: workspaceId,
      name,
      type,
      config,
      created_by: user.id,
      status: "active",
    })
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  revalidatePath(`/workspaces/${workspaceId}`)
  return { data }
}

export async function updateSource(sourceId: string, name: string, config: Record<string, any>) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  const { data, error } = await supabase
    .from("sources")
    .update({ name, config })
    .eq("id", sourceId)
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  revalidatePath(`/sources/${sourceId}`)
  return { data }
}

export async function deleteSource(sourceId: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  const { error } = await supabase.from("sources").delete().eq("id", sourceId)

  if (error) {
    return { error: error.message }
  }

  return { success: true }
}

async function syncGoogleDriveSource(
  source: any,
  workspaceId: string,
  supabase: any,
): Promise<{ success: boolean; error?: string; syncedCount?: number }> {
  try {
    const config = source.config || {}
    const accessToken = config.access_token

    if (!accessToken) {
      return { success: false, error: "Google Drive access token is required in source config" }
    }

    // List files from Google Drive root folder using the API route
    // Use relative URL for server-side fetch
    const baseUrl =
      env.NEXT_PUBLIC_APP_URL ??
      (env.VERCEL_URL ? `https://${env.VERCEL_URL}` : "http://localhost:3000")
    
    const params = new URLSearchParams({
      action: "list",
      accessToken,
      folderId: "root",
    })

    const response = await fetch(`${baseUrl}/api/google-drive?${params}`)
    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.error || "Failed to list Google Drive files")
    }

    const files = data.files || []
    
    // Filter out folders - only sync actual files
    const fileFiles = files.filter((file: any) => !file.mimeType.includes("folder"))

    // Import AI summary generation function
    const { generateDocumentSummary } = await import("@/lib/actions/document")
    
    // Store documents in database
    let syncedCount = 0
    for (const file of fileFiles) {
      // Generate AI summary based on file name and type
      // For Google Drive, we don't have content yet, so create a descriptive summary
      const fileExt = file.name.split(".").pop()?.toLowerCase() || ""
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
      
      let documentSummary = ""
      const fileTypeDescription = fileTypeMap[fileExt] || (fileExt ? `File (${fileExt.toUpperCase()})` : "Document")
      
      // Try to generate AI summary from filename (if it's descriptive)
      // Remove file extension for better AI understanding
      const fileNameWithoutExt = file.name.replace(/\.[^/.]+$/, "")
      
      if (fileNameWithoutExt.length > 10 && !file.name.match(/^[A-Z0-9_-]+$/)) {
        // Filename looks descriptive, try to create a summary
        try {
          // Create a prompt that asks AI to describe what the document might be about based on filename
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
                  content: `Filename: ${file.name}\nFile type: ${fileTypeDescription}`
                }
              ],
              max_tokens: 60,
              temperature: 0.3,
            })
            
            const summary = response.choices[0]?.message?.content?.trim()
            if (summary && summary.length > 0 && summary.length <= 200) {
              documentSummary = summary
              console.log("[GoogleDriveSync] Generated AI summary from filename:", summary.substring(0, 100))
            } else {
              documentSummary = `${fileTypeDescription} from Google Drive: ${fileNameWithoutExt}`
            }
          } else {
            documentSummary = `${fileTypeDescription} from Google Drive: ${fileNameWithoutExt}`
          }
        } catch (error) {
          console.error("[GoogleDriveSync] Error generating summary:", error)
          documentSummary = `${fileTypeDescription} from Google Drive: ${fileNameWithoutExt}`
        }
      } else {
        // Filename is not descriptive, use file type
        documentSummary = `${fileTypeDescription} from Google Drive: ${fileNameWithoutExt}`
      }
      
      const { error: insertError } = await supabase
        .from("documents")
        .upsert(
          {
            source_id: source.id,
            workspace_id: workspaceId,
            external_id: file.id,
            title: file.name,
            content: documentSummary, // Store AI-generated summary for card display
            url: file.webViewLink,
            metadata: {
              mimeType: file.mimeType,
              modifiedTime: file.modifiedTime,
              size: file.size,
            },
            status: "active",
          },
          {
            onConflict: "source_id,external_id",
          },
        )

      if (!insertError) {
        syncedCount++
      }
    }

    return { success: true, syncedCount }
  } catch (error) {
    console.error("Error syncing Google Drive source:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to sync Google Drive source",
    }
  }
}

async function syncOverheidNLSource(
  source: any,
  workspaceId: string,
  supabase: any,
): Promise<{ success: boolean; error?: string; syncedCount?: number }> {
  try {
    const config = source.config || {}
    const query = config.query || config.searchQuery || ""
    const location = config.location || ""
    const maxRecords = config.maxRecords || "100"

    if (!query) {
      return { success: false, error: "Search query is required in source config" }
    }

    // Build SRU query
    let sruQuery = query
    if (location) {
      sruQuery = `${query} AND ${location}`
    }

    // Call overheid.nl SRU API
    const sruEndpoint = "https://repository.overheid.nl/sru"
    const params = new URLSearchParams({
      operation: "searchRetrieve",
      version: "1.2",
      query: sruQuery,
      maximumRecords: maxRecords,
      recordSchema: "gzd",
    })

    const response = await fetch(`${sruEndpoint}?${params}`, {
      headers: {
        Accept: "application/xml",
      },
    })

    if (!response.ok) {
      throw new Error(`SRU API returned ${response.status}: ${response.statusText}`)
    }

    const xmlText = await response.text()
    const { results } = await parseOverheidSRUResponse(xmlText)

    // Store documents in database
    let syncedCount = 0
    for (const result of results) {
      const { error: insertError } = await supabase
        .from("documents")
        .upsert(
          {
            source_id: source.id,
            workspace_id: workspaceId,
            external_id: result.identifier || result.title,
            title: result.title,
            content: result.description || result.title,
            url: result.url,
            metadata: {
              type: result.type,
              date: result.date,
              identifier: result.identifier,
            },
            status: "active",
          },
          {
            onConflict: "source_id,external_id",
          },
        )

      if (!insertError) {
        syncedCount++
      }
    }

    return { success: true, syncedCount }
  } catch (error) {
    console.error("Error syncing overheid.nl source:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to sync overheid.nl source",
    }
  }
}

async function parseOverheidSRUResponse(xmlText: string) {
  const results: Array<{
    title: string
    identifier: string
    type: string
    date?: string
    description?: string
    url?: string
  }> = []

  const { cleanOverheidDescription } = await import("@/lib/utils")

  let totalRecords = 0
  const totalMatch = xmlText.match(/<(?:sru|srw):numberOfRecords[^>]*>(\d+)<\/(?:sru|srw):numberOfRecords>/)
  if (totalMatch) {
    totalRecords = Number.parseInt(totalMatch[1], 10)
  }

  try {
    const recordRegex = /<(?:sru|srw):record>([\s\S]*?)<\/(?:sru|srw):record>/g
    const records = xmlText.match(recordRegex) || []

    for (const record of records) {
      const titleMatch = record.match(/<dcterms:title[^>]*>([\s\S]*?)<\/dcterms:title>/)
      const title = titleMatch ? titleMatch[1].trim() : "Untitled"

      const identifierMatch = record.match(/<dcterms:identifier[^>]*>([\s\S]*?)<\/dcterms:identifier>/)
      const identifier = identifierMatch ? identifierMatch[1].trim() : ""

      const typeMatch = record.match(/<dcterms:type[^>]*>([\s\S]*?)<\/dcterms:type>/)
      const type = typeMatch ? typeMatch[1].trim() : "Document"

      const dateMatch = record.match(/<dcterms:issued[^>]*>([\s\S]*?)<\/dcterms:issued>/)
      const date = dateMatch ? dateMatch[1].trim() : undefined

      const descMatch = record.match(/<dcterms:description[^>]*>([\s\S]*?)<\/dcterms:description>/)
      const rawDescription = descMatch ? descMatch[1].trim() : undefined
      const description = cleanOverheidDescription(rawDescription)

      const url = identifier ? `https://zoek.officielebekendmakingen.nl/${identifier}` : undefined

      results.push({
        title,
        identifier,
        type,
        date,
        description,
        url,
      })
    }
  } catch (error) {
    console.error("XML parsing error:", error)
  }

  return { results, totalRecords }
}

export async function syncSource(sourceId: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  // Get source details
  const { data: source, error: sourceError } = await supabase
    .from("sources")
    .select("*")
    .eq("id", sourceId)
    .single()

  if (sourceError || !source) {
    return { error: "Source not found" }
  }

  // Update source status and last sync time
  // Note: 'syncing' status may not be available in all schemas, so we'll keep it as 'active'
  await supabase
    .from("sources")
    .update({ last_sync_at: new Date().toISOString() })
    .eq("id", sourceId)

  let syncResult: { success: boolean; error?: string; syncedCount?: number; message?: string }

  // Route to appropriate sync function based on source type
  switch (source.type) {
    case "overheid_nl":
      // Overheid.nl uses manual document selection, not auto-sync
      syncResult = { success: true, message: "Overheid.nl source uses manual document selection" }
      break
    case "google_drive":
      syncResult = await syncGoogleDriveSource(source, source.workspace_id, supabase)
      break
    default:
      syncResult = { success: true, message: "Sync initiated (not yet implemented)" }
  }

  // Update source status based on sync result
  const newStatus = syncResult.success ? "active" : "error"
  await supabase.from("sources").update({ status: newStatus }).eq("id", sourceId)

  revalidatePath(`/workspaces/${source.workspace_id}`)

  if (syncResult.success) {
    return {
      success: true,
      message: syncResult.message || `Synced ${syncResult.syncedCount || 0} documents`,
    }
  } else {
    return { error: syncResult.error || "Sync failed" }
  }
}

export async function getSourcesByWorkspace(workspaceId: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { data: [], error: "Unauthorized" }
  }

  const { data, error } = await supabase
    .from("sources")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })

  if (error) {
    return { data: [], error: error.message }
  }

  return { data }
}

export async function getSourceDocuments(sourceId: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { data: [], error: "Unauthorized" }
  }

  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .eq("source_id", sourceId)
    .order("created_at", { ascending: false })

  if (error) {
    return { data: [], error: error.message }
  }

  return { data }
}
