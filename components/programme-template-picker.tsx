"use client"

import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useI18n } from "@/lib/i18n/use-i18n"
import type { ProgrammeTemplateSummary } from "@/lib/programme/domain"

const NONE = "none"

export function ProgrammeTemplatePicker({
  templates,
  value,
  onChange,
  allowNone = true,
  disabled,
  id = "programme-template",
  label,
  help,
}: {
  templates: ProgrammeTemplateSummary[]
  value: string | null
  onChange: (templateId: string | null) => void
  allowNone?: boolean
  disabled?: boolean
  id?: string
  label?: string
  help?: string
}) {
  const { t } = useI18n()
  const selected = templates.find((template) => template.id === value) ?? null
  const resolved = value && templates.some((template) => template.id === value) ? value : allowNone ? NONE : (templates[0]?.id ?? NONE)

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label ?? t("space.workspaces.dialog.templateLabel")}</Label>
      <Select
        value={resolved}
        onValueChange={(next) => onChange(next === NONE ? null : next)}
        disabled={disabled || (templates.length === 0 && !allowNone)}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder={label ?? t("space.workspaces.dialog.templateLabel")} />
        </SelectTrigger>
        <SelectContent>
          {allowNone ? <SelectItem value={NONE}>{t("space.workspaces.dialog.templateNone")}</SelectItem> : null}
          {templates.map((template) => (
            <SelectItem key={template.id} value={template.id}>
              {template.name}
              {template.chapterCount > 0
                ? ` · ${t("space.workspaces.dialog.templateChapters", undefined, { count: template.chapterCount })}`
                : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {help ? <p className="text-xs text-muted-foreground">{help}</p> : null}
      {selected && selected.chapterTitles.length > 0 ? (
        <p className="text-xs text-muted-foreground">{selected.chapterTitles.join(" · ")}</p>
      ) : null}
    </div>
  )
}
