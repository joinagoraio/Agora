import { type NextRequest, NextResponse } from "next/server"

interface CKANResponse {
  success: boolean
  result: {
    count: number
    results: Array<{
      id: string
      name: string
      title: string
      notes?: string
      organization?: {
        name: string
        title: string
      }
      tags?: Array<{ name: string }>
      resources?: Array<{
        id: string
        name: string
        format: string
        url: string
      }>
      metadata_created?: string
      metadata_modified?: string
    }>
  }
}

export async function GET(request: NextRequest) {
  const startTime = Date.now()
  const searchParams = request.nextUrl.searchParams
  const query = searchParams.get("query")
  const organization = searchParams.get("organization")
  const rows = searchParams.get("rows") || "100"

  if (!query) {
    return NextResponse.json({ error: "Query parameter is required" }, { status: 400 })
  }

  try {
    let searchQuery = query
    if (organization) {
      searchQuery = `${query} organization:${organization}`
    }

    const ckanEndpoint = "https://data.overheid.nl/data/api/3/action/package_search"
    const params = new URLSearchParams({
      q: searchQuery,
      rows: rows,
      start: "0",
    })

    const response = await fetch(`${ckanEndpoint}?${params}`, {
      headers: {
        Accept: "application/json",
      },
    })

    if (!response.ok) {
      throw new Error(`CKAN API returned ${response.status}: ${response.statusText}`)
    }

    const data: CKANResponse = await response.json()

    if (!data.success) {
      throw new Error("CKAN API returned unsuccessful response")
    }

    const totalDuration = Date.now() - startTime

    return NextResponse.json({
      datasets: data.result.results,
      count: data.result.count,
      metadata: {
        duration: totalDuration,
        resultCount: data.result.results.length,
        totalRecords: data.result.count,
        endpoint: ckanEndpoint,
        query: searchQuery,
      },
    })
  } catch (error) {
    const totalDuration = Date.now() - startTime
    console.error("CKAN search error:", error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Search failed",
      },
      { status: 500 },
    )
  }
}
