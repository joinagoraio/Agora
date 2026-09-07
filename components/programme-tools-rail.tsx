"use client"

import Link from "next/link"
import type { LucideIcon } from "lucide-react"
import { ArrowLeft, BookOpen, FileText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type ProgrammeToolsItem = {
  id: string
  label: string
  icon: LucideIcon
  done?: boolean
  active?: boolean
  href?: string
  onSelect?: () => void
}

type Props = {
  open: boolean
  spaceHref: string
  spaceLabel: string
  views: ProgrammeToolsItem[]
  tools: ProgrammeToolsItem[]
  more: ProgrammeToolsItem[]
}

export function ProgrammeToolsRail({ open, spaceHref, spaceLabel, views, tools, more }: Props) {
  if (!open) return null

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-black/5 bg-white">
      <div className="px-3 py-3">
        <Button variant="ghost" className="h-auto w-full justify-start px-2 py-2 text-left" asChild>
          <Link href={spaceHref}>
            <ArrowLeft className="mr-2 h-4 w-4 shrink-0" />
            <span className="min-w-0 truncate text-sm font-normal">{spaceLabel}</span>
          </Link>
        </Button>
      </div>
      <nav className="min-h-0 flex-1 space-y-5 overflow-y-auto px-2 pb-4">
        <RailGroup items={views} fallbackIcon={FileText} />
        <RailGroup items={tools} fallbackIcon={BookOpen} />
        {more.length > 0 ? <RailGroup items={more} fallbackIcon={BookOpen} /> : null}
      </nav>
    </aside>
  )
}

function RailGroup({
  items,
  fallbackIcon: Fallback,
}: {
  items: ProgrammeToolsItem[]
  fallbackIcon: LucideIcon
}) {
  if (items.length === 0) return null
  return (
    <div className="space-y-0.5">
      {items.map((item) => {
        const Icon = item.icon || Fallback
        const className = cn(
          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted/70",
          item.active && "bg-muted font-medium",
        )
        const body = (
          <>
            <Icon className="h-4 w-4 shrink-0 opacity-70" />
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {item.done ? <span className="text-[10px] opacity-50">✓</span> : null}
          </>
        )
        if (item.href) {
          return (
            <Link key={item.id} href={item.href} scroll={false} className={className}>
              {body}
            </Link>
          )
        }
        return (
          <button key={item.id} type="button" className={className} onClick={item.onSelect}>
            {body}
          </button>
        )
      })}
    </div>
  )
}
