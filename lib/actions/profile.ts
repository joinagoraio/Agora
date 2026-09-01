"use server"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { isPlaceholderProfileName } from "@/lib/profile/display-name"
import { AVATAR_APP_PREFIX, toAppAvatarUrl } from "@/lib/profile/avatar-url"

const AVATAR_MAX_BYTES = 2 * 1024 * 1024
const AVATAR_TYPES = new Set(["image/jpeg", "image/png", "image/webp"])

export type OwnProfile = {
  fullName: string | null
  avatarUrl: string | null
  setupDismissed: boolean
}

function profileFromAuth(user: {
  email?: string | null
  user_metadata?: Record<string, unknown> | null
}) {
  const metaName = user.user_metadata?.full_name as string | undefined
  const fullName = metaName?.trim() || null
  return {
    fullName,
    avatarUrl: toAppAvatarUrl((user.user_metadata?.avatar_url as string | undefined) || null),
    setupDismissed: !isPlaceholderProfileName(fullName, user.email),
  } satisfies OwnProfile
}

export async function getOwnProfile(): Promise<{ data?: OwnProfile; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Unauthorized" }

  const fallback = profileFromAuth(user)
  const { data, error } = await supabase
    .from("profiles")
    .select("full_name, avatar_url, profile_setup_dismissed_at")
    .eq("id", user.id)
    .maybeSingle()
  if (error) return { data: fallback }

  const fullName = data?.full_name || fallback.fullName
  return {
    data: {
      fullName: fullName?.trim() || null,
      avatarUrl: toAppAvatarUrl(data?.avatar_url || fallback.avatarUrl),
      setupDismissed: Boolean(data?.profile_setup_dismissed_at) || !isPlaceholderProfileName(fullName, user.email),
    },
  }
}

export async function updateOwnProfile(input: { fullName?: string; dismissSetup?: boolean }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Unauthorized" }

  const fullName = input.fullName?.trim() ?? undefined
  if (fullName !== undefined && fullName.length < 2) {
    return { error: "Name is too short" }
  }

  const patch: Record<string, string | null> = {
    updated_at: new Date().toISOString(),
  }
  if (fullName !== undefined) patch.full_name = fullName
  if (input.dismissSetup) patch.profile_setup_dismissed_at = new Date().toISOString()
  if (fullName && fullName.length >= 2) patch.profile_setup_dismissed_at = new Date().toISOString()

  const { data, error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("id", user.id)
    .select("full_name, avatar_url, profile_setup_dismissed_at")
    .single()
  if (error) return { error: error.message }

  if (fullName !== undefined) {
    await supabase.auth.updateUser({ data: { full_name: fullName } })
  }

  return {
    data: {
      fullName: data.full_name,
      avatarUrl: data.avatar_url,
      setupDismissed: Boolean(data.profile_setup_dismissed_at),
    },
  }
}

export async function uploadOwnAvatar(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Unauthorized" }

  const file = formData.get("file")
  if (!(file instanceof File) || file.size < 1) return { error: "No file" }
  if (file.size > AVATAR_MAX_BYTES) return { error: "File too large" }
  if (!AVATAR_TYPES.has(file.type)) return { error: "Unsupported file type" }

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg"
  const path = `${user.id}/avatar.${ext}`
  const admin = createAdminClient()
  const buffer = Buffer.from(await file.arrayBuffer())
  const { error: uploadError } = await admin.storage.from("avatars").upload(path, buffer, {
    contentType: file.type,
    upsert: true,
  })
  if (uploadError) return { error: uploadError.message }

  const avatarUrl = `${AVATAR_APP_PREFIX}${path}?v=${Date.now()}`

  const { error } = await supabase
    .from("profiles")
    .update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() })
    .eq("id", user.id)
  if (error) return { error: error.message }

  await supabase.auth.updateUser({ data: { avatar_url: avatarUrl } })
  return { data: { avatarUrl } }
}
