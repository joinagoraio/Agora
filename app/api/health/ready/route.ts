import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

/**
 * Readiness probe endpoint
 * GET /api/health/ready
 * 
 * Kubernetes/Docker readiness probe - checks if the application is ready to serve traffic
 * This is a lightweight check that verifies critical dependencies are available
 */
export async function GET(req: NextRequest) {
  try {
    // Check database connection (critical dependency)
    const supabase = await createClient()
    const { error } = await supabase.from("spaces").select("id").limit(1).single()

    if (error && error.code !== "PGRST116") {
      // PGRST116 is "not found" which is fine - it means DB is accessible
      return NextResponse.json(
        { status: "not ready", error: error.message },
        { status: 503 }
      )
    }

    return NextResponse.json(
      { status: "ready" },
      { status: 200 }
    )
  } catch (error) {
    return NextResponse.json(
      {
        status: "not ready",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 503 }
    )
  }
}

