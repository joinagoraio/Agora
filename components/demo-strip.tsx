"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, X } from "lucide-react"

import { Button } from "@/components/ui/button"
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
import { endLoadedDemo, resetLoadedDemo, type LoadedDemo } from "@/lib/actions/demo-pack"
import { useI18n } from "@/lib/i18n/use-i18n"
import { notify } from "@/lib/notify"

/** A quiet strip at the top of a demo authority, for platform admins: what it is, and End or Reset. */
export function DemoStrip({ demo }: { demo: LoadedDemo }) {
  const { t } = useI18n()
  const router = useRouter()
  const [hidden, setHidden] = useState(false)
  const [confirm, setConfirm] = useState<"end" | "reset" | null>(null)
  const [typed, setTyped] = useState("")
  const [pending, startTransition] = useTransition()
  const confirmWord = t("demoStrip.confirmWord")

  if (hidden) return null

  const loadedAt = demo.loadedAt ? new Date(demo.loadedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : ""

  const run = () =>
    startTransition(async () => {
      if (confirm === "reset") {
        const result = await resetLoadedDemo(demo.spaceId)
        if (result.error || !result.data) {
          notify(result.error || t("demoStrip.resetFailed"), "error")
          return
        }
        notify(t("demoStrip.resetDone"), "success")
        router.push(`/workspaces/${result.data.workspaceId}/programme`)
        return
      }
      const result = await endLoadedDemo(demo.spaceId)
      if (result.error) {
        notify(result.error, "error")
        return
      }
      notify(t("demoStrip.ended"), "success")
      router.push("/admin/demo-packs")
    })

  return (
    <>
      <div
        className="flex shrink-0 items-center gap-3 border-b bg-amber-50 px-4 py-1.5 text-xs text-amber-950"
        role="note"
        data-demo-strip=""
      >
        <span className="rounded border border-amber-300 bg-white px-1.5 py-0.5 font-semibold tracking-wide uppercase">
          {t("demoStrip.label")}
        </span>
        <span className="min-w-0 flex-1 truncate">
          {t("demoStrip.summary", undefined, { pack: demo.packName, loaded: loadedAt })}
        </span>
        <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" disabled={pending} onClick={() => setConfirm("reset")}>
          {t("demoStrip.reset")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 text-xs text-red-800 hover:text-red-900"
          disabled={pending}
          onClick={() => {
            setTyped("")
            setConfirm("end")
          }}
        >
          {t("demoStrip.end")}
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          className="h-7 w-7"
          aria-label={t("demoStrip.hide")}
          title={t("demoStrip.hide")}
          onClick={() => setHidden(true)}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <AlertDialog open={confirm !== null} onOpenChange={(open) => (open ? null : setConfirm(null))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm === "reset" ? t("demoStrip.resetTitle") : t("demoStrip.endTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(confirm === "reset" ? "demoStrip.resetBody" : "demoStrip.endBody", undefined, {
                name: demo.name,
                programmes: String(demo.programmes),
                measures: String(demo.measures),
                documents: String(demo.documents),
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {confirm === "end" ? (
            <div className="space-y-1">
              <p className="text-sm">{t("demoStrip.typeToConfirm", undefined, { word: confirmWord })}</p>
              <Input value={typed} autoFocus onChange={(event) => setTyped(event.target.value)} aria-label={confirmWord} />
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>{t("demoStrip.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending || (confirm === "end" && typed.trim().toLowerCase() !== confirmWord.toLowerCase())}
              className={confirm === "end" ? "bg-red-700 hover:bg-red-800" : undefined}
              onClick={(event) => {
                event.preventDefault()
                run()
              }}
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {confirm === "reset" ? t("demoStrip.resetConfirm") : t("demoStrip.endConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
