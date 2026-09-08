"use client"

import type { ReactNode } from "react"
import { LlmProviderIcon } from "@/components/llm-provider-icon"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Switch } from "@/components/ui/switch"

type Props = {
  providerId: string
  title: string
  description?: string
  enabled: boolean
  onEnabledChange: (enabled: boolean) => void
  enabledAriaLabel: string
  showEnabledSwitch?: boolean
  pending?: boolean
  actions?: ReactNode
  modelsLabel: string
  modelsSummary?: string
  models?: ReactNode
}

export function LlmProviderCard({
  providerId,
  title,
  description,
  enabled,
  onEnabledChange,
  enabledAriaLabel,
  showEnabledSwitch = true,
  pending = false,
  actions,
  modelsLabel,
  modelsSummary,
  models,
}: Props) {
  return (
    <div className="rounded-md border px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <LlmProviderIcon providerId={providerId} className="mt-0.5" />
          <div className="min-w-0">
            <p className="font-medium">{title}</p>
            {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {enabled ? actions : null}
          {showEnabledSwitch ? (
            <Switch checked={enabled} disabled={pending} onCheckedChange={onEnabledChange} aria-label={enabledAriaLabel} />
          ) : null}
        </div>
      </div>
      {enabled && models ? (
        <Accordion type="single" collapsible className="mt-1">
          <AccordionItem value="models" className="border-none">
            <AccordionTrigger className="py-2 hover:no-underline">
              <span className="flex items-baseline gap-2 text-left">
                <span>{modelsLabel}</span>
                {modelsSummary ? <span className="text-xs font-normal text-muted-foreground">{modelsSummary}</span> : null}
              </span>
            </AccordionTrigger>
            <AccordionContent className="space-y-3 pb-1">{models}</AccordionContent>
          </AccordionItem>
        </Accordion>
      ) : null}
    </div>
  )
}
