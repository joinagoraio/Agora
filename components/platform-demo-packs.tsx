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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
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
  endLoadedDemo,
  listLoadedDemos,
  type LoadedDemo,
  listDemoPacks,
  listDemoPackModels,
  loadDemoPack,
  removeLoadedDemos,
  saveDemoPack,
  setLoadedDemoHidden,
  getDemoTourOptions,
  setDemoTourOption,
  setDemoTourDefaultVoice,
  type DemoPack,
  type DemoPackModelChoice,
  type DemoPackChapter,
  type DemoPackFile,
} from "@/lib/actions/demo-pack"
import { getNarrationStatus, recordTourNarration, type NarrationStatus } from "@/lib/actions/demo-voice"
import { listDemoDigests, type DemoDigest } from "@/lib/actions/demo-digest"
import { FormattedMarkdown } from "@/components/formatted-markdown"
import { DEMO_PACK_SPACE_TYPES, type DemoPackSpaceType } from "@/lib/programme/domain"
import { DOCUMENT_ROLES, type DocumentRole } from "@/lib/programme/domain"

const EMPTY: DemoPack = {
  id: "",
  name: "",
  writingLanguage: "en",
  mission: "",
  description: "",
  jurisdiction: "",
  spaceType: "municipal",
  defaultModelId: "",
  workupHeadings: [],
  focusInterests: [],
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
  const [loadedDemos, setLoadedDemos] = useState<LoadedDemo[]>([])
  const [confirmDemo, setConfirmDemo] = useState<LoadedDemo | "all" | null>(null)
  const [typedWord, setTypedWord] = useState("")
  const refreshLoaded = (packId: string) => {
    void listLoadedDemos(packId).then((result) => setLoadedDemos(result.data || []))
  }
  useEffect(() => {
    if (draft.id) refreshLoaded(draft.id)
    else setLoadedDemos([])
  }, [draft.id])
  const [headingsText, setHeadingsText] = useState("")
  const [focusText, setFocusText] = useState("")

  useEffect(() => {
    setHeadingsText(draft.workupHeadings.map((heading) => heading.label).join("\n"))
    setFocusText(draft.focusInterests.join(", "))
  }, [draft.id, draft.workupHeadings, draft.focusInterests])
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

  const savedPack = (): DemoPack => ({
    ...draft,
    workupHeadings: headingsText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((label, index) => ({ key: `h${index + 1}`, label })),
    focusInterests: focusText
      .split(/[,\s]+/)
      .map((value) => value.trim())
      .filter(Boolean),
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
            <div className="flex flex-col items-end gap-1">
              <Button
                type="button"
                disabled={pending || !draft.name.trim() || !draft.defaultModelId}
                onClick={loadPack}
              >
                {t("admin.platform.demoPackLoad")}
              </Button>
              {!draft.defaultModelId ? (
                <p className="text-xs text-muted-foreground">{t("admin.platform.demoPackModelRequired")}</p>
              ) : null}
            </div>
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
            <div className="space-y-2">
              <Label htmlFor="pack-space-type">{t("space.wizard.basics.scopeLabel")}</Label>
              <Select
                value={draft.spaceType}
                onValueChange={(value) => setDraft({ ...draft, spaceType: value as DemoPackSpaceType })}
              >
                <SelectTrigger id="pack-space-type" className="max-w-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEMO_PACK_SPACE_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {t(`space.wizard.basics.scopeOptions.${type}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{t("admin.platform.demoPackSpaceTypeHelp")}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pack-headings">{t("space.settings.templates.workupLabel")}</Label>
              <Textarea
                id="pack-headings"
                rows={6}
                value={headingsText}
                placeholder={t("space.settings.templates.workupPlaceholder")}
                onChange={(event) => setHeadingsText(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">{t("admin.platform.demoPackHeadingsHelp")}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pack-focus">{t("admin.platform.demoPackFocus")}</Label>
              <Input
                id="pack-focus"
                className="max-w-xs"
                value={focusText}
                placeholder="14, 15, 16"
                onChange={(event) => setFocusText(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">{t("admin.platform.demoPackFocusHelp")}</p>
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
                    {chapter.drawsOn?.length ? (
                      <p className="text-xs text-muted-foreground">
                        {t("space.settings.templates.drawsOn")}:{" "}
                        {chapter.drawsOn.map((input) => t(`space.settings.templates.drawsOnInput.${input}`)).join(" · ")}
                      </p>
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
              disabled={pending || !draft.id || loadedDemos.length === 0}
              onClick={() => {
                setTypedWord("")
                setConfirmDemo("all")
              }}
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

          {draft.id ? (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">{t("admin.platform.loadedDemos")}</h3>
              {loadedDemos.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("admin.platform.loadedDemosEmpty")}</p>
              ) : (
                <ul className="divide-y rounded-md border">
                  {loadedDemos.map((demo) => (
                    <li key={demo.spaceId} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">
                          {demo.name}
                          {demo.hidden ? (
                            <span className="ml-2 rounded border px-1.5 py-0.5 text-[10px] font-normal uppercase text-muted-foreground">
                              {t("admin.platform.loadedDemoHidden", "Hidden")}
                            </span>
                          ) : null}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {t("admin.platform.loadedDemoSummary", undefined, {
                            loaded: demo.loadedAt ? new Date(demo.loadedAt).toLocaleString() : "",
                            measures: String(demo.measures),
                            documents: String(demo.documents),
                          })}
                          {" · "}
                          {t("admin.platform.loadedDemoCost", "AI cost about US$ {{cost}}", { cost: demo.costUsd.toFixed(2) })}
                        </span>
                      </span>
                      <Button type="button" size="sm" variant="outline" onClick={() => router.push(`/spaces/${demo.spaceId}`)}>
                        {t("admin.platform.loadedDemoOpen")}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() =>
                          startTransition(async () => {
                            const result = await setLoadedDemoHidden(demo.spaceId, !demo.hidden)
                            if (result.error) {
                              notify(result.error, "error")
                              return
                            }
                            refreshLoaded(draft.id)
                          })
                        }
                      >
                        {demo.hidden ? t("admin.platform.loadedDemoShow", "Show on dashboard") : t("admin.platform.loadedDemoHide", "Hide from dashboard")}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-red-800"
                        disabled={pending}
                        onClick={() => {
                          setTypedWord("")
                          setConfirmDemo(demo)
                        }}
                      >
                        {t("demoStrip.end")}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
          {draft.id ? <DemoDigestsRow packId={draft.id} /> : null}
          {draft.id ? <TourOptionsRow packId={draft.id} /> : null}
          {draft.id ? <TourNarrationRow packId={draft.id} /> : null}
        </div>
      ) : null}

      <AlertDialog open={confirmDemo !== null} onOpenChange={(open) => (open ? null : setConfirmDemo(null))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmDemo === "all" ? t("admin.platform.removeAllTitle") : t("demoStrip.endTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                {confirmDemo === "all" ? (
                  <>
                    <p>{t("admin.platform.removeAllBody", undefined, { count: String(loadedDemos.length) })}</p>
                    <ul className="list-disc pl-5">
                      {loadedDemos.map((demo) => (
                        <li key={demo.spaceId}>{demo.name}</li>
                      ))}
                    </ul>
                  </>
                ) : confirmDemo ? (
                  <p>
                    {t("demoStrip.endBody", undefined, {
                      name: confirmDemo.name,
                      programmes: String(confirmDemo.programmes),
                      measures: String(confirmDemo.measures),
                      documents: String(confirmDemo.documents),
                    })}
                  </p>
                ) : null}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1">
            <p className="text-sm">{t("demoStrip.typeToConfirm", undefined, { word: t("demoStrip.confirmWord") })}</p>
            <Input value={typedWord} autoFocus onChange={(event) => setTypedWord(event.target.value)} />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>{t("demoStrip.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-700 hover:bg-red-800"
              disabled={pending || typedWord.trim().toLowerCase() !== t("demoStrip.confirmWord").toLowerCase()}
              onClick={(event) => {
                event.preventDefault()
                const target = confirmDemo
                startTransition(async () => {
                  const result =
                    target === "all" ? await removeLoadedDemos(draft.id) : target ? await endLoadedDemo(target.spaceId) : null
                  if (result?.error) {
                    notify(result.error, "error")
                    return
                  }
                  notify(target === "all" ? t("admin.platform.demoPackRemoved") : t("demoStrip.ended"), "success")
                  setConfirmDemo(null)
                  refreshLoaded(draft.id)
                })
              }}
            >
              {confirmDemo === "all" ? t("admin.platform.demoPackRemove") : t("demoStrip.endConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

function TourNarrationRow({ packId }: { packId: string }) {
  const { t } = useI18n()
  const [status, setStatus] = useState<NarrationStatus | null>(null)
  const [recording, setRecording] = useState(false)
  const [pending, startTransition] = useTransition()

  const load = () => {
    void getNarrationStatus(packId).then((result) => setStatus(result.data ?? null))
  }
  useEffect(load, [packId])

  const complete = status
    ? Object.values(status.recorded).every((voice) => voice.nl === status.steps && voice.en === status.steps)
    : false
  useEffect(() => {
    if (!recording || complete) {
      if (complete) setRecording(false)
      return
    }
    const timer = window.setInterval(load, 5000)
    return () => window.clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording, complete])

  if (!status || status.steps === 0) return null
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">{t("admin.platform.tourNarration", "Tour narration")}</h3>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-muted-foreground">
          {(["female", "male"] as const)
            .map((voice) =>
              t("admin.platform.tourNarrationStatus", "{{voice}}: Dutch {{nl}} of {{steps}}, English {{en}} of {{steps}}", {
                voice: `${t(`demoTour.voice.${voice}`, voice)} (${status.voices[voice]})`,
                steps: String(status.steps),
                nl: String(status.recorded[voice].nl),
                en: String(status.recorded[voice].en),
              }),
            )
            .join(" · ")}
          {" · "}
          {t("admin.platform.tourNarrationCost", "recording cost so far about US$ {{cost}}", { cost: status.costUsd.toFixed(2) })}
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending || recording || complete}
          onClick={() =>
            startTransition(async () => {
              const result = await recordTourNarration(packId)
              if (result.error) {
                notify(result.error, "error")
                return
              }
              setRecording(true)
              notify(t("admin.platform.tourNarrationStarted", "Recording {{count}} narration files. This takes a minute or two.", { count: String(result.data?.missing ?? 0) }))
            })
          }
        >
          {recording ? t("admin.platform.tourNarrationRecording", "Recording…") : t("admin.platform.tourNarrationRecord", "Record narration")}
        </Button>
      </div>
    </div>
  )
}

function TourOptionsRow({ packId }: { packId: string }) {
  const { t } = useI18n()
  const [state, setState] = useState<{
    options: Partial<Record<string, boolean>>
    available: string[]
    defaultVoice: "female" | "male"
  } | null>(null)
  const [pending, startTransition] = useTransition()
  useEffect(() => {
    void getDemoTourOptions(packId).then((result) => setState(result.data ?? null))
  }, [packId])
  if (!state) return null
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">{t("admin.platform.tourOptions", "Tour parts")}</h3>
      <div className="flex items-center gap-2 text-sm" role="group" aria-label={t("admin.platform.tourDefaultVoice", "Default voice")}>
        <span>{t("admin.platform.tourDefaultVoice", "Default voice")}</span>
        {(["female", "male"] as const).map((voice) => (
          <Button
            key={voice}
            type="button"
            size="sm"
            variant={state.defaultVoice === voice ? "secondary" : "ghost"}
            aria-pressed={state.defaultVoice === voice}
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await setDemoTourDefaultVoice(packId, voice)
                if (result.error) {
                  notify(result.error, "error")
                  return
                }
                setState((current) => (current ? { ...current, defaultVoice: voice } : current))
              })
            }
          >
            {t(`demoTour.voice.${voice}`, voice)}
          </Button>
        ))}
        <span className="text-xs text-muted-foreground">{t("admin.platform.tourDefaultVoiceHelp", "The presenter can switch in the tour.")}</span>
      </div>
      {state.available.map((option) => (
        <label key={option} className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={state.options[option] === true}
            disabled={pending}
            onChange={(event) => {
              const on = event.target.checked
              startTransition(async () => {
                const result = await setDemoTourOption(packId, option as "aiSetup", on)
                if (result.error) {
                  notify(result.error, "error")
                  return
                }
                setState((current) => (current ? { ...current, options: { ...current.options, [option]: on } } : current))
              })
            }}
          />
          <span>
            <span className="font-medium">{t(`admin.platform.tourOption.${option}.label`, option)}</span>
            <span className="block text-xs text-muted-foreground">{t(`admin.platform.tourOption.${option}.help`, "")}</span>
          </span>
        </label>
      ))}
    </div>
  )
}

/** Summaries of what the room asked, kept after a demo is ended. */
function DemoDigestsRow({ packId }: { packId: string }) {
  const { t } = useI18n()
  const [digests, setDigests] = useState<DemoDigest[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  useEffect(() => {
    void listDemoDigests(packId).then((result) => setDigests(result.data))
  }, [packId])
  if (digests.length === 0) return null
  const download = (digest: DemoDigest) => {
    const blob = new Blob([`# ${digest.demoName ?? ""}\n\n${digest.bodyMarkdown}\n`], { type: "text/markdown" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `demo-summary-${digest.createdAt.slice(0, 10)}.md`
    link.click()
    URL.revokeObjectURL(url)
  }
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">{t("admin.platform.demoDigests", "What the room asked")}</h3>
      <ul className="divide-y rounded-md border">
        {digests.map((digest) => (
          <li key={digest.id} className="space-y-2 px-3 py-2 text-sm">
            <div className="flex flex-wrap items-center gap-3">
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{digest.demoName}</span>
                <span className="text-xs text-muted-foreground">
                  {t("admin.platform.demoDigestLine", "{{when}} · from {{count}} questions and answers", {
                    when: new Date(digest.createdAt).toLocaleString(),
                    count: String(digest.entries),
                  })}
                </span>
              </span>
              <Button type="button" size="sm" variant="ghost" onClick={() => setOpenId(openId === digest.id ? null : digest.id)}>
                {openId === digest.id ? t("admin.platform.demoDigestHide", "Hide") : t("admin.platform.demoDigestView", "View")}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => download(digest)}>
                {t("admin.platform.demoDigestDownload", "Download")}
              </Button>
            </div>
            {openId === digest.id ? (
              <div className="rounded-md bg-muted/30 p-3 [&_h2]:mt-3 [&_h2]:font-semibold">
                <FormattedMarkdown>{digest.bodyMarkdown}</FormattedMarkdown>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
}
