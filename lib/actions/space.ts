"use server"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { revalidatePath } from "next/cache"
import OpenAI from "openai"
import { env } from "@/lib/env"
import { requireAuth } from "@/lib/middleware/authorization"

export async function createSpace(
  name: string,
  options?: {
    spaceType?: "national" | "regional" | "municipal" | "party" | "other"
    jurisdiction?: Record<string, any>
    visibility?: "public" | "internal" | "confidential"
    slug?: string
  },
) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  const adminClient = createAdminClient()

  // Ensure profile exists before creating space (owner_id references profiles.id)
  const { data: profile } = await adminClient
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle()

  if (!profile) {
    // Create profile if it doesn't exist (e.g., user created before trigger existed)
    // Use upsert to handle race condition where trigger creates profile simultaneously
    const { error: profileError } = await adminClient.from("profiles").upsert(
      {
        id: user.id,
        email: user.email || "",
        full_name: user.user_metadata?.full_name || null,
        avatar_url: user.user_metadata?.avatar_url || null,
      },
      {
        onConflict: "id",
      },
    )

    if (profileError) {
      console.error("[v0] Error creating profile:", profileError.message)
      return { error: "Failed to create user profile" }
    }
  }

  // Generate slug if not provided
  const slug =
    options?.slug ||
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")

  const spaceData: any = {
    name,
    slug,
    owner_id: user.id,
    space_type: options?.spaceType || "municipal",
    visibility: options?.visibility || "internal",
    jurisdiction: options?.jurisdiction || {},
  }

  const { data: newSpace, error: spaceError } = await adminClient
    .from("spaces")
    .insert(spaceData)
    .select()
    .single()

  if (spaceError) {
    console.error("[v0] Error creating space:", spaceError.message)
    
    // Handle duplicate slug error with user-friendly message
    if (spaceError.code === "23505" || spaceError.message.includes("spaces_slug_unique")) {
      return { 
        error: `A space with the name "${name}" already exists. Please choose a different name.` 
      }
    }
    
    return { error: spaceError.message }
  }

  const { error: memberError } = await adminClient.from("space_members").insert({
    space_id: newSpace.id,
    user_id: user.id,
    role: "owner",
  })

  if (memberError) {
    console.error("[v0] Error creating space member:", memberError.message)
    // Rollback: delete the space if member creation fails
    await adminClient.from("spaces").delete().eq("id", newSpace.id)
    return { error: "Failed to create space membership" }
  }

  revalidatePath("/dashboard")
  return { data: newSpace }
}

export async function updateSpace(
  spaceId: string,
  updates: {
    name?: string
    space_type?: "national" | "regional" | "municipal" | "party" | "other"
    jurisdiction?: Record<string, any>
    visibility?: "public" | "internal" | "confidential"
    logo_url?: string
    metadata?: Record<string, any>
  },
) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  const { data, error } = await supabase.from("spaces").update(updates).eq("id", spaceId).select().single()

  if (error) {
    // Handle duplicate slug error with user-friendly message
    if (error.code === "23505" || error.message.includes("spaces_slug_unique")) {
      const spaceName = updates.name || "this space"
      return { 
        error: `A space with the name "${spaceName}" already exists. Please choose a different name.` 
      }
    }
    
    return { error: error.message }
  }

  revalidatePath(`/spaces/${spaceId}`)
  return { data }
}

export async function updateSpaceScope(
  spaceId: string,
  scope: {
    summary?: string | null
    description?: string | null
    timeframe?: string | null
  },
) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  const { data: existingSpace, error: fetchError } = await supabase
    .from("spaces")
    .select("description, metadata")
    .eq("id", spaceId)
    .maybeSingle()

  if (fetchError) {
    return { error: fetchError.message }
  }

  if (!existingSpace) {
    return { error: "Space not found" }
  }

  const currentMetadata = (existingSpace?.metadata as Record<string, any> | null) ?? {}
  const currentScope = (currentMetadata.scope as Record<string, any> | null) ?? {}

  const nextMetadata = {
    ...currentMetadata,
    scope: {
      ...currentScope,
      ...(scope.description !== undefined ? { description: scope.description || null } : {}),
      ...(scope.timeframe !== undefined ? { timeframe: scope.timeframe || null } : {}),
    },
  }

  const updatesPayload: Record<string, any> = {
    metadata: nextMetadata,
  }

  if (scope.summary !== undefined) {
    updatesPayload.description = scope.summary && scope.summary.trim().length > 0 ? scope.summary : null
  }

  const { data, error } = await supabase.from("spaces").update(updatesPayload).eq("id", spaceId).select().single()

  if (error) {
    return { error: error.message }
  }

  revalidatePath(`/spaces/${spaceId}`)
  return { data }
}

