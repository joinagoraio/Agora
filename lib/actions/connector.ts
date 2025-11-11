"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

type ConnectorType = "google_drive" | "notion" | "confluence" | "sharepoint" | "dropbox"

export async function createConnector(
  workspaceId: string,
  name: string,
  type: ConnectorType,
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
    .from("connectors")
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

export async function updateConnector(connectorId: string, name: string, config: Record<string, any>) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  const { data, error } = await supabase
    .from("connectors")
    .update({ name, config })
    .eq("id", connectorId)
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  revalidatePath(`/connectors/${connectorId}`)
  return { data }
}

export async function deleteConnector(connectorId: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  const { error } = await supabase.from("connectors").delete().eq("id", connectorId)

  if (error) {
    return { error: error.message }
  }

  return { success: true }
}

export async function syncConnector(connectorId: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  // Get connector details
  const { data: connector, error: connectorError } = await supabase
    .from("connectors")
    .select("*")
    .eq("id", connectorId)
    .single()

  if (connectorError || !connector) {
    return { error: "Connector not found" }
  }

  // Update last sync time
  await supabase.from("connectors").update({ last_sync_at: new Date().toISOString() }).eq("id", connectorId)

  // TODO: Implement actual sync logic for each connector type
  // This would involve:
  // 1. Authenticating with the external service
  // 2. Fetching documents from the service
  // 3. Storing documents in the documents table
  // 4. Generating embeddings for RAG (next task)

  return { success: true, message: "Sync initiated" }
}

export async function getConnectorsByWorkspace(workspaceId: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { data: [], error: "Unauthorized" }
  }

  const { data, error } = await supabase
    .from("connectors")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })

  if (error) {
    return { data: [], error: error.message }
  }

  return { data }
}

export async function getConnectorDocuments(connectorId: string) {
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
    .eq("connector_id", connectorId)
    .order("synced_at", { ascending: false })

  if (error) {
    return { data: [], error: error.message }
  }

  return { data }
}
