import { type NextRequest, NextResponse } from "next/server"

import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { assertUUIDParam } from "@/lib/utils/param-validation"
import { ValidationError } from "@/lib/utils/errors"

export const runtime = "nodejs"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ spaceId: string; itemId: string }> },
) {
  try {
    const raw = await params
    const spaceId = assertUUIDParam(raw.spaceId, "spaceId")
    const itemId = assertUUIDParam(raw.itemId, "itemId")

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const adminClient = createAdminClient()
    const { data: membership } = await adminClient
      .from("space_members")
      .select("role")
      .eq("space_id", spaceId)
      .eq("user_id", user.id)
      .maybeSingle()

    if (!membership) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: item } = await adminClient
      .from("space_items")
      .select("id, payload")
      .eq("id", itemId)
      .eq("space_id", spaceId)
      .maybeSingle()

    if (!item) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    const payload = (item.payload ?? {}) as { full_text?: string; summary?: string }
    const text = (payload.full_text || payload.summary || "").trim()
    if (!text) {
      return NextResponse.json({ error: "No content" }, { status: 404 })
    }

    return new NextResponse(text, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "private, max-age=60",
      },
    })
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json({ error: "Failed to load text" }, { status: 500 })
  }
}
