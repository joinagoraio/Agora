import { type NextRequest, NextResponse } from "next/server"
import { cleanOverheidDescription } from "@/lib/utils"
import { createClient } from "@/lib/supabase/server"
import { applyRateLimitHeaders, checkRateLimit, searchRateLimit, RateLimitStatus } from "@/lib/rate-limit"
import { getClientIdentifier } from "@/lib/utils/request"

export async function GET(request: NextRequest) {
  const startTime = Date.now()
  const searchParams = request.nextUrl.searchParams
  const query = searchParams.get("query")
  const location = searchParams.get("location")
  const maxRecords = searchParams.get("maxRecords") || "100"

  let rateLimitStatus: RateLimitStatus | undefined

  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    const identifier = user?.id ?? getClientIdentifier(request.headers)
    rateLimitStatus = await checkRateLimit(
      searchRateLimit,
      user ? `overheid-search:user:${user.id}` : `overheid-search:ip:${identifier}`,
    )

    const respondWithRateLimit = (response: NextResponse) =>
      applyRateLimitHeaders(response, rateLimitStatus)

    if (!rateLimitStatus.success) {
      return respondWithRateLimit(
        NextResponse.json({ error: "Search rate limit exceeded. Please wait and try again." }, { status: 429 }),
      )
    }

    if (!query) {
      return respondWithRateLimit(NextResponse.json({ error: "Query parameter is required" }, { status: 400 }))
    }

    let sruQuery = query
    if (location) {
      sruQuery = `${query} AND ${location}`
    }

    const sruEndpoint = "https://repository.overheid.nl/sru"
    const params = new URLSearchParams({
      operation: "searchRetrieve",
      version: "1.2",
      query: sruQuery,
      maximumRecords: maxRecords,
      recordSchema: "gzd",
    })

    const response = await fetch(`${sruEndpoint}?${params}`, {
      headers: {
        Accept: "application/xml",
      },
    })

    if (!response.ok) {
      throw new Error(`SRU API returned ${response.status}: ${response.statusText}`)
    }

    const xmlText = await response.text()
    const { results, totalRecords } = parseOverheidSRUResponse(xmlText)

    const totalDuration = Date.now() - startTime

    return respondWithRateLimit(
      NextResponse.json({
        results,
        metadata: {
          duration: totalDuration,
          resultCount: results.length,
          totalRecords,
          endpoint: sruEndpoint,
          query: sruQuery,
        },
      }),
    )
  } catch (error) {
    const totalDuration = Date.now() - startTime
    console.error("Overheid search error:", error)

    return applyRateLimitHeaders(
      NextResponse.json(
        {
          error: error instanceof Error ? error.message : "Search failed",
        },
        { status: 500 },
      ),
      rateLimitStatus,
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
  }

  try {
    const recordRegex = /<(?:sru|srw):record>([\s\S]*?)<\/(?:sru|srw):record>/g
    const records = xmlText.match(recordRegex) || []

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
      const rawDescription = descMatch ? descMatch[1].trim() : undefined
      const description = cleanOverheidDescription(rawDescription)

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
  } catch (error) {
    console.error("XML parsing error:", error)
  }

  return { results, totalRecords }
}
