"use server"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { revalidatePath } from "next/cache"
import OpenAI from "openai"

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
    const { error: profileError } = await adminClient.from("profiles").insert({
      id: user.id,
      email: user.email || "",
      full_name: user.user_metadata?.full_name || null,
      avatar_url: user.user_metadata?.avatar_url || null,
    })

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
    .single()

  if (fetchError) {
    return { error: fetchError.message }
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

export async function enhanceScopeText(text: string): Promise<{ enhanced?: string; error?: string }> {
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
          content: `You are a helpful assistant that writes clear, compelling scope descriptions for policy teams.
The text you return will appear on a public-sector programme overview page and should:
- Stay faithful to the original meaning
- Highlight the policy domain, stakeholders, and key objectives
- Remain concise (max 4 sentences)
- Use neutral, professional language`,
        },
        {
          role: "user",
          content: text,
        },
      ],
      max_tokens: 400,
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

  const { data: members, error: membersError } = await adminClient
    .from("space_members")
    .select("space_id, role")
    .eq("user_id", user.id)

  if (membersError) {
    console.error("[v0] Error fetching space members:", membersError.message)
    return { data: [], error: membersError.message }
  }

  if (!members || members.length === 0) {
    return { data: [] }
  }

  // Now get the space details using regular client (RLS works fine for spaces table)
  const spaceIds = members.map((m) => m.space_id)
  const { data: spaces, error: spacesError } = await supabase.from("spaces").select("*").in("id", spaceIds)

  if (spacesError) {
    console.error("[v0] Error fetching spaces:", spacesError.message)
    return { data: [], error: spacesError.message }
  }

  // Combine the data
  const result = spaces.map((space) => {
    const member = members.find((m) => m.space_id === space.id)
    return {
      ...space,
      role: member?.role || "viewer",
    }
  })

  return { data: result }
}
