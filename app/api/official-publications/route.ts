import { type NextRequest, NextResponse } from "next/server"
import { applyRateLimitHeaders, checkRateLimit, externalSearchRateLimit, RateLimitStatus } from "@/lib/rate-limit"
import { getClientIdentifier } from "@/lib/utils/request"

export async function GET(request: NextRequest) {
  let rateLimitStatus: RateLimitStatus | undefined
  const startTime = Date.now()
  const searchParams = request.nextUrl.searchParams
  const query = searchParams.get("query")
  const type = searchParams.get("type")
  const maxRecords = searchParams.get("maxRecords") || "20"

  if (!query) {
    return NextResponse.json({ error: "Query parameter is required" }, { status: 400 })
  }

  try {
    const identifier = getClientIdentifier(request.headers)
    rateLimitStatus = await checkRateLimit(externalSearchRateLimit, `official-publications:ip:${identifier}`)
    const respondWithRateLimit = (response: NextResponse) => applyRateLimitHeaders(response, rateLimitStatus)

    if (!rateLimitStatus.success) {
      return respondWithRateLimit(
        NextResponse.json(
          { error: "Official publications search rate limit exceeded. Please wait and try again." },
          { status: 429 },
        ),
      )
    }

    let searchQuery = query

    if (type && type !== "all") {
      searchQuery = `${query} AND type:${type}`
    }

    const apiEndpoint = "https://repository.overheid.nl/sru"
    const params = new URLSearchParams({
      operation: "searchRetrieve",
      version: "1.2",
      query: searchQuery,
      maximumRecords: maxRecords,
      recordSchema: "gzd",
      startRecord: "1",
    })

    const response = await fetch(`${apiEndpoint}?${params}`, {
      headers: {
        Accept: "application/xml",
      },
    })

    if (!response.ok) {
      throw new Error(`API returned ${response.status}: ${response.statusText}`)
    }

    const xmlText = await response.text()
    const { publications, totalRecords } = parsePublicationsResponse(xmlText)

    const totalDuration = Date.now() - startTime

    return respondWithRateLimit(
      NextResponse.json({
        publications,
        metadata: {
          duration: totalDuration,
          resultCount: publications.length,
          totalRecords,
          endpoint: apiEndpoint,
          query: searchQuery,
        },
      }),
    )
  } catch (error) {
    const totalDuration = Date.now() - startTime
    console.error("Official publications search error:", error)
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

  let totalRecords = 0
  const totalMatch = xmlText.match(/<(?:sru|srw):numberOfRecords[^>]*>(\d+)<\/(?:sru|srw):numberOfRecords>/)
  if (totalMatch) {
    totalRecords = Number.parseInt(totalMatch[1], 10)
  }

  try {
    const recordRegex = /<srw:record>([\s\S]*?)<\/srw:record>/g
    const records = xmlText.match(recordRegex) || []

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
  } catch (error) {
    console.error("XML parsing error:", error)
  }

  return { publications, totalRecords }
}
