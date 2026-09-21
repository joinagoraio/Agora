import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

import {
  fallbackColleagueThemeDraft,
  nestColleagueComments,
  parseColleagueThemeDraft,
  proposeColleagueCommentThemes,
  rootColleagueCommentId,
} from "@/lib/programme/colleague-comments"

describe("colleague comment threads", () => {
  it("nests replies under the original note", () => {
    const threads = nestColleagueComments([
      { id: "a", parentId: null, body: "Need housing numbers" },
      { id: "b", parentId: "a", body: "I will add the 2024 pilots" },
      { id: "c", parentId: null, body: "Different paragraph" },
    ])
    expect(threads).toHaveLength(2)
    expect(threads[0]?.replies.map((item) => item.id)).toEqual(["b"])
    expect(threads[1]?.replies).toEqual([])
  })

  it("walks a reply back to the root note", () => {
    const byId = new Map([
      ["a", { id: "a", parentId: null }],
      ["b", { id: "b", parentId: "a" }],
    ])
    expect(rootColleagueCommentId({ id: "b", parentId: "a" }, byId)).toBe("a")
    expect(rootColleagueCommentId({ id: "a", parentId: null }, byId)).toBe("a")
  })
})

describe("colleague comment themes", () => {
  it("groups similar open notes and leaves a different note alone", () => {
    const groups = proposeColleagueCommentThemes([
      {
        id: "a",
        body: "Please name the two station-area housing pilots and their 2026 budgets.",
        themeId: null,
        locked: false,
      },
      {
        id: "b",
        body: "The station-area housing pilots still need named budgets for 2026.",
        themeId: null,
        locked: false,
      },
      {
        id: "c",
        body: "The zoning overlay should mention quiet landscapes.",
        themeId: null,
        locked: false,
      },
    ])
    const pilots = groups.find((group) => group.memberIds.includes("a"))
    expect(pilots?.memberIds).toEqual(expect.arrayContaining(["a", "b"]))
    expect(pilots?.memberIds).not.toContain("c")
    expect(groups.some((group) => group.memberIds.length === 1 && group.memberIds[0] === "c")).toBe(false)
  })

  it("keeps addressed themes locked", () => {
    const groups = proposeColleagueCommentThemes([
      {
        id: "locked",
        body: "Keep the already-addressed housing numbers together",
        themeId: "theme-1",
        locked: true,
      },
      {
        id: "free",
        body: "Something else entirely about quiet landscapes and zoning",
        themeId: null,
        locked: false,
      },
    ])
    expect(groups.find((group) => group.reuseThemeId === "theme-1")?.memberIds).toEqual(["locked"])
    expect(groups.find((group) => group.memberIds.includes("free"))).toBeUndefined()
  })

  it("drafts a colleague reply, not a consultation decision", () => {
    const draft = fallbackColleagueThemeDraft({
      label: "Housing pilots",
      comments: [{ id: "a", body: "Name the pilots", themeId: null, locked: false }],
    })
    expect(draft.suggestedReply).toMatch(/live draft/)
    expect(draft).not.toHaveProperty("suggestedStatus")
    expect(parseColleagueThemeDraft('{"label":"Pilots","summary":"Two notes","suggestedReply":"Add the names."}')).toEqual({
      label: "Pilots",
      summary: "Two notes",
      suggestedReply: "Add the names.",
    })
  })
})

describe("colleague comments stay off the consultation ledger", () => {
  it("does not import consultation tables or statuses", () => {
    const domain = readFileSync(resolve(process.cwd(), "lib/programme/colleague-comments.ts"), "utf8")
    const actions = readFileSync(resolve(process.cwd(), "lib/actions/comments.ts"), "utf8")
    expect(domain).not.toMatch(/from ["']@\/lib\/programme\/consultation/)
    expect(domain).not.toMatch(/suggestedStatus/)
    expect(actions).not.toMatch(/consultation_/)
    expect(actions).not.toMatch(/programme_consultations/)
  })
})
