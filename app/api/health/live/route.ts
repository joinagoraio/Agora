import { NextResponse } from "next/server"

/**
 * Liveness probe endpoint
 * GET /api/health/live
 * 
 * Kubernetes/Docker liveness probe - checks if the application process is alive
 * This is the most basic check - just confirms the server is responding
 */
export async function GET() {
  return NextResponse.json(
    { status: "alive", timestamp: new Date().toISOString() },
    { status: 200 }
  )
}

