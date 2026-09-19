export type ProgrammeSetupBindings = {
  templateId?: string | null
  environmentalVisionDocumentIds?: string[]
  existingPolicyDocumentIds?: string[]
  environmentalEffectsReportDocumentIds?: string[]
  chapterDocuments?: Record<string, string>
  setupComplete?: boolean
}

export function programmeHasChapterDocuments(bindings: ProgrammeSetupBindings): boolean {
  return Object.keys(bindings.chapterDocuments || {}).length > 0
}

export function programmeSetupIncomplete(bindings: ProgrammeSetupBindings): boolean {
  return (
    !bindings.templateId ||
    (bindings.environmentalVisionDocumentIds?.length ?? 0) < 1 ||
    (bindings.existingPolicyDocumentIds?.length ?? 0) < 1
  )
}

export function programmeSetupStep(bindings: ProgrammeSetupBindings): 1 | 2 {
  if (!bindings.templateId) return 1
  return 2
}

export function programmeHasEffectsReport(bindings: ProgrammeSetupBindings): boolean {
  return (bindings.environmentalEffectsReportDocumentIds?.length ?? 0) > 0
}

export function shouldShowProgrammeSetupWizard(input: {
  canEdit: boolean
  hasChapterBody: boolean
  setupIncomplete: boolean
  wizardSession: boolean
  ready: boolean
  hasChapterDocuments: boolean
  setupComplete?: boolean
}): boolean {
  if (!input.canEdit || input.hasChapterBody || input.setupComplete) return false
  if (!input.ready && input.hasChapterDocuments) return false
  if (input.setupIncomplete) return true
  return Boolean(input.wizardSession) || input.setupComplete === false
}
