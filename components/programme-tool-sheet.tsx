"use client"

import { useState, type ReactNode } from "react"
import type { LucideIcon } from "lucide-react"
import {
  BookOpen,
  Bot,
  CircleMinus,
  CirclePlus,
  ClipboardList,
  FileDown,
  Leaf,
  ListChecks,
  MessagesSquare,
  Quote,
  ScanSearch,
  SlidersHorizontal,
  UserCheck,
} from "lucide-react"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useI18n } from "@/lib/i18n/use-i18n"
import { cn } from "@/lib/utils"
import type { ProgrammeWorkbenchSection } from "@/lib/programme/domain"

const SECTION_ICONS: Partial<Record<ProgrammeWorkbenchSection, LucideIcon>> = {
  overview: ClipboardList,
  setup: SlidersHorizontal,
  agents: Bot,
  corpus: ClipboardList,
  analysis: ScanSearch,
  measures: ListChecks,
  effects: Leaf,
  provenance: Quote,
  review: UserCheck,
  consultation: MessagesSquare,
  export: FileDown,
  publish: BookOpen,
}

export type ProgrammeToolGroup = {
  id: string
  sections: ProgrammeWorkbenchSection[]
}

export function ProgrammeToolNav({
  groups,
  activeSection,
  onSection,
}: {
  groups: ProgrammeToolGroup[]
  activeSection: ProgrammeWorkbenchSection
  onSection: (section: ProgrammeWorkbenchSection) => void
}) {
  const { t } = useI18n()
  return (
    <nav
      aria-label={t("workspace.programme.navAria")}
      className="flex w-56 shrink-0 flex-col gap-5 overflow-y-auto border-r px-3 py-4"
    >
      {groups.map((group) => (
        <div key={group.id} className="space-y-1">
          <p className="px-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {t(`workspace.programme.menuGroup.${group.id}`)}
          </p>
          {group.sections.map((section) => {
            const Icon = SECTION_ICONS[section] ?? ClipboardList
            const selected = section === activeSection
            const label = t(`workspace.programme.nav.${section}`)
            return (
              <button
                key={section}
                type="button"
                aria-current={selected ? "page" : undefined}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:text-foreground",
                  selected && "font-medium text-foreground",
                )}
                onClick={() => onSection(section)}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="min-w-0 truncate">{label}</span>
              </button>
            )
          })}
        </div>
      ))}
    </nav>
  )
}

export function ProgrammeToolSheet({
  groups,
  activeSection,
  onSection,
  children,
}: {
  groups: ProgrammeToolGroup[]
  activeSection: ProgrammeWorkbenchSection
  onSection: (section: ProgrammeWorkbenchSection) => void
  children: ReactNode
}) {
  const { t } = useI18n()
  const sections = groups.flatMap((group) => group.sections)
  return (
    <div data-programme-tool-sheet className="flex min-h-0 flex-1 flex-col md:flex-row">
      <div className="hidden min-h-0 md:flex">
        <ProgrammeToolNav groups={groups} activeSection={activeSection} onSection={onSection} />
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="shrink-0 border-b px-4 py-3 md:hidden">
          <Select value={activeSection} onValueChange={(value) => onSection(value as ProgrammeWorkbenchSection)}>
            <SelectTrigger className="w-full" aria-label={t("workspace.programme.navAria")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sections.map((section) => (
                <SelectItem key={section} value={section}>
                  {t(`workspace.programme.nav.${section}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {children}
      </div>
    </div>
  )
}

export function ProgrammeToolPage({
  title,
  purpose,
  actions,
  children,
  fill = false,
}: {
  title: string
  purpose?: string
  actions?: ReactNode
  children: ReactNode
  fill?: boolean
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="shrink-0 space-y-3 border-b px-6 py-4 pr-14">
        <div className="space-y-1">
          <h2 className="text-lg font-medium">{title}</h2>
          {purpose ? <p className="max-w-3xl text-sm text-muted-foreground">{purpose}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </header>
      <div className={cn("min-h-0 flex-1", fill ? "flex flex-col overflow-hidden" : "space-y-4 overflow-y-auto px-6 py-4")}>
        {children}
      </div>
    </div>
  )
}

export function ProgrammeToolSplit({ list, detail }: { list: ReactNode; detail: ReactNode }) {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[18rem_minmax(0,1fr)]">
      <div className="min-h-0 overflow-y-auto border-b md:border-r md:border-b-0">{list}</div>
      <div className="min-h-0 overflow-y-auto">{detail}</div>
    </div>
  )
}

export function ProgrammeToolExtra({
  label,
  children,
  defaultOpen = false,
}: {
  label: string
  children: ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const Icon = open ? CircleMinus : CirclePlus
  return (
    <div className="w-full">
      <button
        type="button"
        aria-expanded={open}
        className="flex items-center gap-2 py-1 text-left text-sm text-muted-foreground hover:text-foreground"
        onClick={() => setOpen((current) => !current)}
      >
        <Icon className="size-4 shrink-0" />
        <span>{label}</span>
      </button>
      {open ? <div className="mt-2 space-y-2 pl-6">{children}</div> : null}
    </div>
  )
}

export function ProgrammeToolSwitch<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { id: T; label: string }[]
  onChange: (id: T) => void
}) {
  return (
    <div role="tablist" aria-label={label} className="mb-4 flex w-fit flex-wrap gap-1 rounded-lg bg-muted p-1">
      {options.map((option) => {
        const selected = value === option.id
        return (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={selected}
            className={cn(
              "rounded-md px-3 py-1 text-sm",
              selected ? "bg-background font-medium shadow-sm" : "text-muted-foreground",
            )}
            onClick={() => onChange(option.id)}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
