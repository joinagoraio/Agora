"use client"

import { useMemo, useState, useTransition, type ReactNode } from "react"
import { ArrowLeft, BookOpen, LayoutTemplate, PenLine } from "lucide-react"

import { UploadDocumentDialog } from "@/components/upload-document-dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { bindProgrammeDocumentRole, bindWorkspaceTemplate, seedProgrammeCorpusFixtures } from "@/lib/actions/programme"
import { createBlankProgrammeOutline, ensureProgrammeOutline } from "@/lib/actions/outline"
import { programmeSetupIncomplete, programmeSetupStep } from "@/lib/guidance/setup"
import { useI18n } from "@/lib/i18n/use-i18n"
import type { ProgrammeBindings, ProgrammeTemplateSummary } from "@/lib/programme/domain"
import { isChapterDocumentId } from "@/lib/programme/source-set-bindings"
import { cn } from "@/lib/utils"
import type { NotifyKind } from "@/lib/notify"

type CorpusDoc = {
  id: string
  title: string
  document_role: string | null
}

type Props = {
  workspaceId: string
  spaceId: string
  bindings: ProgrammeBindings
  templates: ProgrammeTemplateSummary[]
  corpusDocs: CorpusDoc[]
  canEdit: boolean
  onBindingsChange: (bindings: ProgrammeBindings) => void
  onMessage: (message: string | null, kind?: NotifyKind) => void
  onRefresh: () => void
  onStartWriting: (next?: ProgrammeBindings) => void
}

const NONE = "none"

