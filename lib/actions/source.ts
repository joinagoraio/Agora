"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

type SourceType = "google_drive" | "notion" | "confluence" | "sharepoint" | "dropbox" | "direct_upload" | "overheid_nl"

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
    const { results } = parseOverheidSRUResponse(xmlText)

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
            synced_at: new Date().toISOString(),
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

function parseOverheidSRUResponse(xmlText: string) {
  const results: Array<{
    title: string
    identifier: string
    type: string
    date?: string
    description?: string
    url?: string
  }> = []

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
      const description = descMatch ? descMatch[1].trim() : undefined

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
    .order("synced_at", { ascending: false })

  if (error) {
    return { data: [], error: error.message }
  }

  return { data }
}
