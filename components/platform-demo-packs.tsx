"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useI18n } from "@/lib/i18n/use-i18n"
import { notify } from "@/lib/notify"
import {
  deleteDemoPack,
  listDemoPacks,
  loadDemoPack,
  removeLoadedDemos,
  saveDemoPack,
  type DemoPack,
  type DemoPackChapter,
  type DemoPackFile,
} from "@/lib/actions/demo-pack"
import { DOCUMENT_ROLES, type DocumentRole } from "@/lib/programme/domain"

const EMPTY: DemoPack = {
  id: "",
  name: "",
  writingLanguage: "en",
  chapters: [{ title: "", required: true }],
  files: [],
}

export function PlatformDemoPacks() {
  const { t } = useI18n()
  const router = useRouter()
  const [packs, setPacks] = useState<DemoPack[]>([])
  const [draft, setDraft] = useState<DemoPack>(EMPTY)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const refresh = () => {
    startTransition(async () => {
      const result = await listDemoPacks()
      if (result.error) {
        setLoadError(result.error)
        notify(result.error, "error")
        return
      }
      setLoadError(null)
      setPacks(result.data)
      setDraft((current) => result.data.find((pack) => pack.id === current.id) || result.data[0] || EMPTY)
    })
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const updateChapter = (index: number, patch: Partial<DemoPackChapter>) => {
    setDraft((current) => ({
      ...current,
      chapters: current.chapters.map((chapter, i) => (i === index ? { ...chapter, ...patch } : chapter)),
    }))
  }

  const updateFile = (index: number, patch: Partial<DemoPackFile>) => {
    setDraft((current) => ({
      ...current,
      files: current.files.map((file, i) => (i === index ? { ...file, ...patch } : file)),
    }))
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">{t("admin.platform.demoPacksHint")}</p>
      {loadError ? <p className="text-sm text-destructive">{loadError}</p> : null}
      <div className="flex flex-wrap gap-2">
        {packs.map((pack) => (
          <Button
            key={pack.id}
            type="button"
            variant={draft.id === pack.id ? "default" : "outline"}
            onClick={() => setDraft(pack)}
          >
            {pack.name}
          </Button>
        ))}
        <Button type="button" variant="outline" onClick={() => setDraft({ ...EMPTY })}>
          {t("admin.platform.demoPackNew")}
        </Button>
      </div>

      <div className="space-y-4 rounded-lg border p-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="pack-name">{t("admin.platform.demoPackName")}</Label>
            <Input
              id="pack-name"
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("space.wizard.basics.writingLanguageLabel")}</Label>
            <Select
              value={draft.writingLanguage}
              onValueChange={(value) => setDraft({ ...draft, writingLanguage: value === "nl" ? "nl" : "en" })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">{t("space.wizard.basics.writingLanguageOptions.en")}</SelectItem>
                <SelectItem value="nl">{t("space.wizard.basics.writingLanguageOptions.nl")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">{t("admin.platform.demoPackChapters")}</h3>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDraft({ ...draft, chapters: [...draft.chapters, { title: "", required: true }] })}
            >
              {t("admin.platform.demoPackAddChapter")}
            </Button>
          </div>
          {draft.chapters.map((chapter, index) => (
            <div key={`${chapter.title}-${index}`} className="grid gap-2 md:grid-cols-2">
              <Input
                value={chapter.title}
                placeholder={t("admin.platform.demoPackChapterTitle")}
                onChange={(event) => updateChapter(index, { title: event.target.value })}
              />
              <Input
                value={chapter.instructions || ""}
                placeholder={t("admin.platform.demoPackChapterInstruction")}
                onChange={(event) => updateChapter(index, { instructions: event.target.value })}
              />
            </div>
          ))}
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">{t("admin.platform.demoPackFiles")}</h3>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setDraft({
                  ...draft,
                  files: [...draft.files, { title: "", text: "", role: "other" }],
                })
              }
            >
              {t("admin.platform.demoPackAddFile")}
            </Button>
          </div>
          {draft.files.map((file, index) => (
            <div key={`${file.title}-${index}`} className="space-y-2 rounded-md border p-3">
              <div className="grid gap-2 md:grid-cols-2">
                <Input
                  value={file.title}
                  placeholder={t("admin.platform.demoPackFileTitle")}
                  onChange={(event) => updateFile(index, { title: event.target.value })}
                />
                <Select
                  value={file.role}
                  onValueChange={(value) => updateFile(index, { role: value as DocumentRole })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DOCUMENT_ROLES.map((role) => (
                      <SelectItem key={role} value={role}>
                        {t(`workspace.programme.documentRoles.${role}`, role)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Textarea
                value={file.text}
                rows={4}
                onChange={(event) => updateFile(index, { text: event.target.value })}
              />
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={pending || !draft.name.trim()}
            onClick={() =>
              startTransition(async () => {
                const result = await saveDemoPack({
                  ...draft,
                  chapters: draft.chapters.filter((chapter) => chapter.title.trim()),
                  files: draft.files.filter((file) => file.title.trim()),
                })
                if (result.error || !result.data) {
                  notify(result.error || t("admin.platform.demoPackSaveError"), "error")
                  return
                }
                notify(t("admin.platform.saved"), "success")
                refresh()
              })
            }
          >
            {t("admin.platform.demoPackSave")}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={pending || !draft.id}
            onClick={() =>
              startTransition(async () => {
                const saved = await saveDemoPack({
                  ...draft,
                  chapters: draft.chapters.filter((chapter) => chapter.title.trim()),
                  files: draft.files.filter((file) => file.title.trim()),
                })
                if (saved.error || !saved.data) {
                  notify(saved.error || t("admin.platform.demoPackSaveError"), "error")
                  return
                }
                const result = await loadDemoPack(saved.data.id)
                if (result.error || !result.data) {
                  notify(result.error || t("admin.platform.demoPackLoadError"), "error")
                  return
                }
                router.push(`/workspaces/${result.data.workspaceId}/programme`)
              })
            }
          >
            {t("admin.platform.demoPackLoad")}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={pending || !draft.id}
            onClick={() =>
              startTransition(async () => {
                const result = await removeLoadedDemos(draft.id)
                notify(result.error || t("admin.platform.demoPackRemoved"), result.error ? "error" : "success")
              })
            }
          >
            {t("admin.platform.demoPackRemove")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={pending || !draft.id}
            onClick={() =>
              startTransition(async () => {
                const result = await deleteDemoPack(draft.id)
                if (result.error) {
                  notify(result.error, "error")
                  return
                }
                setDraft(EMPTY)
                refresh()
              })
            }
          >
            {t("admin.platform.demoPackDelete")}
          </Button>
        </div>
      </div>
    </div>
  )
}
