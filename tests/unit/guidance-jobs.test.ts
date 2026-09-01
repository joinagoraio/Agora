import {
  canShowProgrammeConfiguration,
  defaultProgrammeSection,
  defaultSpaceJobForRole,
  effectiveJob,
  moreNavSections,
  primaryNavSections,
  resolveProgrammeLandingSection,
  wouldLeaveLastAdministrator,
} from "@/lib/guidance/jobs"
import { PROGRAMME_WORKBENCH_SECTIONS } from "@/lib/programme/domain"

describe("guidance jobs", () => {
  it("maps access roles to default space jobs without granting extra permission", () => {
    expect(defaultSpaceJobForRole("owner")).toBe("administrator")
    expect(defaultSpaceJobForRole("member")).toBe("none")
  })

  it("picks chrome job from place", () => {
    expect(
      effectiveJob({
        spaceJob: "administrator",
        workspaceJob: "author",
        pathname: "/spaces/abc",
      }),
    ).toBe("administrator")
    expect(
      effectiveJob({
        spaceJob: "administrator",
        workspaceJob: "reviewer",
        pathname: "/workspaces/ws/programme",
      }),
    ).toBe("reviewer")
  })

  it("hides configuration from author primary nav and centres review for reviewers", () => {
    expect(primaryNavSections("author")).not.toContain("setup")
    expect(moreNavSections("author", PROGRAMME_WORKBENCH_SECTIONS)).toContain("setup")
    expect(defaultProgrammeSection("reviewer")).toBe("review")
    expect(defaultProgrammeSection("author")).toBe("overview")
    expect(defaultProgrammeSection("administrator")).toBe("overview")
    expect(primaryNavSections("author")).toContain("overview")
  })

  it("blocks removing the last administrator job", () => {
    expect(
      wouldLeaveLastAdministrator({
        currentJob: "administrator",
        nextJob: "none",
        administratorCount: 1,
      }),
    ).toBe(true)
    expect(
      wouldLeaveLastAdministrator({
        currentJob: "administrator",
        nextJob: "none",
        administratorCount: 2,
      }),
    ).toBe(false)
  })

  it("does not treat settings access as a job grant", () => {
    expect(canShowProgrammeConfiguration({ spaceJob: "none", canAccessSettings: false })).toBe(false)
    expect(canShowProgrammeConfiguration({ spaceJob: "none", canAccessSettings: true })).toBe(true)
  })

  it("keeps deep links and sends reviewers to review", () => {
    expect(resolveProgrammeLandingSection({ job: "reviewer", sectionParam: "editor" })).toBe("editor")
    expect(resolveProgrammeLandingSection({ job: "reviewer" })).toBe("review")
  })
})
