import { type NextRequest, NextResponse } from "next/server"

interface SPARQLResponse {
  head: {
    vars: string[]
  }
  results: {
    bindings: Array<{
      [key: string]: {
        type: string
        value: string
        datatype?: string
      }
    }>
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    const body = await request.json()
    const { mode, searchTerm, query } = body

    console.log("[v0] LiDO SPARQL API called")
    console.log("[v0] Parameters:", { mode, searchTerm: searchTerm?.substring(0, 50), hasCustomQuery: !!query })

    const totalDuration = Date.now() - startTime
    console.log("[v0] LiDO SPARQL endpoint is not publicly available")

    return NextResponse.json(
      {
        error: "SPARQL Endpoint Not Available",
        message:
          "The LiDO SPARQL endpoint (api.linkeddata.overheid.nl) is not publicly accessible. The Linked Data Overheid dataset is available as a data dump, but does not provide a public SPARQL query interface.",
        suggestion:
          "Use the CKAN Metadata API instead to search for datasets, or download the LiDO data dump from data.overheid.nl.",
        metadata: {
          duration: totalDuration,
          endpoint: "https://api.linkeddata.overheid.nl/sparql",
          status: "unavailable",
        },
      },
      { status: 503 },
    )
  } catch (error) {
    const totalDuration = Date.now() - startTime
    console.error("[v0] LiDO SPARQL error after", totalDuration, "ms:", error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Query failed",
        details: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 },
    )
  }
}
