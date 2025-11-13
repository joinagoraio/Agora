"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import OpenAI from "openai"

import { syncAllScopeDocumentsToWorkspace } from "@/lib/services/scope-documents"

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

  try {
    await syncAllScopeDocumentsToWorkspace(spaceId, data.id)
  } catch (syncError) {
    console.error("[Workspace] Failed to sync scope documents:", syncError)
  }

  revalidatePath(`/spaces/${spaceId}`)
  revalidatePath(`/workspaces/${data.id}`)
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

export async function enhanceContextText(text: string): Promise<{ enhanced?: string; error?: string }> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  if (!process.env.OPENAI_API_KEY) {
    return { error: "OpenAI API key not configured" }
  }

  if (!text || text.trim().length === 0) {
    return { error: "Text is empty" }
  }

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a helpful assistant that enhances workspace context descriptions. Your job is to improve the clarity, completeness, and usefulness of workspace context descriptions that will help AI search and understand documents better.

Rules:
- Keep the enhanced text concise but comprehensive
- Maintain the original meaning and intent
- Add relevant details that would help with document search and understanding
- Use clear, professional language
- Focus on domain, document types, and key information
- Do not add information that wasn't implied in the original text
- Return only the enhanced text, no explanations or meta-commentary`,
        },
        {
          role: "user",
          content: text,
        },
      ],
      max_tokens: 500,
      temperature: 0.7,
    })

    const enhanced = response.choices[0]?.message?.content?.trim()
    if (enhanced && enhanced.length > 0) {
      return { enhanced }
    }

    return { error: "Failed to generate enhanced text" }
  } catch (error) {
    console.error("[enhanceContextText] Error:", error)
    return { error: error instanceof Error ? error.message : "Failed to enhance text" }
  }
}
