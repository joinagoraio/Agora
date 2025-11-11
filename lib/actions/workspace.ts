"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

export async function createWorkspace(spaceId: string, name: string, description?: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  const { data, error } = await supabase
    .from("workspaces")
    .insert({
      space_id: spaceId,
      name,
      description,
      created_by: user.id,
    })
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  revalidatePath(`/spaces/${spaceId}`)
  return { data }
}

export async function updateWorkspace(
  workspaceId: string,
  name: string,
  description?: string,
  context?: string,
  location?: string
) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  const updateData: {
    name: string
    description?: string
    context?: string
    location?: string
  } = { name }

  if (description !== undefined) {
    updateData.description = description
  }
  if (context !== undefined) {
    updateData.context = context
  }
  if (location !== undefined) {
    updateData.location = location
  }

  const { data, error } = await supabase
    .from("workspaces")
    .update(updateData)
    .eq("id", workspaceId)
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  revalidatePath(`/workspaces/${workspaceId}`)
  return { data }
}

export async function deleteWorkspace(workspaceId: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  const { error } = await supabase.from("workspaces").delete().eq("id", workspaceId)

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/dashboard")
  return { success: true }
}

export async function getWorkspacesBySpace(spaceId: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { data: [], error: "Unauthorized" }
  }

  const { data, error } = await supabase
    .from("workspaces")
    .select("*")
    .eq("space_id", spaceId)
    .order("created_at", { ascending: false })

  if (error) {
    return { data: [], error: error.message }
  }

  return { data }
}
