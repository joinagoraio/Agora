import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"
import { publishSpaceItem, getSpaceItems } from "@/lib/actions/space-item"
import { assertUUIDParam } from "@/lib/utils/param-validation"
import { ValidationError } from "@/lib/utils/errors"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ spaceId: string }> },
) {
  try {
    const rawParams = await params
    const spaceId = assertUUIDParam(rawParams.spaceId, "spaceId")
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
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error("[v0] Space items API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ spaceId: string }> },
) {
  try {
    const rawParams = await params
    const spaceId = assertUUIDParam(rawParams.spaceId, "spaceId")
    const body = await req.json()

    const { data, error, warnings } = await publishSpaceItem(spaceId, body)

    if (error) {
      return NextResponse.json({ error }, { status: 400 })
    }

    return NextResponse.json({ data, warnings }, { status: 201 })
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error("[v0] Space items API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
