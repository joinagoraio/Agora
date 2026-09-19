import { describe, expect, it } from "vitest"
import { estimateJobEta, formatEtaMs } from "@/lib/programme/job-eta"

describe("job ETA", () => {
  it("estimates remaining time from completed items", () => {
    const eta = estimateJobEta({
      startedAt: new Date(1_000).toISOString(),
      now: 61_000,
      progress: [
        { status: "ok" },
        { status: "ok" },
        { status: "pending" },
        { status: "pending" },
      ],
    })
    expect(eta.doneCount).toBe(2)
    expect(eta.remainingCount).toBe(2)
    expect(eta.remainingMs).toBe(60_000)
    expect(formatEtaMs(eta.remainingMs)).toBe("1m")
  })
})
