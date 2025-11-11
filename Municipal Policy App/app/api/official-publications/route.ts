import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  const startTime = Date.now()
  const searchParams = request.nextUrl.searchParams
  const query = searchParams.get("query")
  const type = searchParams.get("type")
  const maxRecords = searchParams.get("maxRecords") || "20"

  console.log("[v0] Official Publications API called")
  console.log("[v0] Parameters:", { query, type, maxRecords })

  if (!query) {
    console.log("[v0] Error: Missing query parameter")
    return NextResponse.json({ error: "Query parameter is required" }, { status: 400 })
  }

  try {
    let searchQuery = query

    if (type && type !== "all") {
      searchQuery = `${query} AND type:${type}`
    }
    console.log("[v0] Built search query:", searchQuery)

    const apiEndpoint = "https://repository.overheid.nl/sru"
    const params = new URLSearchParams({
      operation: "searchRetrieve",
      version: "1.2",
      query: searchQuery,
      maximumRecords: maxRecords,
      recordSchema: "gzd",
      startRecord: "1",
    })

    const fullUrl = `${apiEndpoint}?${params}`
    console.log("[v0] Full request URL:", fullUrl)
    console.log("[v0] Sending request to Official Publications API...")

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
      throw new Error(`API returned ${response.status}: ${response.statusText}`)
    }

    const xmlText = await response.text()
    console.log("[v0] Received XML response, length:", xmlText.length, "bytes")
    console.log("[v0] XML preview:", xmlText.substring(0, 300))

    const publications = parsePublicationsResponse(xmlText)
    console.log("[v0] Successfully parsed", publications.length, "publications")

    const totalDuration = Date.now() - startTime
    console.log("[v0] Total request duration:", totalDuration, "ms")

    return NextResponse.json({
      publications,
      metadata: {
        duration: totalDuration,
        fetchDuration,
        resultCount: publications.length,
        endpoint: apiEndpoint,
        query: searchQuery,
      },
    })
  } catch (error) {
    const totalDuration = Date.now() - startTime
    console.error("[v0] Official publications search error after", totalDuration, "ms:", error)
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

function parsePublicationsResponse(xmlText: string) {
  const publications: Array<{
    identifier: string
    title: string
    type: string
    publicationDate?: string
    publisher?: string
    subject?: string
    description?: string
    url?: string
  }> = []

  try {
    const recordRegex = /<srw:record>([\s\S]*?)<\/srw:record>/g
    const records = xmlText.match(recordRegex) || []

    console.log("[v0] XML parsing: Found", records.length, "record elements")

    for (const record of records) {
      const titleMatch = record.match(/<dcterms:title[^>]*>([\s\S]*?)<\/dcterms:title>/)
      const title = titleMatch ? titleMatch[1].trim() : "Untitled"

      const identifierMatch = record.match(/<dcterms:identifier[^>]*>([\s\S]*?)<\/dcterms:identifier>/)
      const identifier = identifierMatch ? identifierMatch[1].trim() : ""

      const typeMatch = record.match(/<dcterms:type[^>]*>([\s\S]*?)<\/dcterms:type>/)
      const type = typeMatch ? typeMatch[1].trim() : "Publication"

      const dateMatch = record.match(/<dcterms:issued[^>]*>([\s\S]*?)<\/dcterms:issued>/)
      const publicationDate = dateMatch ? dateMatch[1].trim() : undefined

      const publisherMatch = record.match(/<dcterms:publisher[^>]*>([\s\S]*?)<\/dcterms:publisher>/)
      const publisher = publisherMatch ? publisherMatch[1].trim() : undefined

      const subjectMatch = record.match(/<dcterms:subject[^>]*>([\s\S]*?)<\/dcterms:subject>/)
      const subject = subjectMatch ? subjectMatch[1].trim() : undefined

      const descMatch = record.match(/<dcterms:description[^>]*>([\s\S]*?)<\/dcterms:description>/)
      const description = descMatch ? descMatch[1].trim() : undefined

      const url = identifier ? `https://zoek.officielebekendmakingen.nl/${identifier}.html` : undefined

      publications.push({
        identifier,
        title,
        type,
        publicationDate,
        publisher,
        subject,
        description,
        url,
      })
    }

    console.log("[v0] Successfully parsed all records")
  } catch (error) {
    console.error("[v0] XML parsing error:", error)
    console.error("[v0] Failed XML snippet:", xmlText.substring(0, 500))
  }

  return publications
}
