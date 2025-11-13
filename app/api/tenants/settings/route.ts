import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"
import { revalidatePath } from "next/cache"

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get user's spaces (tenants)
    const { data: spaces, error } = await supabase
      .from("spaces")
      .select("id, name, slug, logo_url, metadata")
      .limit(1) // For MVP, assume single tenant per user

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Return first space as tenant settings (MVP assumption)
    return NextResponse.json({ data: spaces?.[0] || null })
  } catch (error) {
    console.error("[v0] Tenant settings API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const { spaceId, name, logo_url, metadata } = body

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Verify user has permission to update space
    const { data: member } = await supabase
      .from("space_members")
      .select("role")
      .eq("space_id", spaceId)
      .eq("user_id", user.id)
      .single()

    if (!member || !["owner", "admin", "tenant_admin", "org_manager"].includes(member.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const updateData: any = {}
    if (name !== undefined) updateData.name = name
    if (logo_url !== undefined) updateData.logo_url = logo_url
    if (metadata !== undefined) updateData.metadata = metadata

    const { data, error } = await supabase
      .from("spaces")
      .update(updateData)
      .eq("id", spaceId)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    revalidatePath("/settings")
    return NextResponse.json({ data })
  } catch (error) {
    console.error("[v0] Tenant settings API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