export function ProgrammeSetupWizard({
  workspaceId,
  spaceId,
  bindings,
  templates,
  corpusDocs,
  canEdit,
  onBindingsChange,
  onMessage,
  onRefresh,
  onStartWriting,
}: Props) {
  const { t } = useI18n()
  const [pending, startTransition] = useTransition()
  const [reviewingStructure, setReviewingStructure] = useState(false)
  const derivedStep = programmeSetupStep(bindings)
  const step = reviewingStructure ? 1 : derivedStep
  const sourceDocs = useMemo(
    () => corpusDocs.filter((doc) => !isChapterDocumentId(bindings, doc.id)),
    [bindings, corpusDocs],
  )
  const visionId = bindings.environmentalVisionDocumentIds[0] ?? ""
  const policyId = bindings.existingPolicyDocumentIds[0] ?? ""
  const effectsId = bindings.environmentalEffectsReportDocumentIds[0] ?? ""
  const requiredSourcesReady = !programmeSetupIncomplete(bindings)

  const applyBindings = (next: ProgrammeBindings | undefined) => {
    if (next && "environmentalVisionDocumentIds" in next) onBindingsChange(next)
  }

  const createStandardOutline = () => {
    startTransition(async () => {
      const result = await ensureProgrammeOutline(workspaceId, spaceId)
      if (result.error) {
        onMessage(result.error, "error")
        return
      }
      if (result.data?.templateId) {
        onBindingsChange({ ...bindings, templateId: result.data.templateId })
      }
      setReviewingStructure(false)
      onRefresh()
    })
  }

  const useTemplate = (templateId: string) => {
    startTransition(async () => {
      const result = await bindWorkspaceTemplate(workspaceId, templateId)
      if (result.error) {
        onMessage(result.error, "error")
        return
      }
      if (result.data) applyBindings(result.data)
      setReviewingStructure(false)
      onRefresh()
    })
  }

  const createBlankOutline = () => {
    startTransition(async () => {
      const result = await createBlankProgrammeOutline(workspaceId, spaceId)
      if (result.error) {
        onMessage(result.error, "error")
        return
      }
      if (result.data?.bindings) applyBindings(result.data.bindings)
      onStartWriting(result.data?.bindings)
    })
  }

  const bindRole = (
    documentId: string,
    role: "environmental_vision" | "existing_policy" | "environmental_effects_report",
  ) => {
    startTransition(async () => {
      const result = await bindProgrammeDocumentRole(workspaceId, documentId, role)
      if (result.error) {
        onMessage(result.error, "error")
        return
      }
      if (result.data && typeof result.data === "object" && "environmentalVisionDocumentIds" in result.data) {
        applyBindings(result.data)
      }
      onRefresh()
    })
  }

  const seedSources = () => {
    startTransition(async () => {
      const result = await seedProgrammeCorpusFixtures(workspaceId)
      if (result.error) {
        onMessage(result.error, "error")
        return
      }
      onStartWriting()
    })
  }

  return (
    <div className="flex h-full min-h-0 flex-1 items-start justify-center overflow-y-auto px-6 py-16">
      <div className={cn("w-full space-y-8", step === 1 ? "max-w-4xl" : "max-w-lg")}>
        {step === 1 ? (
          <div className="space-y-6">
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold tracking-tight">{t("workspace.programme.setupWizard.structureTitle")}</h1>
              <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
                {t("workspace.programme.setupWizard.structureBody")}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <StructureCard
                icon={<BookOpen className="h-5 w-5" />}
                title={t("workspace.programme.setupWizard.structureStandardTitle")}
                body={t("workspace.programme.setupWizard.structureStandardBody")}
                disabled={pending || !canEdit}
                onClick={createStandardOutline}
              />
              <div
                className={cn(
                  "flex flex-col rounded-xl border bg-card p-5 text-left shadow-sm",
                  (pending || !canEdit) && "opacity-60",
                )}
              >
                <LayoutTemplate className="h-5 w-5 text-muted-foreground" />
                <h2 className="mt-4 text-base font-semibold">{t("workspace.programme.setupWizard.structureTemplateTitle")}</h2>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
                  {t("workspace.programme.setupWizard.structureTemplateBody")}
                </p>
                {templates.length === 0 ? (
                  <p className="mt-4 text-sm text-muted-foreground">{t("workspace.programme.setupWizard.structureTemplateEmpty")}</p>
                ) : (
                  <Select
                    value={NONE}
                    onValueChange={(value) => value !== NONE && useTemplate(value)}
                    disabled={pending || !canEdit}
                  >
                    <SelectTrigger className="mt-4 w-full" aria-label={t("workspace.programme.setupWizard.structureTemplateTitle")}>
                      <SelectValue placeholder={t("workspace.programme.setupWizard.structureTemplatePick")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE} disabled>
                        {t("workspace.programme.setupWizard.structureTemplatePick")}
                      </SelectItem>
                      {templates.map((template) => (
                        <SelectItem key={template.id} value={template.id}>
                          {template.name}
                          {template.chapterCount > 0 ? ` · ${template.chapterCount}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <StructureCard
                icon={<PenLine className="h-5 w-5" />}
                title={t("workspace.programme.setupWizard.structureBlankTitle")}
                body={t("workspace.programme.setupWizard.structureBlankBody")}
                disabled={pending || !canEdit}
                onClick={createBlankOutline}
              />
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-5">
            <Button type="button" variant="ghost" className="-ml-2 h-8 px-2" onClick={() => setReviewingStructure(true)}>
              <ArrowLeft className="h-4 w-4" />
              {t("workspace.programme.setupWizard.back")}
            </Button>
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold tracking-tight">{t("workspace.programme.setupWizard.sourcesTitle")}</h1>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {t("workspace.programme.setupWizard.sourcesBody")}
              </p>
            </div>
            {sourceDocs.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("workspace.programme.setupWizard.sourcesEmpty")}</p>
            ) : (
              <div className="space-y-4">
                <SourcePicker
                  id="setup-vision"
                  label={t("workspace.programme.setupWizard.sourcesVision")}
                  value={visionId}
                  excludeIds={[policyId, effectsId]}
                  docs={sourceDocs}
                  disabled={pending || !canEdit}
                  placeholder={t("workspace.programme.setupWizard.sourcesPick")}
                  onChange={(id) => bindRole(id, "environmental_vision")}
                />
                <SourcePicker
                  id="setup-policy"
                  label={t("workspace.programme.setupWizard.sourcesPolicy")}
                  value={policyId}
                  excludeIds={[visionId, effectsId]}
                  docs={sourceDocs}
                  disabled={pending || !canEdit}
                  placeholder={t("workspace.programme.setupWizard.sourcesPick")}
                  onChange={(id) => bindRole(id, "existing_policy")}
                />
                <SourcePicker
                  id="setup-effects"
                  label={t("workspace.programme.setupWizard.sourcesEffects")}
                  value={effectsId}
                  excludeIds={[visionId, policyId]}
                  docs={sourceDocs}
                  disabled={pending || !canEdit}
                  placeholder={t("workspace.programme.setupWizard.sourcesPick")}
                  onChange={(id) => bindRole(id, "environmental_effects_report")}
                />
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <UploadDocumentDialog
                workspaceId={workspaceId}
                onSuccess={onRefresh}
                trigger={
                  <Button type="button" variant="outline" disabled={pending || !canEdit}>
                    {t("workspace.programme.setupWizard.sourcesUpload")}
                  </Button>
                }
              />
              <Button type="button" variant="ghost" disabled={pending || !canEdit} onClick={seedSources}>
                {t("workspace.programme.setupWizard.sourcesSeed")}
              </Button>
              <Button
                type="button"
                disabled={pending || !canEdit || !requiredSourcesReady}
                onClick={() => onStartWriting(bindings)}
              >
                {t("workspace.programme.setupWizard.sourcesStart")}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function StructureCard({
  icon,
  title,
  body,
  disabled,
  onClick,
}: {
  icon: ReactNode
  title: string
  body: string
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex flex-col rounded-xl border bg-card p-5 text-left shadow-sm transition-colors hover:border-foreground/30 hover:bg-muted/40 disabled:pointer-events-none disabled:opacity-60"
    >
      <span className="text-muted-foreground">{icon}</span>
      <h2 className="mt-4 text-base font-semibold">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
    </button>
  )
}

function SourcePicker({
  id,
  label,
  value,
  excludeIds,
  docs,
  disabled,
  placeholder,
  onChange,
}: {
  id: string
  label: string
  value: string
  excludeIds: string[]
  docs: CorpusDoc[]
  disabled: boolean
  placeholder: string
  onChange: (id: string) => void
}) {
  const blocked = new Set(excludeIds.filter(Boolean))
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value || NONE} onValueChange={(next) => next !== NONE && onChange(next)} disabled={disabled}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE} disabled>
            {placeholder}
          </SelectItem>
          {docs.map((doc) => (
            <SelectItem key={doc.id} value={doc.id} disabled={blocked.has(doc.id)}>
              {doc.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
