"use client"

import { useEffect, useState, useTransition } from "react"
import { Loader2, Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import { FormattedMarkdown } from "@/components/formatted-markdown"
import { ReadAloudButton } from "@/components/ask-voice"
import { getLatestDemoDigest, makeDemoDigest, type DemoDigest } from "@/lib/actions/demo-digest"
import { useI18n } from "@/lib/i18n/use-i18n"
import { notify } from "@/lib/notify"

/** The summary of what the room asked, with improvement points, made at the end of the demo. */
export function DemoDigestBlock({ workspaceId, language }: { workspaceId: string; language: "nl" | "en" }) {
  const { t } = useI18n()
  const [digest, setDigest] = useState<DemoDigest | null>(null)
  const [empty, setEmpty] = useState(false)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    void getLatestDemoDigest(workspaceId).then((result) => setDigest(result.data))
  }, [workspaceId])

  const make = () =>
    startTransition(async () => {
      const result = await makeDemoDigest(workspaceId, language)
      if (result.error) {
        notify(result.error, "error")
        return
      }
      setEmpty(!result.data)
      if (result.data) setDigest(result.data)
    })

  return (
    <section className="space-y-2 rounded-lg border border-sky-200 bg-sky-50/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" disabled={pending} onClick={make} data-guidance-target="make-digest">
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          {digest ? t("demoTour.digestAgain", "Make the summary again") : t("demoTour.digestMake", "Make the summary")}
        </Button>
        {digest ? (
          <ReadAloudButton id={`digest-${digest.id}`} text={digest.bodyMarkdown} workspaceId={workspaceId} guidanceTarget="read-digest" withLabel />
        ) : null}
      </div>
      {pending ? <p className="text-xs text-muted-foreground">{t("demoTour.digestWorking", "Reading back through the questions and answers…")}</p> : null}
      {empty && !digest ? (
        <p className="text-sm text-muted-foreground">{t("demoTour.digestEmpty", "No questions have been asked yet.")}</p>
      ) : null}
      {digest ? (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">
            {t("demoTour.digestFrom", "From {{count}} questions and answers.", { count: digest.entries })}
          </p>
          <div className="text-sm [&_h2]:mt-3 [&_h2]:text-sm [&_h2]:font-semibold">
            <FormattedMarkdown>{digest.bodyMarkdown}</FormattedMarkdown>
          </div>
        </div>
      ) : null}
    </section>
  )
}
