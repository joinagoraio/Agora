"use server"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { revalidatePath } from "next/cache"

export async function createSpace(name: string) {
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

  const { data: newSpace, error: spaceError } = await adminClient
    .from("spaces")
    .insert({
      name,
      owner_id: user.id,
    })
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

export async function updateSpace(spaceId: string, name: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  const { data, error } = await supabase.from("spaces").update({ name }).eq("id", spaceId).select().single()

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
