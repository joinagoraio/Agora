import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import OpenAI from "openai"
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
  if (!env.OPENAI_API_KEY) {
    // Fallback: extract key terms from context
    const words = context
      .split(/\s+/)
      .filter((w) => w.length > 3)
      .slice(0, 5)
    return { queries: words.length > 0 ? [words.join(" ")] : [context.substring(0, 100)] }
  }

  try {
    const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY })

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a search query generator for Dutch government documents. Your job is to convert workspace scope descriptions into effective search queries for Overheid.nl APIs.

Rules:
- Generate 3-5 distinct search queries that would find relevant Dutch government documents
- Each query should focus on different aspects or keywords from the scope
- Use Dutch government terminology and official document types (e.g., "bestemmingsplan", "verordening", "beleidsnota")
- Keep queries concise (2-5 key terms each)
- Include location-specific terms if location is provided
- Return queries as a JSON array of strings

Examples:
- Scope: "Municipal policy for public space management" → ["openbare ruimte beheer", "gemeentelijk beleid openbare ruimte", "verordening openbare ruimte"]
- Scope: "Building permits and zoning regulations" → ["bouwvergunning", "bestemmingsplan", "ruimtelijke ordening"]`,
        },
        {
          role: "user",
          content: `Workspace scope: ${context}${location ? `\nLocation: ${location}` : ""}`,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      throw new Error("No response from AI")
    }

    const parsed = JSON.parse(content)
    const queries = parsed.queries || parsed.query || [context.substring(0, 100)]

    return { queries: Array.isArray(queries) ? queries : [queries] }
  } catch (error) {
    console.error("[IntelligentSearch] Error generating queries:", error)
    // Fallback to simple query
    return { queries: [context.substring(0, 100)] }
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
  if (!env.OPENAI_API_KEY || results.length === 0) {
    return results
  }

  // Deduplicate ranking requests (same results + context = same ranking)
  const rankingKey = generateRequestKey("rank-results", {
    context,
    location,
    resultIds: results.map(r => r.identifier || r.title).sort().join(","),
  })

  return deduplicateRequest(rankingKey, async () => {
    // Remove duplicates based on identifier
    const uniqueResults = Array.from(
      new Map(results.map((r) => [r.identifier || r.title, r])).values(),
    )

    if (uniqueResults.length === 0) {
      return []
    }

    // Limit to top 50 for ranking (to avoid token limits)
    const resultsToRank = uniqueResults.slice(0, 50)

    try {
      const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY })

      const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a relevance ranking assistant. Your job is to rank search results by how relevant they are to a workspace scope.

Rules:
- Score each result from 0.0 to 1.0 based on relevance
- 1.0 = highly relevant, directly matches the scope
- 0.5 = somewhat relevant, related topic
- 0.0 = not relevant
- Consider title, description, and type when scoring
- Return a JSON object with identifiers/titles as keys and scores as values

Return format: {"identifier_or_title": score, ...}`,
        },
        {
          role: "user",
          content: `Workspace scope: ${context}${location ? `\nLocation: ${location}` : ""}

Results to rank:
${resultsToRank.map((r, i) => `${i + 1}. ${r.title} (${r.identifier || "no-id"}) - ${r.description || "no description"}`).join("\n")}`,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    })

      const content = response.choices[0]?.message?.content
      if (!content) {
        return uniqueResults
      }

      const scores = JSON.parse(content)

      // Add scores to results
      const scoredResults = resultsToRank.map((result) => {
        const key = result.identifier || result.title
        const score = scores[key] || scores[result.title] || 0.5
        return {
          ...result,
          relevanceScore: typeof score === "number" ? score : 0.5,
        }
      })

      // Sort by relevance score (highest first)
      scoredResults.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0))

      // Add remaining results (not ranked) at the end
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

