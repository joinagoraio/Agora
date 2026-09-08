"use client"

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
import { bindProgrammeDocumentRole, seedProgrammeCorpusFixtures } from "@/lib/actions/programme"
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
  const sourceDocs = corpusDocs.filter((doc) => !isChapterDocumentId(bindings, doc.id))

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t("workspace.programme.corpusHint")}</p>
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={pending || !canBind}
          onClick={() =>
            startTransition(async () => {
              const result = await seedProgrammeCorpusFixtures(workspaceId)
              onMessage(
                result.error ||
                  t("workspace.programme.corpusSeeded", undefined, {
                    count: String(result.data?.created ?? 0),
                  }),
                result.error ? "error" : "success",
              )
              onRefresh()
            })
          }
        >
          {t("workspace.programme.seedCorpus")}
        </Button>
      </div>
      <ul className="space-y-2 text-sm">
        {sourceDocs.length === 0 && (
          <li>
            {t("workspace.programme.corpusEmpty")} {t("workspace.programme.emptyNext.corpus")}
          </li>
        )}
        {sourceDocs.map((doc) => (
          <li key={doc.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2">
            <span className="flex min-w-0 flex-wrap items-center gap-2">
              <DocumentFileTypeIcon extension={doc.fileExtension} />
              <span>{doc.title}</span>
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
        ))}
      </ul>
      <div className="space-y-2 rounded-md border p-3">
        <h3 className="text-sm font-medium">{t("workspace.programme.citePublishedTitle")}</h3>
        <p className="text-sm text-muted-foreground">{t("workspace.programme.citePublishedHint")}</p>
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
    </div>
  )
}
