import { type NextRequest, NextResponse } from "next/server"
import { applyRateLimitHeaders, checkRateLimit, externalSearchRateLimit, RateLimitStatus } from "@/lib/rate-limit"
import { getClientIdentifier } from "@/lib/utils/request"

export async function GET(request: NextRequest) {
  let rateLimitStatus: RateLimitStatus | undefined
  const startTime = Date.now()

  try {
    const searchParams = request.nextUrl.searchParams
    const query = searchParams.get("query")
    const collection = searchParams.get("collection") || "cvdr"
    const location = searchParams.get("location")
    const maxRecords = searchParams.get("maxRecords") || "10"

    if (!query) {
      return NextResponse.json({ error: "Query parameter is required" }, { status: 400 })
    }

    const identifier = getClientIdentifier(request.headers)
    rateLimitStatus = await checkRateLimit(externalSearchRateLimit, `sru-webservice:ip:${identifier}`)
    const respondWithRateLimit = (response: NextResponse) => applyRateLimitHeaders(response, rateLimitStatus)

    if (!rateLimitStatus.success) {
      return respondWithRateLimit(
        NextResponse.json({ error: "SRU search rate limit exceeded. Please wait and try again." }, { status: 429 }),
      )
    }

    let cqlQuery = `keyword="${query}"`

    if (location) {
      cqlQuery += ` AND (dcterms.creator="${location}" OR dcterms.spatial="${location}")`
    }

    const sruUrl = new URL("http://zoekdienst.overheid.nl/sru/Search")
    sruUrl.searchParams.set("version", "1.2")
    sruUrl.searchParams.set("operation", "searchRetrieve")
    sruUrl.searchParams.set("x-connection", collection)
    sruUrl.searchParams.set("startRecord", "1")
    sruUrl.searchParams.set("maximumRecords", maxRecords)
    sruUrl.searchParams.set("query", cqlQuery)

    const response = await fetch(sruUrl.toString(), {
      headers: {
        Accept: "application/xml",
      },
    })

    if (!response.ok) {
      if (response.status === 503) {
        return NextResponse.json(
          {
            error: "Service temporarily unavailable",
            message: "The overheid.nl SRU service is currently unavailable. Please try again later.",
            status: 503,
            serviceDown: true,
          },
          { status: 503 },
        )
      }
      throw new Error(`SRU API returned ${response.status}: ${response.statusText}`)
    }

    const xmlText = await response.text()
    const records = parseXMLRecords(xmlText)
    const totalRecords = extractTotalRecords(xmlText)

    const totalDuration = Date.now() - startTime

    return respondWithRateLimit(
      NextResponse.json({
        records,
        totalRecords,
        collection,
        metadata: {
          duration: totalDuration,
          resultCount: records.length,
          totalRecords,
          endpoint: sruUrl.origin + sruUrl.pathname,
          query: cqlQuery,
        },
      }),
    )
  } catch (error) {
    const totalDuration = Date.now() - startTime
    console.error("SRU webservice error:", error)
    return applyRateLimitHeaders(
      NextResponse.json(
        {
          error: error instanceof Error ? error.message : "Failed to search SRU webservice",
        },
        { status: 500 },
      ),
      rateLimitStatus,
    )
  }
}

function extractTotalRecords(xml: string): number {
  const match = xml.match(/<numberOfRecords>(\d+)<\/numberOfRecords>/)
  return match ? Number.parseInt(match[1], 10) : 0
}

function parseXMLRecords(xml: string): Array<{
  identifier: string
  title: string
  creator?: string
  type?: string
  modified?: string
  description?: string
  spatial?: string
  subject?: string
}> {
  const records: Array<{
    identifier: string
    title: string
    creator?: string
    type?: string
    modified?: string
    description?: string
    spatial?: string
    subject?: string
  }> = []

  const recordMatches = xml.matchAll(/<record>([\s\S]*?)<\/record>/g)

  for (const recordMatch of recordMatches) {
    const recordXml = recordMatch[1]

    const identifier = extractField(recordXml, "dcterms:identifier") || extractField(recordXml, "identifier") || ""
    const title = extractField(recordXml, "dcterms:title") || extractField(recordXml, "title") || "Untitled"
    const creator = extractField(recordXml, "dcterms:creator") || extractField(recordXml, "creator")
    const type =
      extractField(recordXml, "dcterms:type") ||
      extractField(recordXml, "type") ||
      extractField(recordXml, "overheidop:publicationName")
    const modified = extractField(recordXml, "dcterms:modified") || extractField(recordXml, "modified")
    const description =
      extractField(recordXml, "dcterms:description") ||
      extractField(recordXml, "dcterms:abstract") ||
      extractField(recordXml, "description")
    const spatial = extractField(recordXml, "dcterms:spatial") || extractField(recordXml, "spatial")
    const subject = extractField(recordXml, "dcterms:subject") || extractField(recordXml, "subject")

    if (identifier || title) {
      records.push({
        identifier,
        title,
        creator,
        type,
        modified,
        description,
        spatial,
        subject,
      })
    }
  }

  return records
}

function extractField(xml: string, fieldName: string): string | undefined {
  let match = xml.match(new RegExp(`<${fieldName}[^>]*>([^<]+)<\/${fieldName}>`, "i"))
  if (match) return match[1].trim()

  const localName = fieldName.split(":").pop()
  if (localName) {
    match = xml.match(new RegExp(`<[^:>]*:?${localName}[^>]*>([^<]+)<\/[^:>]*:?${localName}>`, "i"))
    if (match) return match[1].trim()
  }

  return undefined
}
