"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { useI18n } from "@/lib/i18n/use-i18n"
import type { ProgrammeCitationSource } from "@/lib/programme/citation-display"

type Props = {
  sources: ProgrammeCitationSource[]
  onInsert: (marker: string) => void
  onClose: () => void
}

function sentencesFrom(text: string): string[] {
  const plain = text
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*|__|`/g, "")
    .replace(/\s+/g, " ")
    .trim()
  return plain
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 20 && sentence.length < 280)
    .slice(0, 12)
}

export function ProgrammeCiteDialog({ sources, onInsert, onClose }: Props) {
  const { t } = useI18n()
  const [documentId, setDocumentId] = useState(sources[0]?.id || "")
  const [sentences, setSentences] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!documentId) return
    let cancelled = false
    setLoading(true)
    setError("")
    void fetch(`/api/documents/${documentId}/text-content`, { credentials: "include", cache: "no-store" })
      .then(async (response) => {
        const body = await response.text()
        if (!response.ok) throw new Error(body)
        if (!cancelled) setSentences(sentencesFrom(body))
      })
      .catch(() => {
        if (!cancelled) {
          setSentences([])
          setError(t("workspace.programme.citeLoadError"))
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [documentId, t])

  return (
    <div
      role="dialog"
      aria-label={t("workspace.programme.citeTitle")}
      className="fixed bottom-6 right-6 z-[100] w-96 max-w-[calc(100vw-2rem)] rounded-md border bg-popover p-3 text-sm shadow-lg"
      data-programme-format-menu=""
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="font-medium">{t("workspace.programme.citeTitle")}</p>
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>
          {t("workspace.programme.citeClose")}
        </Button>
      </div>
      <label className="mb-2 block space-y-1">
        <span className="text-xs text-muted-foreground">{t("workspace.programme.citeSource")}</span>
        <select
          className="w-full rounded-md border bg-background px-2 py-1"
          value={documentId}
          onChange={(event) => setDocumentId(event.target.value)}
        >
          {sources.map((source) => (
            <option key={source.id} value={source.id}>
              {source.label || source.title}
            </option>
          ))}
        </select>
      </label>
      {loading ? <p className="text-xs text-muted-foreground">{t("workspace.programme.citeLoading")}</p> : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      <ul className="max-h-64 space-y-1 overflow-y-auto">
        {sentences.map((sentence) => (
          <li key={sentence}>
            <button
              type="button"
              className="w-full rounded-md px-2 py-1 text-left hover:bg-muted"
              onClick={() => {
                const marker = `[citation:${JSON.stringify({ quote: sentence, documentId, pageNumber: 1 })}]`
                onInsert(`${marker} `)
                onClose()
              }}
            >
              {sentence}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
