import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { applyRateLimitHeaders, checkRateLimit, searchRateLimit, RateLimitStatus } from "@/lib/rate-limit"
import { deduplicateRequest, generateRequestKey } from "@/lib/utils/request-deduplication"
import { env } from "@/lib/env"
import { getClientIdentifier } from "@/lib/utils/request"

interface SearchResult {
  title: string
  identifier: string
  type: string
  date?: string
  description?: string
  url?: string
  source?: string
  relevanceScore?: number
}

// Generate search queries from workspace scope using AI
async function generateSearchQueries(
  context: string,
  location?: string,
): Promise<{ queries: string[]; error?: string }> {
  const fallbackQueries = () => {
    const words = context
      .split(/\s+/)
      .filter((w) => w.length > 3)
      .slice(0, 5)
    return { queries: words.length > 0 ? [words.join(" ")] : [context.substring(0, 100)] }
  }

  try {
    const { completePlatformTask } = await import("@/lib/llm/resolve")
    const { getPlatformPrompt } = await import("@/lib/llm/prompts")
    const system = await getPlatformPrompt("overheid_search")
    const result = await completePlatformTask("overheid_search", {
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: `Workspace scope: ${context}${location ? `\nLocation: ${location}` : ""}`,
        },
      ],
      json: true,
      temperature: 0.7,
    })

    if (!result.text) {
      throw new Error("No response from AI")
    }

    const parsed = JSON.parse(result.text)
    const queries = parsed.queries || parsed.query || [context.substring(0, 100)]
    return { queries: Array.isArray(queries) ? queries : [queries] }
  } catch (error) {
    console.error("[IntelligentSearch] Error generating queries:", error)
    return fallbackQueries()
  }
}

// Search multiple endpoints
async function searchAllEndpoints(
  queries: string[],
  location?: string,
  baseUrl?: string,
): Promise<SearchResult[]> {
  const allResults: SearchResult[] = []
  const maxResultsPerQuery = 20
  const apiBase = baseUrl || env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"

  // Search overheid-search endpoint
  for (const query of queries) {
    try {
      const params = new URLSearchParams({
        query: query.trim(),
        maxRecords: maxResultsPerQuery.toString(),
        ...(location && { location: location.trim() }),
      })

      const response = await fetch(`${apiBase}/api/overheid-search?${params}`)
      if (response.ok) {
        const data = await response.json()
        if (data.results) {
          allResults.push(
            ...data.results.map((r: any) => ({
              ...r,
              source: "overheid-search",
            })),
          )
        }
      }
    } catch (error) {
      console.error("[IntelligentSearch] Error searching overheid-search:", error)
    }
  }

  // Search SRU webservice
  for (const query of queries) {
    try {
      const params = new URLSearchParams({
        query: query.trim(),
        collection: "cvdr",
        maxRecords: maxResultsPerQuery.toString(),
        ...(location && { location: location.trim() }),
      })

      const response = await fetch(`${apiBase}/api/sru-webservice?${params}`)
      if (response.ok) {
        const data = await response.json()
        if (data.records) {
          allResults.push(
            ...data.records.map((r: any) => ({
              title: r.title,
              identifier: r.identifier,
              type: r.type || "Document",
              date: r.modified,
              description: r.description,
              url: r.url,
              source: "sru-webservice",
            })),
          )
        }
      }
    } catch (error) {
      console.error("[IntelligentSearch] Error searching sru-webservice:", error)
    }
  }

  // Search official publications
  for (const query of queries) {
    try {
      const params = new URLSearchParams({
        query: query.trim(),
        maxRecords: maxResultsPerQuery.toString(),
      })

      const response = await fetch(`${apiBase}/api/official-publications?${params}`)
      if (response.ok) {
        const data = await response.json()
        if (data.publications) {
          allResults.push(
            ...data.publications.map((r: any) => ({
              title: r.title,
              identifier: r.identifier,
              type: r.type,
              date: r.publicationDate,
              description: r.description,
              url: r.url,
              source: "official-publications",
            })),
          )
        }
      }
    } catch (error) {
      console.error("[IntelligentSearch] Error searching official-publications:", error)
    }
  }

  return allResults
}

