import type { Components } from "react-markdown"
import ReactMarkdown from "react-markdown"

import { cn } from "@/lib/utils"

const components: Components = {
  h1: ({ children }) => <h2 className="mt-3 text-sm font-semibold first:mt-0">{children}</h2>,
  h2: ({ children }) => <h2 className="mt-3 text-sm font-semibold first:mt-0">{children}</h2>,
  h3: ({ children }) => (
    <h3 className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground first:mt-0">
      {children}
    </h3>
  ),
  p: ({ children }) => <p className="my-2 leading-relaxed first:mt-0 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-4 first:mt-0 last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-4 first:mt-0 last:mb-0">{children}</ol>,
  li: ({ children }) => <li className="leading-snug">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
}

type Props = {
  children: string
  className?: string
}

export function FormattedMarkdown({ children, className }: Props) {
  return (
    <div
      className={cn(
        "max-w-none break-words text-sm [&_pre]:whitespace-pre-wrap [&_pre]:break-words",
        className,
      )}
    >
      <ReactMarkdown components={components}>{children}</ReactMarkdown>
    </div>
  )
}
