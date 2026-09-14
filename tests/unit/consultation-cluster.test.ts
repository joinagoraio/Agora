import { describe, expect, it } from "vitest"

import {
  buildPublicTopicSummaryDraft,
  canSubmitConsultationAppeal,
  cosineSimilarity,
  fallbackClusterDraft,
  jaccardSimilarity,
  nearestClusterId,
  parseClusterDraft,
  proposeConsultationClusters,
  tokenizeConsultationText,
} from "@/lib/programme/consultation-cluster"

describe("consultation clustering", () => {
  it("groups comments that quote the same passage", () => {
    const groups = proposeConsultationClusters([
      {
        id: "a",
        quoteText: "Reduce traffic noise near schools.",
        body: "Add a night-time limit.",
        clusterId: null,
        locked: false,
      },
      {
        id: "b",
        quoteText: "Reduce traffic noise near schools.",
        body: "School hours are not enough.",
        clusterId: null,
        locked: false,
      },
      {
        id: "c",
        quoteText: "Plant more street trees.",
        body: "Trees also cool the street.",
        clusterId: null,
        locked: false,
      },
    ])
    const night = groups.find((group) => group.memberIds.includes("a"))
    expect(night?.memberIds).toEqual(expect.arrayContaining(["a", "b"]))
    expect(night?.memberIds).not.toContain("c")
  })

  it("leaves a corrected comment on its cluster", () => {
    const groups = proposeConsultationClusters([
      {
        id: "locked",
        quoteText: "Goal 1",
        body: "Keep this one aside",
        clusterId: "cluster-1",
        locked: true,
      },
      {
        id: "free",
        quoteText: "Goal 2",
        body: "Something else entirely about water quality",
        clusterId: null,
        locked: false,
      },
    ])
    expect(groups.find((group) => group.reuseClusterId === "cluster-1")?.memberIds).toEqual(["locked"])
    expect(groups.find((group) => group.memberIds.includes("free"))?.reuseClusterId).toBeNull()
  })

  it("assigns a new comment to the nearest existing cluster", () => {
    const clusterId = nearestClusterId({
      comment: {
        id: "new",
        quoteText: "Reduce traffic noise near schools.",
        body: "Please include weekends.",
        clusterId: null,
        locked: false,
      },
      clusters: [
        {
          id: "noise",
          sample: {
            id: "old",
            quoteText: "Reduce traffic noise near schools.",
            body: "Night-time limit",
            clusterId: "noise",
            locked: false,
          },
        },
      ],
    })
    expect(clusterId).toBe("noise")
  })

  it("parses an AI cluster draft and falls back when JSON is missing", () => {
    expect(
      parseClusterDraft(
        'Here you go: {"label":"Night noise","summary":"Commenters want night limits.","suggestedResponse":"Add a night measure.","suggestedStatus":"accepted"}',
      ),
    ).toEqual({
      label: "Night noise",
      summary: "Commenters want night limits.",
      suggestedResponse: "Add a night measure.",
      suggestedStatus: "accepted",
    })
    expect(parseClusterDraft("not json")).toBeNull()
    expect(fallbackClusterDraft({ label: "Night noise", comments: [] }).suggestedStatus).toBe("in_discussion")
  })

  it("builds a topic summary from cluster resolutions", () => {
    const markdown = buildPublicTopicSummaryDraft({
      commentCount: 3,
      clusters: [
        {
          label: "Night-time noise",
          memberCount: 2,
          summary: "People want a night limit.",
          ownerSummary: "We will add a night-time measure.",
          appliedStatus: "accepted",
        },
      ],
    })
    expect(markdown).toContain("3 comments received across 1 topic.")
    expect(markdown).toContain("Night-time noise")
    expect(markdown).toContain("We will add a night-time measure.")
    expect(markdown).toContain("Decision: accepted.")
  })
})

describe("appeal rules", () => {
  it("allows the commenter to appeal a terminal decision once", () => {
    expect(
      canSubmitConsultationAppeal({
        isAuthor: true,
        status: "rejected",
        hasPendingAppeal: false,
        body: "Please reconsider the school-hours limit.",
      }),
    ).toEqual({ ok: true })
  })

  it("blocks appeals that are not ready", () => {
    expect(
      canSubmitConsultationAppeal({
        isAuthor: false,
        status: "rejected",
        hasPendingAppeal: false,
        body: "No",
      }).ok,
    ).toBe(false)
    expect(
      canSubmitConsultationAppeal({
        isAuthor: true,
        status: "open",
        hasPendingAppeal: false,
        body: "Too soon",
      }).ok,
    ).toBe(false)
    expect(
      canSubmitConsultationAppeal({
        isAuthor: true,
        status: "rejected",
        hasPendingAppeal: true,
        body: "Again",
      }).ok,
    ).toBe(false)
  })
})

describe("similarity helpers", () => {
  it("tokenizes and scores overlapping comments", () => {
    expect(tokenizeConsultationText("Reduce traffic noise near schools")).toEqual(
      expect.arrayContaining(["reduce", "traffic", "noise", "near", "schools"]),
    )
    expect(jaccardSimilarity(["noise", "school"], ["noise", "night"])).toBeCloseTo(1 / 3)
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1)
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0)
  })
})