// Rank results by relevance using AI
async function rankResultsByRelevance(
  results: SearchResult[],
  context: string,
  location?: string,
): Promise<SearchResult[]> {
  if (results.length === 0) {
    return results
  }

  const rankingKey = generateRequestKey("rank-results", {
    context,
    location,
    resultIds: results.map((r) => r.identifier || r.title).sort().join(","),
  })

  return deduplicateRequest(rankingKey, async () => {
    const uniqueResults = Array.from(
      new Map(results.map((r) => [r.identifier || r.title, r])).values(),
    )

    if (uniqueResults.length === 0) {
      return []
    }

    const resultsToRank = uniqueResults.slice(0, 50)

    try {
      const { completePlatformTask } = await import("@/lib/llm/resolve")
      const { getPlatformPrompt } = await import("@/lib/llm/prompts")
      const system = await getPlatformPrompt("overheid_rank")
      const result = await completePlatformTask("overheid_search", {
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content: `Workspace scope: ${context}${location ? `\nLocation: ${location}` : ""}

Results to rank:
${resultsToRank.map((r, i) => `${i + 1}. ${r.title} (${r.identifier || "no-id"}) - ${r.description || "no description"}`).join("\n")}`,
          },
        ],
        json: true,
        temperature: 0.3,
      })

      if (!result.text) {
        return uniqueResults
      }

      const scores = JSON.parse(result.text)

      const scoredResults = resultsToRank.map((entry) => {
        const key = entry.identifier || entry.title
        const score = scores[key] || scores[entry.title] || 0.5
        return {
          ...entry,
          relevanceScore: typeof score === "number" ? score : 0.5,
        }
      })

      scoredResults.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0))
      const remainingResults = uniqueResults.slice(50)
      return [...scoredResults, ...remainingResults]
    } catch (error) {
      console.error("[IntelligentSearch] Error ranking results:", error)
      return uniqueResults
    }
  })
}

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  let rateLimitResult: RateLimitStatus | undefined

  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const identifier = user?.id ?? getClientIdentifier(request.headers)
    const rateLimitKey = user ? `overheid-search:user:${user.id}` : `overheid-search:ip:${identifier}`
    const currentRateLimit = await checkRateLimit(searchRateLimit, rateLimitKey)
    rateLimitResult = currentRateLimit
    const respondWithRateLimit = (response: NextResponse) =>
      applyRateLimitHeaders(response, rateLimitResult)

    if (!currentRateLimit.success) {
      return respondWithRateLimit(
        NextResponse.json(
          { error: "Search rate limit exceeded. Please wait and try again." },
          { status: 429 },
        ),
      )
    }

    const body = await request.json()
    const { context, location, customQueries } = body

    if (!context || context.trim().length === 0) {
      return respondWithRateLimit(NextResponse.json({ error: "Context is required" }, { status: 400 }))
    }

    // Get base URL from request
    const url = new URL(request.url)
    const baseUrl = `${url.protocol}//${url.host}`

    // Step 1: Generate search queries from context (or use custom queries if provided)
    let queries: string[]
    if (customQueries && Array.isArray(customQueries) && customQueries.length > 0) {
      queries = customQueries.filter((q: string) => q && q.trim().length > 0)
    } else {
      const { queries: generatedQueries, error: queryError } = await generateSearchQueries(context, location)
      if (queryError) {
        return respondWithRateLimit(NextResponse.json({ error: queryError }, { status: 500 }))
      }
      queries = generatedQueries
    }

    // Step 2: Search all endpoints with generated queries
    const allResults = await searchAllEndpoints(queries, location, baseUrl)

    // Step 3: Rank results by relevance
    const rankedResults = await rankResultsByRelevance(allResults, context, location)

    const totalDuration = Date.now() - startTime

    return respondWithRateLimit(
      NextResponse.json({
        results: rankedResults,
        metadata: {
          duration: totalDuration,
          resultCount: rankedResults.length,
          queriesGenerated: queries.length,
          queries,
        },
      }),
    )
  } catch (error) {
    const totalDuration = Date.now() - startTime
    console.error("[IntelligentSearch] Error:", error)
    return applyRateLimitHeaders(
      NextResponse.json(
        {
          error: error instanceof Error ? error.message : "Search failed",
        },
        { status: 500 },
      ),
      rateLimitResult,
    )
  }
}

