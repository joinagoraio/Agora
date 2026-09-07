import { describe, expect, it } from "vitest"
import {
  evaluateDistinctReviewerApproval,
  mergeCitationSets,
  parseChapterWorkflow,
  chapterListStatus,
  parseFillJob,
  parseFillJobRecord,
  parseProgrammePolicies,
  remainingFillNodes,
  mergeOkFillProgress,
} from "@/lib/programme/review-policy"

describe("review policy", () => {
  it("allows self-approve when distinct reviewer is off", () => {
    expect(
      evaluateDistinctReviewerApproval({
        distinctReviewer: false,
        actorId: "author",
        assignedReviewerId: null,
        createdBy: "author",
      }),
    ).toEqual({ ok: true })
  })

  it("blocks approval until a reviewer is assigned", () => {
    const gate = evaluateDistinctReviewerApproval({
      distinctReviewer: true,
      actorId: "author",
      assignedReviewerId: null,
      createdBy: "author",
    })
    expect(gate.ok).toBe(false)
    if (!gate.ok) expect(gate.reason).toMatch(/assign a reviewer/i)
  })

  it("blocks the author from approving their own measure", () => {
    const gate = evaluateDistinctReviewerApproval({
      distinctReviewer: true,
      actorId: "author",
      assignedReviewerId: "author",
      createdBy: "author",
    })
    expect(gate.ok).toBe(false)
    if (!gate.ok) expect(gate.reason).toMatch(/cannot approve their own/i)
  })

  it("allows only the assigned reviewer", () => {
    expect(
      evaluateDistinctReviewerApproval({
        distinctReviewer: true,
        actorId: "reviewer",
        assignedReviewerId: "reviewer",
        createdBy: "author",
      }),
    ).toEqual({ ok: true })
    const stranger = evaluateDistinctReviewerApproval({
      distinctReviewer: true,
      actorId: "other",
      assignedReviewerId: "reviewer",
      createdBy: "author",
    })
    expect(stranger.ok).toBe(false)
  })
})

describe("chapter workflow", () => {
  it("defaults unknown chapter metadata to generated", () => {
    expect(parseChapterWorkflow({})).toBe("generated")
    expect(parseChapterWorkflow({ programmeWorkflowStatus: "approved" })).toBe("approved")
  })
})

describe("citation merge and fill job", () => {
  it("unions citations without duplicate keys", () => {
    const merged = mergeCitationSets(
      [{ documentId: "a", pageNumber: 1, quote: "housing" }],
      [
        { documentId: "a", pageNumber: 1, quote: "housing" },
        { documentId: "b", quote: "stations" },
      ],
    )
    expect(merged).toHaveLength(2)
    expect(merged.map((c) => c.documentId)).toEqual(["a", "b"])
  })

  it("parses policies, chapter workflow, and fill jobs", () => {
    expect(parseProgrammePolicies({ distinctReviewer: true, stakeholderExportRequiresFreeze: true })).toEqual({
      distinctReviewer: true,
      stakeholderExportRequiresFreeze: true,
    })
    expect(parseProgrammePolicies({})).toEqual({
      distinctReviewer: false,
      stakeholderExportRequiresFreeze: false,
    })
    expect(parseChapterWorkflow({ programmeWorkflowStatus: "in_review" })).toBe("in_review")
    expect(parseChapterWorkflow({})).toBe("generated")
    expect(chapterListStatus({ hasDocument: false })).toBe("empty")
    expect(chapterListStatus({ hasDocument: true, workflowStatus: null })).toBe("generated")
    expect(chapterListStatus({ hasDocument: true, workflowStatus: "in_review" })).toBe("in_review")
    expect(chapterListStatus({ hasDocument: true, workflowStatus: "approved" })).toBe("approved")
    const job = parseFillJob({
      fillJob: {
        id: "job-1",
        status: "running",
        cancelled: true,
        progress: [{ nodeId: "n1", title: "Intro", status: "pending" }],
        startedAt: "t0",
        updatedAt: "t1",
      },
    })
    expect(job?.cancelled).toBe(true)
    expect(job?.progress[0]?.title).toBe("Intro")
    expect(parseFillJob({})).toBeNull()
  })

  it("parses a programme_jobs row and skips completed fill nodes", () => {
    const job = parseFillJobRecord({
      id: "job-2",
      status: "failed",
      cancelled: false,
      progress: [
        { nodeId: "n1", title: "Intro", status: "ok" },
        { nodeId: "n2", title: "Vision", status: "error", error: "timeout" },
      ],
      started_at: "t0",
      updated_at: "t1",
    })
    expect(job?.status).toBe("failed")
    expect(remainingFillNodes([{ id: "n1" }, { id: "n2" }, { id: "n3" }], job?.progress || []).map((n) => n.id)).toEqual([
      "n2",
      "n3",
    ])
    expect(
      mergeOkFillProgress([
        [{ nodeId: "n1", title: "Intro", status: "ok" }],
        [
          { nodeId: "n1", title: "Intro", status: "ok" },
          { nodeId: "n2", title: "Vision", status: "error" },
        ],
        [{ nodeId: "n3", title: "Goals", status: "ok" }],
      ]).map((item) => item.nodeId),
    ).toEqual(["n1", "n3"])
  })
})
