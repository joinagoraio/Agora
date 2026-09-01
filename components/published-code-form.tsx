"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { unlockPublishedProgramme } from "@/lib/actions/publish"
import { useI18n } from "@/lib/i18n/use-i18n"

export function PublishedCodeForm({ publicationId }: { publicationId: string }) {
  const { t } = useI18n()
  const router = useRouter()
  const [code, setCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault()
        startTransition(async () => {
          const result = await unlockPublishedProgramme(publicationId, code)
          if (result.error) {
            setError(result.error)
            return
          }
          setError(null)
          router.refresh()
        })
      }}
    >
      <label className="block space-y-1 text-sm">
        <span>{t("workspace.published.codeLabel")}</span>
        <Input
          value={code}
          onChange={(event) => setCode(event.target.value)}
          autoComplete="off"
          required
        />
      </label>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" disabled={pending || !code.trim()}>
        {t("workspace.published.unlock")}
      </Button>
    </form>
  )
}
