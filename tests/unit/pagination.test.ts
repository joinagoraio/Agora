import { describe, it, expect } from "vitest"
import { parsePaginationParams, createPaginatedResponse, DEFAULT_PAGE_SIZE } from "@/lib/utils/pagination"

describe("Pagination Utilities", () => {
  describe("parsePaginationParams", () => {
    it("returns default values when no params provided", () => {
      const result = parsePaginationParams({})
      expect(result.page).toBe(1)
      expect(result.pageSize).toBe(20) // DEFAULT_PAGE_SIZE
    })

    it("parses valid page and pageSize", () => {
      const result = parsePaginationParams({ page: "2", pageSize: "50" })
      expect(result.page).toBe(2)
      expect(result.pageSize).toBe(50)
    })

    it("clamps page to minimum of 1", () => {
      const result = parsePaginationParams({ page: "0", pageSize: "20" })
      expect(result.page).toBe(1)
    })

    it("clamps pageSize to maximum of 100", () => {
      const result = parsePaginationParams({ page: "1", pageSize: "200" })
      expect(result.pageSize).toBe(100)
    })

    it("clamps pageSize to minimum of 1", () => {
      const result = parsePaginationParams({ page: "1", pageSize: "0" })
      expect(result.pageSize).toBe(1)
    })

    it("handles invalid page numbers", () => {
      const result = parsePaginationParams({ page: "invalid", pageSize: "20" })
      // parseInt("invalid") returns NaN, which is now handled and defaults to 1
      expect(result.page).toBe(1)
    })

    it("handles invalid pageSize", () => {
      const result = parsePaginationParams({ page: "1", pageSize: "invalid" })
      // parseInt("invalid") returns NaN, which is now handled and defaults to 20
      expect(result.pageSize).toBe(20)
    })
  })

  describe("createPaginatedResponse", () => {
    it("creates paginated response with data", () => {
      const data = [1, 2, 3, 4, 5]
      const result = createPaginatedResponse(data, 1, 20, 100)
      
      expect(result.data).toEqual(data)
      expect(result.pagination.page).toBe(1)
      expect(result.pagination.pageSize).toBe(20)
      expect(result.pagination.total).toBe(100)
      expect(result.pagination.totalPages).toBe(5)
      expect(result.pagination.hasMore).toBe(true)
    })

    it("calculates totalPages correctly", () => {
      const result = createPaginatedResponse([], 1, 20, 100)
      expect(result.pagination.totalPages).toBe(5)
    })

    it("handles last page correctly", () => {
      const data = [1, 2, 3]
      const result = createPaginatedResponse(data, 5, 20, 100)
      
      expect(result.pagination.hasMore).toBe(false)
    })

    it("handles first page correctly", () => {
      const data = [1, 2, 3]
      const result = createPaginatedResponse(data, 1, 20, 100)
      
      expect(result.pagination.hasMore).toBe(true)
    })

    it("uses undefined total when total not provided", () => {
      const data = [1, 2, 3]
      const result = createPaginatedResponse(data, 1, 20)
      
      expect(result.pagination.total).toBeUndefined()
      expect(result.pagination.totalPages).toBeUndefined()
      expect(result.pagination.hasMore).toBe(true) // Assumes hasMore when total unknown
    })

    it("handles empty data", () => {
      const result = createPaginatedResponse([], 1, 20, 0)
      
      expect(result.data).toEqual([])
      expect(result.pagination.total).toBe(0)
      expect(result.pagination.totalPages).toBe(0)
      expect(result.pagination.hasMore).toBe(false)
    })
  })
})

