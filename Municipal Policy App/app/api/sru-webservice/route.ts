import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  const startTime = Date.now()

  try {
    const searchParams = request.nextUrl.searchParams
    const query = searchParams.get("query")
    const collection = searchParams.get("collection") || "cvdr"
    const location = searchParams.get("location")
    const maxRecords = searchParams.get("maxRecords") || "10"

    console.log("[v0] SRU Webservice API called")
    console.log("[v0] Parameters:", { query, collection, location, maxRecords })

    if (!query) {
      console.log("[v0] Error: Missing query parameter")
      return NextResponse.json({ error: "Query parameter is required" }, { status: 400 })
    }

    let cqlQuery = `keyword="${query}"`

    if (location) {
      cqlQuery += ` AND (dcterms.creator="${location}" OR dcterms.spatial="${location}")`
    }
    console.log("[v0] Built CQL query:", cqlQuery)

    const sruUrl = new URL("http://zoekdienst.overheid.nl/sru/Search")
    sruUrl.searchParams.set("version", "1.2")
    sruUrl.searchParams.set("operation", "searchRetrieve")
    sruUrl.searchParams.set("x-connection", collection)
    sruUrl.searchParams.set("startRecord", "1")
    sruUrl.searchParams.set("maximumRecords", maxRecords)
    sruUrl.searchParams.set("query", cqlQuery)

    console.log("[v0] Full SRU URL:", sruUrl.toString())
    console.log("[v0] Sending request to SRU webservice...")

    const fetchStart = Date.now()
    const response = await fetch(sruUrl.toString(), {
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
    console.log("[v0] Received XML response, length:", xmlText.length, "bytes")
    console.log("[v0] XML preview:", xmlText.substring(0, 300))

    const records = parseXMLRecords(xmlText)
    const totalRecords = extractTotalRecords(xmlText)

    console.log("[v0] Successfully parsed", records.length, "records")
    console.log("[v0] Total records available:", totalRecords)

    const totalDuration = Date.now() - startTime
    console.log("[v0] Total request duration:", totalDuration, "ms")

    return NextResponse.json({
      records,
      totalRecords,
      collection,
      metadata: {
        duration: totalDuration,
        fetchDuration,
        resultCount: records.length,
        endpoint: sruUrl.origin + sruUrl.pathname,
        query: cqlQuery,
      },
    })
  } catch (error) {
    const totalDuration = Date.now() - startTime
    console.error("[v0] SRU webservice error after", totalDuration, "ms:", error)
    console.error("[v0] Error stack:", error instanceof Error ? error.stack : "No stack trace")
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to search SRU webservice",
        details: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 },
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

  console.log("[v0] XML parsing: Extracting records...")

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

  console.log("[v0] Successfully parsed all records")
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
