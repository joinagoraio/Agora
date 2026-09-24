"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
  listDemoPackModels,
  loadDemoPack,
  removeLoadedDemos,
  saveDemoPack,
  type DemoPack,
  type DemoPackModelChoice,
  type DemoPackChapter,
  type DemoPackFile,
} from "@/lib/actions/demo-pack"
import { DOCUMENT_ROLES, type DocumentRole } from "@/lib/programme/domain"

const EMPTY: DemoPack = {
  id: "",
  name: "",
  writingLanguage: "en",
  mission: "",
  description: "",
  jurisdiction: "",
  defaultModelId: "",
  chapters: [{ title: "", required: true }],
  files: [],
}

export function PlatformDemoPacks() {
  const { t } = useI18n()
  const router = useRouter()
  const detailRef = useRef<HTMLDivElement>(null)
  const creatingRef = useRef(false)
  const [packs, setPacks] = useState<DemoPack[]>([])
  const [models, setModels] = useState<DemoPackModelChoice[]>([])
  const [draft, setDraft] = useState<DemoPack>(EMPTY)
  const [ready, setReady] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [viewing, setViewing] = useState<DemoPackFile | null>(null)
  const [pending, startTransition] = useTransition()

  const refresh = () => {
    startTransition(async () => {
      const [result, modelResult] = await Promise.all([listDemoPacks(), listDemoPackModels()])
      setModels(modelResult.data || [])
      if (result.error) {
        setLoadError(result.error)
        notify(result.error, "error")
        setReady(true)
        return
      }
      setLoadError(null)
      setPacks(result.data)
      setDraft((current) =>
        creatingRef.current
          ? current
          : result.data.find((pack) => pack.id === current.id) || result.data[0] || EMPTY,
      )
      setReady(true)
    })
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selectPack = (pack: DemoPack) => {
    creatingRef.current = false
    setCreating(false)
    setDraft(pack)
    detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  const startNewPack = () => {
    creatingRef.current = true
    setCreating(true)
    setDraft({ ...EMPTY, chapters: [{ title: "", required: true }] })
  }

  useEffect(() => {
    if (!creating) return
    detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    document.getElementById("pack-name")?.focus()
  }, [creating])

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

  const languageName = (language: DemoPack["writingLanguage"]) =>
    t(`space.wizard.basics.writingLanguageOptions.${language}`)

  const savedPack = () => ({
    ...draft,
    chapters: draft.chapters.filter((chapter) => chapter.title.trim()),
    files: draft.files.filter((file) => file.title.trim() && file.text.trim()),
  })

  const loadPack = () => {
    startTransition(async () => {
      const saved = await saveDemoPack(savedPack())
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{t("admin.platform.demoPacks")}</h1>
        <Button type="button" onClick={startNewPack}>
          {t("admin.platform.demoPackNew")}
        </Button>
      </div>
      <p className="max-w-2xl text-sm text-muted-foreground">{t("admin.platform.demoPacksHint")}</p>
      {loadError ? <p className="text-sm text-destructive">{loadError}</p> : null}
      {!ready ? <p className="text-sm text-muted-foreground">{t("admin.platform.demoPackLoading")}</p> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        {packs.map((pack) => {
          const selected = draft.id === pack.id
          return (
            <button
              key={pack.id}
              type="button"
              aria-pressed={selected}
              onClick={() => selectPack(pack)}
              className={`rounded-lg border p-4 text-left ${selected ? "border-foreground" : "border-border hover:bg-muted/40"}`}
            >
              <span className="block font-medium text-foreground">{pack.name}</span>
              <span className="mt-1 block text-sm text-muted-foreground">
                {t("admin.platform.demoPackSummary", undefined, {
                  files: pack.files.length,
                  chapters: pack.chapters.length,
                  language: languageName(pack.writingLanguage),
                })}
              </span>
            </button>
          )
        })}
      </div>

      {ready && packs.length === 0 && !draft.name ? (
        <p className="text-sm text-muted-foreground">{t("admin.platform.demoPackEmpty")}</p>
      ) : null}

      {creating || draft.id || draft.name.trim() ? (
        <div ref={detailRef} className="space-y-6 rounded-lg border p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold">{draft.name || t("admin.platform.demoPackUntitled")}</h2>
              <p className="max-w-2xl text-sm text-muted-foreground">{t("admin.platform.demoPackLoads")}</p>
            </div>
            <Button type="button" disabled={pending || !draft.name.trim()} onClick={loadPack}>
              {t("admin.platform.demoPackLoad")}
            </Button>
          </div>

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
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="pack-model">{t("admin.platform.demoPackModel")}</Label>
              <Select
                value={draft.defaultModelId || "none"}
                onValueChange={(value) => setDraft({ ...draft, defaultModelId: value === "none" ? "" : value })}
              >
                <SelectTrigger id="pack-model">
                  <SelectValue placeholder={t("admin.platform.demoPackModelEmpty")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("admin.platform.demoPackModelEmpty")}</SelectItem>
                  {models.map((model) => (
                    <SelectItem key={model.id} value={model.id}>
                      {model.providerLabel ? `${model.providerLabel} · ${model.label}` : model.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{t("admin.platform.demoPackModelHelp")}</p>
            </div>
          </div>

          <div className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="pack-mission">{t("space.wizard.scopeStep.missionLabel")}</Label>
              <Textarea
                id="pack-mission"
                rows={2}
                value={draft.mission}
                placeholder={t("space.wizard.scopeStep.missionPlaceholder")}
                onChange={(event) => setDraft({ ...draft, mission: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pack-description">{t("space.wizard.scopeStep.descriptionLabel")}</Label>
              <Textarea
                id="pack-description"
                rows={4}
                value={draft.description}
                placeholder={t("space.wizard.scopeStep.descriptionPlaceholder")}
                onChange={(event) => setDraft({ ...draft, description: event.target.value })}
              />
              <p className="text-xs text-muted-foreground">{t("space.wizard.scopeStep.descriptionHelp")}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pack-jurisdiction">{t("space.wizard.basics.jurisdictionLabel")}</Label>
              <Input
                id="pack-jurisdiction"
                value={draft.jurisdiction}
                placeholder={t("space.wizard.basics.jurisdictionPlaceholder")}
                onChange={(event) => setDraft({ ...draft, jurisdiction: event.target.value })}
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">{t("admin.platform.demoPackChapters")}</h3>
                <p className="text-sm text-muted-foreground">{t("admin.platform.demoPackChaptersHelp")}</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setDraft({ ...draft, chapters: [...draft.chapters, { title: "", required: true }] })}
              >
                {t("admin.platform.demoPackAddChapter")}
              </Button>
            </div>
            <ol className="space-y-2">
              {draft.chapters.map((chapter, index) => (
                <li key={`${chapter.sortOrder ?? index}-${index}`} className="flex items-start gap-3">
                  <span className="mt-2 w-5 shrink-0 text-sm text-muted-foreground">{index + 1}</span>
                  <div className="min-w-0 flex-1 space-y-1">
                    <Input
                      value={chapter.title}
                      placeholder={t("admin.platform.demoPackChapterTitle")}
                      onChange={(event) => updateChapter(index, { title: event.target.value })}
                    />
                    {chapter.instructions ? (
                      <p className="text-xs text-muted-foreground">{chapter.instructions}</p>
                    ) : null}
                    {chapter.outputForm ? (
                      <p className="text-xs text-muted-foreground">{chapter.outputForm}</p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">{t("admin.platform.demoPackFiles")}</h3>
                <p className="text-sm text-muted-foreground">{t("admin.platform.demoPackFilesHelp")}</p>
              </div>
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
            <ul className="divide-y rounded-md border">
              {draft.files.map((file, index) => (
                <li key={`${file.role}-${index}`} className="flex flex-wrap items-center gap-3 px-3 py-2">
                  <Input
                    value={file.title}
                    placeholder={t("admin.platform.demoPackFileTitle")}
                    className="min-w-0 flex-1"
                    onChange={(event) => updateFile(index, { title: event.target.value })}
                  />
                  <Select
                    value={file.role}
                    onValueChange={(value) => updateFile(index, { role: value as DocumentRole })}
                  >
                    <SelectTrigger className="w-56">
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
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!file.text.trim()}
                    onClick={() => setViewing(file)}
                  >
                    {t("admin.platform.demoPackView")}
                  </Button>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={pending || !draft.name.trim()}
              onClick={() =>
                startTransition(async () => {
                  const result = await saveDemoPack(savedPack())
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
      ) : null}

      <Dialog open={viewing != null} onOpenChange={(open) => !open && setViewing(null)}>
        <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{viewing?.title}</DialogTitle>
            <DialogDescription>
              {viewing ? t(`workspace.programme.documentRoles.${viewing.role}`, viewing.role) : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap text-sm leading-6">
            {viewing?.text}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
