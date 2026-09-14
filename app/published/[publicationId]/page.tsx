import Link from "next/link"
import ReactMarkdown from "react-markdown"
import { getPublishedProgrammeForReading } from "@/lib/actions/publish"
import { getPublishedConsultation } from "@/lib/actions/consultation"
import { getServerTranslator } from "@/lib/i18n/server"
import { Button } from "@/components/ui/button"
import { PublishedCodeForm } from "@/components/published-code-form"
import { PublishedPrintButton } from "@/components/published-print-button"
import { PublishedConsultationPanel } from "@/components/published-consultation-panel"

export default async function PublishedProgrammePage({
  params,
}: {
  params: Promise<{ publicationId: string }>
}) {
  const { publicationId } = await params
  const { t } = await getServerTranslator()
  const result = await getPublishedProgrammeForReading(publicationId)

  if (result.status === "missing") {
    return (
      <main className="mx-auto max-w-xl px-6 py-16">
        <h1 className="text-2xl font-semibold tracking-tight">{t("workspace.published.missing")}</h1>
      </main>
    )
  }

  if (result.status === "revoked") {
    return (
      <main className="mx-auto max-w-xl px-6 py-16">
        <h1 className="text-2xl font-semibold tracking-tight">{t("workspace.published.revoked")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("workspace.published.gazetteNote")}</p>
      </main>
    )
  }

  if (result.status === "expired") {
    return (
      <main className="mx-auto max-w-xl px-6 py-16">
        <h1 className="text-2xl font-semibold tracking-tight">{t("workspace.published.expired")}</h1>
      </main>
    )
  }

  if (result.status === "login") {
    return (
      <main className="mx-auto max-w-xl space-y-4 px-6 py-16">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("workspace.published.readOnly")}</p>
        <h1 className="text-2xl font-semibold tracking-tight">{result.publication.title}</h1>
        <p className="text-sm text-muted-foreground">{t("workspace.published.signIn")}</p>
        <Button asChild>
          <Link href="/auth/login">{t("workspace.published.signInAction")}</Link>
        </Button>
      </main>
    )
  }

  if (result.status === "needs_code") {
    return (
      <main className="mx-auto max-w-xl space-y-4 px-6 py-16">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("workspace.published.readOnly")}</p>
        <h1 className="text-2xl font-semibold tracking-tight">{result.publication.title}</h1>
        <p className="text-sm text-muted-foreground">{t("workspace.published.enterCode")}</p>
        <PublishedCodeForm publicationId={result.publication.id} />
      </main>
    )
  }

  const { publication, bodyMarkdown, authorityName } = result
  const consultation = await getPublishedConsultation(publication.id)

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-6 py-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("workspace.published.readOnly")}</p>
            <p className="text-sm text-muted-foreground">{authorityName}</p>
          </div>
          <PublishedPrintButton label={t("workspace.published.print")} />
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-8 px-6 py-12">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">{publication.title}</h1>
          <p className="text-muted-foreground">{t("workspace.published.subtitle")}</p>
          {publication.periodLabel ? (
            <p className="text-sm">
              {t("workspace.published.period")}: {publication.periodLabel}
            </p>
          ) : null}
        </div>
        <div className="space-y-1 text-sm">
          <p className="font-medium">{t("workspace.published.citation")}</p>
          <p className="text-muted-foreground">{publication.citation}</p>
        </div>
        <article className="prose prose-neutral max-w-none">
          <ReactMarkdown>{bodyMarkdown}</ReactMarkdown>
        </article>
        <p className="text-xs text-muted-foreground">{t("workspace.published.gazetteNote")}</p>
        {consultation.data ? (
          <PublishedConsultationPanel
            publicationId={publication.id}
            consultation={consultation.data.consultation}
            canComment={consultation.data.canComment}
            signedIn={consultation.data.signedIn}
            comments={consultation.data.comments}
            replies={consultation.data.replies}
            appeals={consultation.data.appeals}
            clusters={consultation.data.clusters}
            topicSummary={consultation.data.topicSummary}
          />
        ) : null}
      </main>
    </div>
  )
}
