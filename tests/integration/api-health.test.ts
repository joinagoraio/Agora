import { describe, it, expect, vi, beforeEach } from "vitest"
import { GET as healthGet } from "@/app/api/health/route"
import { GET as readyGet } from "@/app/api/health/ready/route"
import { GET as liveGet } from "@/app/api/health/live/route"
import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"

// Mock Supabase client
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}))

// Mock Supabase admin client
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}))

describe("Health Check Endpoints", () => {
  const mockRequest = new NextRequest("http://localhost:3000/api/health")

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("GET /api/health/live", () => {
    it("returns alive status", async () => {
      const response = await liveGet() // No request parameter needed
      const data = await response.json()
      
      expect(response.status).toBe(200)
      expect(data.status).toBe("alive")
      expect(data.timestamp).toBeDefined()
    })
  })

  describe("GET /api/health/ready", () => {
    it("returns ready when database is accessible", async () => {
      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            limit: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({ data: null, error: { code: "PGRST116" } }),
            })),
          })),
        })),
      }

      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      const response = await readyGet(mockRequest)
      const data = await response.json()
      
      expect(response.status).toBe(200)
      expect(data.status).toBe("ready")
    })

    it("returns not ready when database is inaccessible", async () => {
      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            limit: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({ data: null, error: { code: "PGRST999", message: "Connection failed" } }),
            })),
          })),
        })),
      }

      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      const response = await readyGet(mockRequest)
      const data = await response.json()
      
      expect(response.status).toBe(503)
      expect(data.status).toBe("not ready")
      expect(data.error).toBeDefined()
    })
  })

  describe("GET /api/health", () => {
    it("returns health status with checks", async () => {
      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          })),
        })),
        storage: {
          listBuckets: vi.fn().mockResolvedValue({ data: [], error: null }),
        },
      }

      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      const response = await healthGet(mockRequest)
      const data = await response.json()
      
      expect(response.status).toBe(200)
      expect(data.status).toBeDefined()
      expect(data.timestamp).toBeDefined()
      expect(data.checks).toBeDefined()
      expect(data.checks.database).toBeDefined()
    })
  })
})

