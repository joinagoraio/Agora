"use client"

import ReactMarkdown from "react-markdown"

import { useI18n } from "@/lib/i18n/use-i18n"

export const QUOTE_EVENT = "agora:published-quote"

/** The sentences a click quotes: the selection when there is one, otherwise the opening of the passage. */
function quoteFor(element: HTMLElement) {
  const selected = window.getSelection()?.toString().replace(/\s+/g, " ").trim()
  if (selected && element.contains(window.getSelection()?.anchorNode ?? null)) return selected
  const text = element.textContent?.replace(/\s+/g, " ").trim() || ""
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text]
  let quote = ""
  for (const sentence of sentences) {
    if (quote && (quote + sentence).length > 280) break
    quote += sentence
  }
  return quote.trim()
}

/** The published programme. While consultation is open, a click on a passage quotes it in the response form. */
export function PublishedArticle({ bodyMarkdown, quotable }: { bodyMarkdown: string; quotable: boolean }) {
  const { t } = useI18n()
  const quote = (element: HTMLElement) => {
    if (!quotable) return
    window.dispatchEvent(new CustomEvent(QUOTE_EVENT, { detail: quoteFor(element) }))
  }
  return (
    <>
      {quotable ? <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm">{t("workspace.published.consultationClickToQuote")}</p> : null}
      <article className="prose prose-neutral max-w-none">
        <ReactMarkdown
          components={{
            p: ({ node: _node, ...props }) =>
              quotable ? (
                <p
                  {...props}
                  data-guidance-target="published-passage"
                  tabIndex={0}
                  className="cursor-pointer rounded-sm hover:bg-amber-50 focus-visible:bg-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                  onClick={(event) => quote(event.currentTarget)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return
                    event.preventDefault()
                    quote(event.currentTarget)
                  }}
                />
              ) : (
                <p {...props} />
              ),
          }}
        >
          {bodyMarkdown}
        </ReactMarkdown>
      </article>
    </>
  )
}
