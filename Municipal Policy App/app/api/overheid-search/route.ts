import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  const startTime = Date.now()
  const searchParams = request.nextUrl.searchParams
  const query = searchParams.get("query")
  const location = searchParams.get("location")
  const maxRecords = searchParams.get("maxRecords") || "100"

  console.log("[v0] Overheid Search API called")
  console.log("[v0] Parameters:", { query, location, maxRecords })

  if (!query) {
    console.log("[v0] Error: Missing query parameter")
    return NextResponse.json({ error: "Query parameter is required" }, { status: 400 })
  }

  try {
    let sruQuery = query
    if (location) {
      sruQuery = `${query} AND ${location}`
    }
    console.log("[v0] Built SRU query:", sruQuery)

    const sruEndpoint = "https://repository.overheid.nl/sru"
    const params = new URLSearchParams({
      operation: "searchRetrieve",
      version: "1.2",
      query: sruQuery,
      maximumRecords: maxRecords,
      recordSchema: "gzd",
    })

    const fullUrl = `${sruEndpoint}?${params}`
    console.log("[v0] Full request URL:", fullUrl)
    console.log("[v0] Sending request to SRU endpoint...")

    const fetchStart = Date.now()
    const response = await fetch(fullUrl, {
      headers: {
        Accept: "application/xml",
      },
    })
    const fetchDuration = Date.now() - fetchStart

    console.log("[v0] Response received in", fetchDuration, "ms")
    console.log("[v0] Response status:", response.status, response.statusText)
    console.log("[v0] Response headers:", Object.fromEntries(response.headers.entries()))

    if (!response.ok) {
      const errorText = await response.text()
      console.log("[v0] Error response body:", errorText.substring(0, 500))
      throw new Error(`SRU API returned ${response.status}: ${response.statusText}`)
    }

    const xmlText = await response.text()
    console.log("[v0] Received XML response, length:", xmlText.length, "bytes")
    console.log("[v0] XML preview:", xmlText.substring(0, 300))

    const { results, totalRecords } = parseOverheidSRUResponse(xmlText)
    console.log("[v0] Successfully parsed", results.length, "results out of", totalRecords, "total")

    const totalDuration = Date.now() - startTime
    console.log("[v0] Total request duration:", totalDuration, "ms")

    return NextResponse.json({
      results,
      metadata: {
        duration: totalDuration,
        fetchDuration,
        resultCount: results.length,
        totalRecords,
        endpoint: sruEndpoint,
        query: sruQuery,
      },
    })
  } catch (error) {
    const totalDuration = Date.now() - startTime
    console.error("[v0] Overheid search error after", totalDuration, "ms:", error)
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

function parseOverheidSRUResponse(xmlText: string) {
  const results: Array<{
    title: string
    identifier: string
    type: string
    date?: string
    description?: string
    url?: string
  }> = []

  let totalRecords = 0
  const totalMatch = xmlText.match(/<(?:sru|srw):numberOfRecords[^>]*>(\d+)<\/(?:sru|srw):numberOfRecords>/)
  if (totalMatch) {
    totalRecords = Number.parseInt(totalMatch[1], 10)
    console.log("[v0] Total records available:", totalRecords)
  }

  try {
    const recordRegex = /<(?:sru|srw):record>([\s\S]*?)<\/(?:sru|srw):record>/g
    const records = xmlText.match(recordRegex) || []

    console.log("[v0] XML parsing: Found", records.length, "record elements")

    for (const record of records) {
      const titleMatch = record.match(/<dcterms:title[^>]*>([\s\S]*?)<\/dcterms:title>/)
      const title = titleMatch ? titleMatch[1].trim() : "Untitled"

      const identifierMatch = record.match(/<dcterms:identifier[^>]*>([\s\S]*?)<\/dcterms:identifier>/)
      const identifier = identifierMatch ? identifierMatch[1].trim() : ""

      const typeMatch = record.match(/<dcterms:type[^>]*>([\s\S]*?)<\/dcterms:type>/)
      const type = typeMatch ? typeMatch[1].trim() : "Document"

      const dateMatch = record.match(/<dcterms:issued[^>]*>([\s\S]*?)<\/dcterms:issued>/)
      const date = dateMatch ? dateMatch[1].trim() : undefined

      const descMatch = record.match(/<dcterms:description[^>]*>([\s\S]*?)<\/dcterms:description>/)
      const description = descMatch ? descMatch[1].trim() : undefined

      const url = identifier ? `https://zoek.officielebekendmakingen.nl/${identifier}` : undefined

      results.push({
        title,
        identifier,
        type,
        date,
        description,
        url,
      })
    }

    console.log("[v0] Successfully parsed all records")
  } catch (error) {
    console.error("[v0] XML parsing error:", error)
    console.error("[v0] Failed XML snippet:", xmlText.substring(0, 500))
  }

  return { results, totalRecords }
}
