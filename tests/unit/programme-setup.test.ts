import {
  programmeHasChapterDocuments,
  programmeHasEffectsReport,
  programmeSetupIncomplete,
  programmeSetupStep,
  shouldShowProgrammeSetupWizard,
} from "@/lib/guidance/setup"

describe("programme first-run setup", () => {
  it("detects chapter documents on an existing programme", () => {
    expect(programmeHasChapterDocuments({})).toBe(false)
    expect(programmeHasChapterDocuments({ chapterDocuments: { n1: "d1" } })).toBe(true)
  })

  it("treats a new programme as incomplete at structure", () => {
    expect(programmeSetupIncomplete({ templateId: null })).toBe(true)
    expect(programmeSetupStep({ templateId: null })).toBe(1)
  })

  it("asks for sources after an outline exists", () => {
    expect(
      programmeSetupStep({
        templateId: "tpl",
        environmentalVisionDocumentIds: [],
        existingPolicyDocumentIds: [],
      }),
    ).toBe(2)
    expect(
      programmeSetupIncomplete({
        templateId: "tpl",
        environmentalVisionDocumentIds: ["v"],
        existingPolicyDocumentIds: [],
      }),
    ).toBe(true)
  })

  it("completes required setup after outline and both sources", () => {
    const bindings = {
      templateId: "tpl",
      environmentalVisionDocumentIds: ["v"],
      existingPolicyDocumentIds: ["p"],
    }
    expect(programmeSetupIncomplete(bindings)).toBe(false)
    expect(programmeSetupStep(bindings)).toBe(2)
    expect(programmeHasEffectsReport(bindings)).toBe(false)
  })

  it("treats the effects report as optional", () => {
    const bindings = {
      templateId: "tpl",
      environmentalVisionDocumentIds: ["v"],
      existingPolicyDocumentIds: ["p"],
      environmentalEffectsReportDocumentIds: ["oer"],
    }
    expect(programmeSetupIncomplete(bindings)).toBe(false)
    expect(programmeHasEffectsReport(bindings)).toBe(true)
  })

  it("shows the wizard on first paint when nothing is bound yet", () => {
    expect(
      shouldShowProgrammeSetupWizard({
        canEdit: true,
        hasChapterBody: false,
        setupIncomplete: true,
        wizardSession: false,
        ready: false,
        hasChapterDocuments: false,
      }),
    ).toBe(true)
  })

  it("waits for load when chapter documents exist so writers are not trapped", () => {
    expect(
      shouldShowProgrammeSetupWizard({
        canEdit: true,
        hasChapterBody: false,
        setupIncomplete: true,
        wizardSession: false,
        ready: false,
        hasChapterDocuments: true,
      }),
    ).toBe(false)
    expect(
      shouldShowProgrammeSetupWizard({
        canEdit: true,
        hasChapterBody: true,
        setupIncomplete: true,
        wizardSession: true,
        ready: true,
        hasChapterDocuments: true,
      }),
    ).toBe(false)
    expect(
      shouldShowProgrammeSetupWizard({
        canEdit: true,
        hasChapterBody: false,
        setupIncomplete: false,
        wizardSession: true,
        ready: true,
        hasChapterDocuments: false,
      }),
    ).toBe(false)
  })

  it("hides the wizard after a blank structure finishes setup", () => {
    expect(
      shouldShowProgrammeSetupWizard({
        canEdit: true,
        hasChapterBody: false,
        setupIncomplete: true,
        wizardSession: false,
        ready: true,
        hasChapterDocuments: false,
        setupComplete: true,
      }),
    ).toBe(false)
  })
})
