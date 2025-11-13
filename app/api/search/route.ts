import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams
    const workspaceId = searchParams.get("workspaceId")
    const query = searchParams.get("query")
    const domain = searchParams.get("domain")
    const municipality = searchParams.get("municipality")
    const year = searchParams.get("year")
    const classification = searchParams.get("classification")
    const layer = searchParams.get("layer")

    if (!workspaceId || !query) {
      return NextResponse.json({ error: "workspaceId and query are required" }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Build search query
    let searchQuery = supabase
      .from("documents")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("status", "active")
      .or(`title.ilike.%${query}%,content.ilike.%${query}%`)

    // Apply filters
    if (domain) {
      searchQuery = searchQuery.eq("domain", domain)
    }

    if (municipality) {
      searchQuery = searchQuery.eq("municipality", municipality)
    }

    if (year) {
      const yearInt = parseInt(year)
      if (!isNaN(yearInt)) {
        const startDate = `${yearInt}-01-01`
        const endDate = `${yearInt}-12-31`
        searchQuery = searchQuery.gte("publication_date", startDate).lte("publication_date", endDate)
      }
    }

    if (classification) {
      searchQuery = searchQuery.eq("classification", classification)
    }

    // Layer filter requires joining with workspace -> space
    if (layer) {
      const { data: workspace } = await supabase
        .from("workspaces")
        .select("space_id, spaces(space_type)")
        .eq("id", workspaceId)
        .single()

      if (workspace?.spaces?.space_type === layer) {
        // Filter by workspace's space_type
        // Documents inherit layer from workspace space_type or document domain
        // This is a simplified filter - in production you might want more sophisticated logic
      }
    }

    const { data: results, error } = await searchQuery.limit(50)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ results: results || [] })
  } catch (error) {
    console.error("[v0] Search API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const { workspaceId, query, filters } = await req.json()

    if (!workspaceId || !query) {
      return NextResponse.json({ error: "workspaceId and query are required" }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get workspace to derive tenant_id
    const { data: workspace } = await supabase
      .from("workspaces")
      .select("space_id")
      .eq("id", workspaceId)
      .single()

    // Build search query
    let searchQuery = supabase
      .from("documents")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("status", "active")
      .or(`title.ilike.%${query}%,content.ilike.%${query}%`)

    // Apply filters
    if (filters?.domain) {
      searchQuery = searchQuery.eq("domain", filters.domain)
    }

    if (filters?.municipality) {
      searchQuery = searchQuery.eq("municipality", filters.municipality)
    }

    if (filters?.year) {
      const yearInt = parseInt(filters.year)
      if (!isNaN(yearInt)) {
        const startDate = `${yearInt}-01-01`
        const endDate = `${yearInt}-12-31`
        searchQuery = searchQuery.gte("publication_date", startDate).lte("publication_date", endDate)
      }
    }

    if (filters?.classification) {
      searchQuery = searchQuery.eq("classification", filters.classification)
    }

    const { data: results, error } = await searchQuery.limit(50)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Save search query if workspaceId is provided
    if (workspace?.space_id && filters) {
      await supabase.from("search_queries").insert({
        tenant_id: workspace.space_id,
        user_id: user.id,
        workspace_id: workspaceId,
        query,
        filters: filters || {},
      })
    }

    return NextResponse.json({ results: results || [] })
  } catch (error) {
    console.error("[v0] Search API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
