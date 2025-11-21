/**
 * Pagination utilities for API routes and database queries
 */

export interface PaginationParams {
  page: number
  pageSize: number
  cursor?: string
}

export interface PaginationResult<T> {
  data: T[]
  pagination: {
    page: number
    pageSize: number
    total?: number
    totalPages?: number
    hasMore: boolean
    nextCursor?: string
  }
}

export interface CursorPaginationParams {
  cursor?: string
  limit?: number
}

export interface CursorPaginationResult<T> {
  data: T[]
  nextCursor?: string
  hasMore: boolean
}

/**
 * Parse pagination parameters from request
 */
export function parsePaginationParams(
  searchParams: URLSearchParams | Record<string, string | undefined>,
): PaginationParams {
  const isURLSearchParams = searchParams instanceof URLSearchParams
  const page = isURLSearchParams ? searchParams.get("page") : (searchParams as any).page
  const pageSize = isURLSearchParams ? searchParams.get("pageSize") : (searchParams as any).pageSize
  const cursor = isURLSearchParams ? searchParams.get("cursor") : (searchParams as any).cursor

  const parsedPage = page ? parseInt(page, 10) : 1
  const parsedPageSize = pageSize ? parseInt(pageSize, 10) : 20
  
  return {
    page: isNaN(parsedPage) ? 1 : Math.max(1, parsedPage),
    pageSize: isNaN(parsedPageSize) ? 20 : Math.min(100, Math.max(1, parsedPageSize)),
    cursor: cursor || undefined,
  }
}

/**
 * Calculate pagination metadata
 */
export function calculatePaginationMeta(
  page: number,
  pageSize: number,
  total?: number,
): {
  totalPages?: number
  hasMore: boolean
} {
  const totalPages = total !== undefined ? Math.ceil(total / pageSize) : undefined
  const hasMore = total !== undefined ? page < totalPages! : true // Assume hasMore if total unknown

  return { totalPages, hasMore }
}

/**
 * Create paginated response
 */
export function createPaginatedResponse<T>(
  data: T[],
  page: number,
  pageSize: number,
  total?: number,
): PaginationResult<T> {
  const { totalPages, hasMore } = calculatePaginationMeta(page, pageSize, total)

  return {
    data,
    pagination: {
      page,
      pageSize,
      total,
      totalPages,
      hasMore,
    },
  }
}

/**
 * Create cursor-based paginated response
 */
export function createCursorPaginatedResponse<T>(
  data: T[],
  limit: number,
  getCursor: (item: T) => string,
): CursorPaginationResult<T> {
  const hasMore = data.length > limit
  const items = hasMore ? data.slice(0, limit) : data
  const nextCursor = hasMore && items.length > 0 ? getCursor(items[items.length - 1]) : undefined

  return {
    data: items,
    nextCursor,
    hasMore,
  }
}

/**
 * Decode cursor (base64 encoded JSON)
 */
export function decodeCursor<T = any>(cursor: string): T | null {
  try {
    const decoded = Buffer.from(cursor, "base64").toString("utf-8")
    return JSON.parse(decoded) as T
  } catch {
    return null
  }
}

/**
 * Encode cursor (base64 encoded JSON)
 */
export function encodeCursor(data: any): string {
  return Buffer.from(JSON.stringify(data)).toString("base64")
}

/**
 * Default page size limits
 */
export const DEFAULT_PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 100
export const MIN_PAGE_SIZE = 1

