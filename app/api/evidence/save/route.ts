import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"
import { saveEvidenceToWorkspace } from "@/lib/actions/workspace-item"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { workspaceId, question, answer, citations, confidence } = body

    if (!workspaceId || !question || !answer || !citations || !confidence) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data, error } = await saveEvidenceToWorkspace(workspaceId, {
      question,
      answer,
      citations,
      confidence,
    })

    if (error) {
      return NextResponse.json({ error }, { status: 400 })
    }

    return NextResponse.json({ data }, { status: 201 })
  } catch (error) {
    console.error("[v0] Evidence save API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
