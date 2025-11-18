import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"
import { applyRateLimitHeaders, checkRateLimit, searchRateLimit } from "@/lib/rate-limit"
import { searchQuerySchema } from "@/lib/validations/document"
import { withCache, workspaceCacheKey } from "@/lib/cache/api-cache"
import { parsePaginationParams, createPaginatedResponse, DEFAULT_PAGE_SIZE } from "@/lib/utils/pagination"
import { createErrorResponse, createSuccessResponse } from "@/lib/utils/api-error-handler"
import { ValidationError, RateLimitError } from "@/lib/utils/errors"
import { logger } from "@/lib/utils/logger"
import { getClientIdentifier } from "@/lib/utils/request"

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const identifier = user?.id ?? getClientIdentifier(req.headers)
    const rateLimitKey = user ? `workspace-search:user:${user.id}` : `workspace-search:ip:${identifier}`
    const rateLimitResult = await checkRateLimit(searchRateLimit, rateLimitKey)
    const respondWithRateLimit = (response: NextResponse) =>
      applyRateLimitHeaders(response, rateLimitResult)

    if (!rateLimitResult.success) {
      return respondWithRateLimit(
        NextResponse.json({ error: "Search rate limit exceeded. Please wait and try again." }, { status: 429 }),
      )
    }

    const searchParams = req.nextUrl.searchParams
    const workspaceId = searchParams.get("workspaceId")
    const query = searchParams.get("query")
    const domain = searchParams.get("domain")
    const municipality = searchParams.get("municipality")
    const year = searchParams.get("year")
    const classification = searchParams.get("classification")
    const layer = searchParams.get("layer")

    // Validate input with Zod
    const validationResult = searchQuerySchema.safeParse({
      workspaceId: workspaceId || "",
      query: query || "",
      domain: domain || undefined,
      municipality: municipality || undefined,
      year: year || undefined,
      classification: (classification as "public" | "internal" | "confidential" | undefined) || undefined,
      layer: layer || undefined,
    })

    if (!validationResult.success) {
      return respondWithRateLimit(
        NextResponse.json(
          {
            error: "Validation failed",
            details: validationResult.error.errors.map(e => ({
              path: e.path.join("."),
              message: e.message,
            }))
          },
          { status: 400 },
        ),
      )
    }

    const validated = validationResult.data

    if (!user) {
      return respondWithRateLimit(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
    }

    // Build search query
    let searchQuery = supabase
      .from("documents")
      .select("*")
      .eq("workspace_id", validated.workspaceId)
      .eq("status", "active")
      .or(`title.ilike.%${validated.query}%,content.ilike.%${validated.query}%`)

    // Apply filters
    if (validated.domain) {
      searchQuery = searchQuery.eq("domain", validated.domain)
    }

    if (validated.municipality) {
      searchQuery = searchQuery.eq("municipality", validated.municipality)
    }

    if (validated.year) {
      const yearInt = parseInt(validated.year)
      if (!isNaN(yearInt)) {
        const startDate = `${yearInt}-01-01`
        const endDate = `${yearInt}-12-31`
        searchQuery = searchQuery.gte("publication_date", startDate).lte("publication_date", endDate)
      }
    }

    if (validated.classification) {
      searchQuery = searchQuery.eq("classification", validated.classification)
    }

    // Layer filter requires joining with workspace -> space
    if (validated.layer) {
      const { data: workspace } = await supabase
        .from("workspaces")
        .select("space_id, spaces(space_type)")
        .eq("id", validated.workspaceId)
        .single()

      const spacesRelation = workspace?.spaces as
        | { space_type?: string | null }
        | { space_type?: string | null }[]
        | null
        | undefined
      const spaceType = Array.isArray(spacesRelation) ? spacesRelation[0]?.space_type : spacesRelation?.space_type

      if (spaceType && spaceType !== validated.layer) {
        return respondWithRateLimit(NextResponse.json({ results: [] }))
      }
    }

    // Parse pagination parameters
    const { page, pageSize } = parsePaginationParams(req.nextUrl.searchParams)

    // Get total count for pagination (only if page 1, to avoid extra query on subsequent pages)
    let total: number | undefined
    if (page === 1) {
      const { count } = await searchQuery.select("*", { count: "exact", head: true })
      total = count || undefined
    }

    // Apply pagination
    const offset = (page - 1) * pageSize
    const paginatedQuery = searchQuery.range(offset, offset + pageSize - 1)

    // Cache search results (5 minute TTL for search queries)
    // Include pagination in cache key to cache different pages separately
    const cacheKey = workspaceCacheKey("search", validated.workspaceId, {
      query: validated.query,
      domain: validated.domain,
      municipality: validated.municipality,
      year: validated.year,
      classification: validated.classification,
      layer: validated.layer,
      page,
      pageSize,
    })

    const results = await withCache(
      cacheKey,
      async () => {
        const { data, error } = await paginatedQuery
        if (error) {
          throw new Error(error.message)
        }
        return data || []
      },
      { ttl: 300 } // 5 minutes
    )

    const paginatedResponse = createPaginatedResponse(results, page, pageSize, total)
    return respondWithRateLimit(createSuccessResponse(paginatedResponse))
  } catch (error) {
    logger.error("[Search API] Error in GET handler", error)
    return createErrorResponse(error)
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const identifier = user?.id ?? getClientIdentifier(req.headers)
    const rateLimitKey = user ? `workspace-search:user:${user.id}` : `workspace-search:ip:${identifier}`
    const rateLimitResult = await checkRateLimit(searchRateLimit, rateLimitKey)
    const respondWithRateLimit = (response: NextResponse) =>
      applyRateLimitHeaders(response, rateLimitResult)

    if (!rateLimitResult.success) {
      const rateLimitError = new RateLimitError(
        "Search rate limit exceeded. Please wait and try again.",
        rateLimitResult.reset,
      )
      return respondWithRateLimit(createErrorResponse(rateLimitError))
    }

    const body = await req.json()
    const { workspaceId, query, filters, page, pageSize } = body

    // Parse pagination parameters from body
    const pagination = parsePaginationParams({
      page: page?.toString(),
      pageSize: pageSize?.toString(),
    })
    const { page: paginatedPage, pageSize: paginatedPageSize } = pagination

    // Validate input with Zod
    const validationResult = searchQuerySchema.safeParse({
      workspaceId: workspaceId || "",
      query: query || "",
      domain: filters?.domain || undefined,
      municipality: filters?.municipality || undefined,
      year: filters?.year || undefined,
      classification: filters?.classification || undefined,
      layer: filters?.layer || undefined,
    })

    if (!validationResult.success) {
      throw new ValidationError("Validation failed", {
        errors: validationResult.error.errors.map(e => ({
          path: e.path.join("."),
          message: e.message,
        }))
      })
    }

    const validated = validationResult.data

    if (!user) {
      return respondWithRateLimit(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
    }

    // Get workspace to derive tenant_id
    const { data: workspace } = await supabase
      .from("workspaces")
      .select("space_id")
      .eq("id", validated.workspaceId)
      .single()

    // Build search query
    let searchQuery = supabase
      .from("documents")
      .select("*")
      .eq("workspace_id", validated.workspaceId)
      .eq("status", "active")
      .or(`title.ilike.%${validated.query}%,content.ilike.%${validated.query}%`)

    // Apply filters
    if (validated.domain) {
      searchQuery = searchQuery.eq("domain", validated.domain)
    }

    if (validated.municipality) {
      searchQuery = searchQuery.eq("municipality", validated.municipality)
    }

    if (validated.year) {
      const yearInt = parseInt(validated.year)
      if (!isNaN(yearInt)) {
        const startDate = `${yearInt}-01-01`
        const endDate = `${yearInt}-12-31`
        searchQuery = searchQuery.gte("publication_date", startDate).lte("publication_date", endDate)
      }
    }

    if (validated.classification) {
      searchQuery = searchQuery.eq("classification", validated.classification)
    }

    // Get total count for pagination (only if page 1, to avoid extra query on subsequent pages)
    let total: number | undefined
    if (paginatedPage === 1) {
      const { count } = await searchQuery.select("*", { count: "exact", head: true })
      total = count || undefined
    }

    // Apply pagination
    const offset = (paginatedPage - 1) * paginatedPageSize
    const paginatedQuery = searchQuery.range(offset, offset + paginatedPageSize - 1)

    // Cache search results (5 minute TTL for search queries)
    // Include pagination in cache key to cache different pages separately
    const cacheKey = workspaceCacheKey("search", validated.workspaceId, {
      query: validated.query,
      domain: validated.domain,
      municipality: validated.municipality,
      year: validated.year,
      classification: validated.classification,
      layer: validated.layer,
      page: paginatedPage,
      pageSize: paginatedPageSize,
    })

    const results = await withCache(
      cacheKey,
      async () => {
        const { data, error } = await paginatedQuery
        if (error) {
          throw new Error(error.message)
        }
        return data || []
      },
      { ttl: 300 } // 5 minutes
    )

    // Save search query if workspaceId is provided (async, don't block response)
    if (workspace?.space_id && (validated.domain || validated.municipality || validated.year || validated.classification || validated.layer)) {
      supabase.from("search_queries").insert({
        tenant_id: workspace.space_id,
        user_id: user.id,
        workspace_id: validated.workspaceId,
        query: validated.query,
        filters: {
          domain: validated.domain,
          municipality: validated.municipality,
          year: validated.year,
          classification: validated.classification,
          layer: validated.layer,
        },
      }).catch(err => console.error("[Search] Failed to save search query:", err))
    }

    const paginatedResponse = createPaginatedResponse(results, paginatedPage, paginatedPageSize, total)
    return respondWithRateLimit(createSuccessResponse(paginatedResponse))
  } catch (error) {
    logger.error("[Search API] Error in POST handler", error)
    return createErrorResponse(error)
  }
}

