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

  console.log("[v0] CKAN Search API called")
  console.log("[v0] Parameters:", { query, organization, rows })

  if (!query) {
    console.log("[v0] Error: Missing query parameter")
    return NextResponse.json({ error: "Query parameter is required" }, { status: 400 })
  }

  try {
    let searchQuery = query
    if (organization) {
      searchQuery = `${query} organization:${organization}`
    }
    console.log("[v0] Built CKAN query:", searchQuery)

    const ckanEndpoint = "https://data.overheid.nl/data/api/3/action/package_search"
    const params = new URLSearchParams({
      q: searchQuery,
      rows: rows,
      start: "0",
    })

    const fullUrl = `${ckanEndpoint}?${params}`
    console.log("[v0] Full request URL:", fullUrl)
    console.log("[v0] Sending request to CKAN API...")

    const fetchStart = Date.now()
    const response = await fetch(fullUrl, {
      headers: {
        Accept: "application/json",
      },
    })
    const fetchDuration = Date.now() - fetchStart

    console.log("[v0] Response received in", fetchDuration, "ms")
    console.log("[v0] Response status:", response.status, response.statusText)
    console.log("[v0] Response headers:", Object.fromEntries(response.headers.entries()))

    if (!response.ok) {
      const errorText = await response.text()
      console.log("[v0] Error response body:", errorText.substring(0, 500))
      throw new Error(`CKAN API returned ${response.status}: ${response.statusText}`)
    }

    const data: CKANResponse = await response.json()
    console.log("[v0] CKAN response success:", data.success)
    console.log("[v0] Total datasets found:", data.result?.count)
    console.log("[v0] Datasets in response:", data.result?.results?.length)

    if (!data.success) {
      console.log("[v0] CKAN returned unsuccessful response")
      throw new Error("CKAN API returned unsuccessful response")
    }

    const totalDuration = Date.now() - startTime
    console.log("[v0] Total request duration:", totalDuration, "ms")

    return NextResponse.json({
      datasets: data.result.results,
      count: data.result.count,
      metadata: {
        duration: totalDuration,
        fetchDuration,
        resultCount: data.result.results.length,
        endpoint: ckanEndpoint,
        query: searchQuery,
      },
    })
  } catch (error) {
    const totalDuration = Date.now() - startTime
    console.error("[v0] CKAN search error after", totalDuration, "ms:", error)
    console.error("[v0] Error stack:", error instanceof Error ? error.stack : "No stack trace")
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Search failed",
        details: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 },
    )
  }
}
