"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { DocumentFileTypeIcon } from "@/components/document-file-type-icon"
import { useI18n } from "@/lib/i18n/use-i18n"
import { DOCUMENT_ROLES, type DocumentOrigin, type DocumentRole, type ProgrammeBindings } from "@/lib/programme/domain"
import { isChapterDocumentId } from "@/lib/programme/source-set-bindings"
import { bindProgrammeDocumentRole, createWritingGuide } from "@/lib/actions/programme"
import { bindPublishedProgrammeAsPolicy, type ProgrammePublicationSummary } from "@/lib/actions/publish"
import type { NotifyKind } from "@/lib/notify"

type CorpusDoc = {
  id: string
  title: string
  document_role: string | null
  origin: DocumentOrigin
  fileExtension: string
}

type Props = {
  workspaceId: string
  corpusDocs: CorpusDoc[]
  bindings: ProgrammeBindings
  pending: boolean
  canBind: boolean
  citablePublications: ProgrammePublicationSummary[]
  citePublicationId: string
  onCitePublicationIdChange: (id: string) => void
  onBindingsChange: (bindings: ProgrammeBindings) => void
  onMessage: (message: string | null, kind?: NotifyKind) => void
  onRefresh: () => void
  startTransition: (action: () => Promise<void> | void) => void
}

export function ProgrammeDocumentRoles({
  workspaceId,
  corpusDocs,
  bindings,
  pending,
  canBind,
  citablePublications,
  citePublicationId,
  onCitePublicationIdChange,
  onBindingsChange,
  onMessage,
  onRefresh,
  startTransition,
}: Props) {
  const { t } = useI18n()
  const [guidePrompt, setGuidePrompt] = useState("")
  const sourceDocs = corpusDocs.filter((doc) => !isChapterDocumentId(bindings, doc.id))

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-lg border" data-guidance-target="bound-sources">
        <div className="border-b bg-muted px-4 py-3">
          <p className="text-sm text-muted-foreground">{t("workspace.programme.corpusHint")}</p>
        </div>
        <ul className="divide-y text-sm">
          {sourceDocs.length === 0 ? (
            <li className="px-4 py-6 text-muted-foreground">
              {t("workspace.programme.corpusEmpty")} {t("workspace.programme.emptyNext.corpus")}
            </li>
          ) : null}
          {sourceDocs.map((doc) => {
            const file = doc.title.match(/^(.*)\.(md|markdown|pdf|docx?|txt)$/i)
            const name = file ? file[1].replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim() : doc.title
            return (
            <li key={doc.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <span className="flex min-w-0 flex-wrap items-center gap-2">
                <DocumentFileTypeIcon extension={doc.fileExtension} />
                <span>
                  <span className="block">{name}</span>
                  {file ? <span className="text-xs text-muted-foreground">{file[2].toLowerCase()}</span> : null}
                </span>
                <Badge variant="outline">
                  {doc.origin === "authority"
                    ? t("workspace.programme.corpusOriginAuthority")
                    : doc.origin === "generated"
                      ? t("workspace.programme.corpusOriginGenerated")
                      : doc.origin === "published"
                        ? t("workspace.programme.corpusOriginPublished")
                        : t("workspace.programme.corpusOriginUploaded")}
                </Badge>
              </span>
            <label className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">{t("workspace.programme.corpusRole")}</span>
              <Select
                value={doc.document_role || "none"}
                disabled={pending || !canBind}
                onValueChange={(value) =>
                  startTransition(async () => {
                    const role = (value === "none" ? null : value) as DocumentRole | null
                    const result = await bindProgrammeDocumentRole(workspaceId, doc.id, role)
                    onMessage(result.error || t("workspace.programme.corpusRole"), result.error ? "error" : "success")
                    if (result.data && typeof result.data === "object" && "environmentalVisionDocumentIds" in result.data) {
                      onBindingsChange(result.data)
                    }
                    onRefresh()
                  })
                }
              >
                <SelectTrigger
                  size="sm"
                  className="min-w-48"
                  data-guidance-target={
                    !bindings.environmentalVisionDocumentIds.length && doc.document_role !== "environmental_vision"
                      ? "bind-vision"
                      : undefined
                  }
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("workspace.programme.corpusUnassigned")}</SelectItem>
                  {DOCUMENT_ROLES.map((role) => (
                    <SelectItem key={role} value={role}>
                      {t(`workspace.programme.documentRoles.${role}`, role)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          </li>
            )
          })}
        </ul>
      </div>
      <section className="space-y-3 rounded-lg border p-4">
        <h3 className="text-sm font-semibold">{t("workspace.programme.documentRoles.programme_handbook")}</h3>
        <p className="text-sm text-muted-foreground">{t("workspace.programme.writingGuideHelp")}</p>
        <textarea
          value={guidePrompt}
          onChange={(event) => setGuidePrompt(event.target.value)}
          placeholder={t("workspace.programme.writingGuidePrompt")}
          rows={3}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          disabled={pending || !canBind}
        />
        <Button
          type="button"
          variant="outline"
          disabled={pending || !canBind}
          onClick={() =>
            startTransition(async () => {
              const result = await createWritingGuide(workspaceId, guidePrompt)
              onMessage(
                result.error || t("workspace.programme.writingGuideCreated"),
                result.error ? "error" : "success",
              )
              if (!result.error && result.data) onBindingsChange(result.data)
              onRefresh()
            })
          }
        >
          {t("workspace.programme.writingGuideCreate")}
        </Button>
      </section>
      <section className="overflow-hidden rounded-lg border">
        <div className="border-b bg-muted px-4 py-3">
          <h3 className="text-sm font-semibold">{t("workspace.programme.citePublishedTitle")}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{t("workspace.programme.citePublishedHint")}</p>
        </div>
        <div className="p-4">
        {citablePublications.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("workspace.programme.citePublishedEmpty")}</p>
        ) : (
          <div className="flex flex-wrap items-end gap-2">
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">{t("workspace.programme.citePublishedSelect")}</span>
              <Select value={citePublicationId} onValueChange={onCitePublicationIdChange}>
                <SelectTrigger size="sm" className="min-w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {citablePublications.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.workspaceName || item.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <Button
              size="sm"
              disabled={pending || !canBind || !citePublicationId}
              onClick={() =>
                startTransition(async () => {
                  const result = await bindPublishedProgrammeAsPolicy(workspaceId, citePublicationId)
                  onMessage(result.error || t("workspace.programme.citePublishedDone"), result.error ? "error" : "success")
                  onRefresh()
                })
              }
            >
              {t("workspace.programme.citePublishedBind")}
            </Button>
          </div>
        )}
        </div>
      </section>
    </div>
  )
}
