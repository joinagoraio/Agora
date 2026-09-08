"use client"

import { useI18n } from "@/lib/i18n/use-i18n"
import { splitAuthorityDeleteImpact } from "@/lib/programme/domain"

export type AuthorityDeleteWorkspace = {
  id: string
  name: string
  kind?: string | null
  metadata?: Record<string, unknown> | null
}

export type AuthorityDeleteImpactData = ReturnType<typeof splitAuthorityDeleteImpact>

export { splitAuthorityDeleteImpact }

export function AuthorityDeleteImpact({
  loading,
  error,
  impact,
}: {
  loading: boolean
  error: string | null
  impact: AuthorityDeleteImpactData | null
}) {
  const { t } = useI18n()
  if (loading && !impact) {
    return <p className="text-sm text-muted-foreground">{t("space.settings.danger.programmesLoading")}</p>
  }
  if (error && !impact) {
    return <p className="text-sm text-destructive">{error}</p>
  }
  if (!impact) return null
  return (
    <div className="space-y-2">
      {impact.programmes.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("space.settings.danger.programmesEmpty")}</p>
      ) : (
        <>
          <p className="text-sm font-medium">
            {t("space.settings.danger.programmesTitle", undefined, { count: String(impact.programmes.length) })}
          </p>
          <ul className="max-h-48 overflow-y-auto rounded-md border bg-muted/40 px-3 py-2 text-sm">
            {impact.programmes.map((programme) => (
              <li key={programme.id} className="py-0.5">
                {programme.name}
              </li>
            ))}
          </ul>
        </>
      )}
      {impact.legacyCount > 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("space.settings.danger.legacyAlso", undefined, { count: String(impact.legacyCount) })}
        </p>
      ) : null}
    </div>
  )
}
