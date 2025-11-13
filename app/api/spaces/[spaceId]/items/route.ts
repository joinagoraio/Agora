import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"
import { publishSpaceItem, getSpaceItems, unpublishSpaceItem, updateSpaceItem } from "@/lib/actions/space-item"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ spaceId: string }> },
) {
  try {
    const { spaceId } = await params
    const searchParams = req.nextUrl.searchParams
    const itemType = searchParams.get("item_type") as "policy" | "document" | "answer" | "note" | null
    const classification = searchParams.get("classification") as "public" | "internal" | "confidential" | null

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const filters: any = {}
    if (itemType) filters.item_type = itemType
    if (classification) filters.classification = classification

    const { data, error } = await getSpaceItems(spaceId, filters)

    if (error) {
      return NextResponse.json({ error }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (error) {
    console.error("[v0] Space items API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ spaceId: string }> },
) {
  try {
    const { spaceId } = await params
    const body = await req.json()

    const { data, error } = await publishSpaceItem(spaceId, body)

    if (error) {
      return NextResponse.json({ error }, { status: 400 })
    }

    return NextResponse.json({ data }, { status: 201 })
  } catch (error) {
    console.error("[v0] Space items API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