export async function enhanceScopeText(
  text: string,
  options?: {
    field?: "summary" | "description"
    spaceName?: string
    missionStatement?: string
  },
): Promise<{ enhanced?: string; error?: string }> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  if (!env.OPENAI_API_KEY) {
    return { error: "OpenAI API key not configured" }
  }

  if (!text || text.trim().length === 0) {
    return { error: "Text is empty" }
  }

  const field = options?.field ?? "description"
  const isMissionStatement = field === "summary"

  try {
    const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY })

    // Build context for the prompt
    let contextParts: string[] = []
    if (isMissionStatement && options?.spaceName) {
      contextParts.push(`Space name: ${options.spaceName}`)
    }
    if (!isMissionStatement && options?.missionStatement) {
      contextParts.push(`Mission statement: ${options.missionStatement}`)
    }

    const contextText = contextParts.length > 0 ? `\n\nContext:\n${contextParts.join("\n")}` : ""

    const systemPrompt = isMissionStatement
      ? `You are a helpful assistant that writes clear, concise mission statements for policy initiatives.
The mission statement you return should:
- Be very brief and concise (1-2 sentences maximum, ideally one sentence)
- Capture the core purpose and mandate of the initiative
- Stay faithful to the original meaning
- Use neutral, professional language
- Be suitable as a high-level summary that appears at the top of a space overview`
      : `You are a helpful assistant that writes clear, comprehensive descriptions for policy initiatives.
The description you return should:
- Be more extensive than the mission statement but still concise (3-5 sentences)
- Expand on the mission statement with policy domain, stakeholders, and key objectives
- Stay faithful to the original meaning
- Use neutral, professional language
- Provide enough detail for colleagues and AI assistants to understand the scope and act accurately`

    const userPrompt = isMissionStatement
      ? `Write a concise mission statement for this initiative:${contextText}\n\nCurrent text:\n${text}`
      : `Write a comprehensive but concise description for this initiative:${contextText}\n\nCurrent text:\n${text}`

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: userPrompt,
        },
      ],
      max_tokens: isMissionStatement ? 150 : 400,
      temperature: 0.7,
    })

    const enhanced = response.choices[0]?.message?.content?.trim()
    if (enhanced && enhanced.length > 0) {
      return { enhanced }
    }

    return { error: "Failed to generate enhanced text" }
  } catch (error) {
    console.error("[enhanceScopeText] Error:", error)
    return { error: error instanceof Error ? error.message : "Failed to enhance text" }
  }
}

type SpaceSetupWizardState = {
  current_step?: number
  completed?: boolean
  completed_at?: string | null
  dismissed?: boolean
}

export async function updateSpaceSetupState(
  spaceId: string,
  updates: Partial<SpaceSetupWizardState>,
) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  const { data: existingSpace, error: fetchError } = await supabase
    .from("spaces")
    .select("metadata")
    .eq("id", spaceId)
    .maybeSingle()

  if (fetchError) {
    return { error: fetchError.message }
  }

  if (!existingSpace) {
    return { error: "Space not found" }
  }

  const currentMetadata = (existingSpace?.metadata as Record<string, any> | null) ?? {}
  const currentWizard = (currentMetadata.setupWizard as Record<string, any> | null) ?? {}

  const nextWizard: SpaceSetupWizardState = {
    ...currentWizard,
    ...updates,
  }

  if (updates.completed) {
    nextWizard.completed_at = new Date().toISOString()
  } else if (updates.completed === false && currentWizard.completed_at) {
    nextWizard.completed_at = null
  }

  const nextMetadata = {
    ...currentMetadata,
    setupWizard: nextWizard,
  }

  const { data, error } = await supabase
    .from("spaces")
    .update({ metadata: nextMetadata })
    .eq("id", spaceId)
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  revalidatePath(`/spaces/${spaceId}`)
  return { data }
}

export async function deleteSpace(spaceId: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  const { error } = await supabase.from("spaces").delete().eq("id", spaceId)

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/dashboard")
  return { success: true }
}

export async function getUserSpaces() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { data: [], error: "Unauthorized" }
  }

  const adminClient = createAdminClient()
  const { data: spaces, error } = await adminClient
    .from("spaces")
    .select("*, space_members(role, user_id)")

  if (error) {
    console.error("[v0] Error fetching spaces:", error.message)
    return { data: [], error: error.message }
  }

  if (!spaces || spaces.length === 0) {
    return { data: [] }
  }

  const result = spaces.map((space) => {
    const memberRole = space.space_members?.find((sm: any) => sm.user_id === user.id)?.role ?? "viewer"
    const { space_members, ...rest } = space

    return {
      ...rest,
      role: memberRole,
    }
  })

  return { data: result }
}
