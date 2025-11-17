import { NextRequest, NextResponse } from "next/server"
import { metrics } from "@/lib/utils/metrics"
import { logger } from "@/lib/utils/logger"
import { env } from "@/lib/env"

/**
 * Metrics endpoint
 * GET /api/metrics
 * 
 * Returns application metrics in a format suitable for monitoring systems
 * 
 * Security: In production, this should be protected or only accessible internally
 */
export async function GET(req: NextRequest) {
  try {
    // In production, you might want to add authentication/authorization here
    // For now, we'll make it accessible but log access
    const ip = req.headers.get("x-forwarded-for") ?? "unknown"
    logger.info("[Metrics] Metrics endpoint accessed", { ip })

    const summary = metrics.getSummary()

    // Format for Prometheus (if needed)
    const format = req.nextUrl.searchParams.get("format") || "json"

    if (format === "prometheus") {
      const prometheusLines: string[] = []

      // Format counters
      summary.counters.forEach(counter => {
        const tags = counter.tags
          ? `{${Object.entries(counter.tags).map(([k, v]) => `${k}="${v}"`).join(",")}}`
          : ""
        prometheusLines.push(`${counter.name}${tags} ${counter.value}`)
      })

      // Format histograms
      summary.histograms.forEach(hist => {
        const tags = hist.tags
          ? `{${Object.entries(hist.tags).map(([k, v]) => `${k}="${v}"`).join(",")}}`
          : ""
        prometheusLines.push(`${hist.name}_min${tags} ${hist.min}`)
        prometheusLines.push(`${hist.name}_max${tags} ${hist.max}`)
        prometheusLines.push(`${hist.name}_avg${tags} ${hist.avg}`)
        prometheusLines.push(`${hist.name}_p50${tags} ${hist.p50}`)
        prometheusLines.push(`${hist.name}_p95${tags} ${hist.p95}`)
        prometheusLines.push(`${hist.name}_p99${tags} ${hist.p99}`)
      })

      // Format gauges
      summary.gauges.forEach(gauge => {
        const tags = gauge.tags
          ? `{${Object.entries(gauge.tags).map(([k, v]) => `${k}="${v}"`).join(",")}}`
          : ""
        prometheusLines.push(`${gauge.name}${tags} ${gauge.value} ${gauge.timestamp}`)
      })

      return new NextResponse(prometheusLines.join("\n") + "\n", {
        headers: {
          "Content-Type": "text/plain; version=0.0.4",
        },
      })
    }

    // Default JSON format
    return NextResponse.json(summary, {
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    })
  } catch (error) {
    logger.error("[Metrics] Error retrieving metrics", error)
    return NextResponse.json(
      { error: "Failed to retrieve metrics" },
      { status: 500 }
    )
  }
}

