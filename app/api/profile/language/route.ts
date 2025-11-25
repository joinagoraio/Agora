import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { z } from "zod"

import { createClient } from "@/lib/supabase/server"
import {
  LANGUAGE_COOKIE_MAX_AGE,
  LANGUAGE_COOKIE_NAME,
  normalizeLanguageCandidate,
} from "@/lib/i18n/config"

const payloadSchema = z.object({
  language: z.string(),
})

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 })
  }

  const result = payloadSchema.safeParse(payload)
  if (!result.success) {
    return NextResponse.json({ error: "Invalid language" }, { status: 400 })
  }

  const normalizedLanguage = normalizeLanguageCandidate(result.data.language)
  if (!normalizedLanguage) {
    return NextResponse.json({ error: "Unsupported language" }, { status: 400 })
  }

  const { error, data } = await supabase
    .from("profiles")
    .update({ language: normalizedLanguage })
    .eq("id", user.id)
    .select("language")
    .single()

  if (error) {
    console.error("[i18n] Failed to persist language preference:", error)
    return NextResponse.json({ error: "Failed to update language preference" }, { status: 500 })
  }

  const cookieStore = await cookies()
  cookieStore.set({
    name: LANGUAGE_COOKIE_NAME,
    value: normalizedLanguage,
    maxAge: LANGUAGE_COOKIE_MAX_AGE,
    sameSite: "lax",
    path: "/",
  })

  return NextResponse.json({ language: data?.language ?? normalizedLanguage })
}

