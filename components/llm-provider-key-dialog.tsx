"use client"

import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  pending?: boolean
  hasKey: boolean
  keyValue: string
  onKeyChange: (value: string) => void
  keyPlaceholder: string
  keyLabel: string
  endpointValue?: string
  onEndpointChange?: (value: string) => void
  onEndpointBlur?: () => void
  endpointPlaceholder?: string
  extra?: ReactNode
  saveLabel: string
  clearLabel: string
  cancelLabel: string
  onSave: () => void
  onClear?: () => void
}

export function LlmProviderKeyDialog({
  open,
  onOpenChange,
  title,
  description,
  pending = false,
  hasKey,
  keyValue,
  onKeyChange,
  keyPlaceholder,
  keyLabel,
  endpointValue,
  onEndpointChange,
  onEndpointBlur,
  endpointPlaceholder,
  extra,
  saveLabel,
  clearLabel,
  cancelLabel,
  onSave,
  onClear,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="z-[70] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="llm-provider-key">{keyLabel}</Label>
            <Input
              id="llm-provider-key"
              type="password"
              value={keyValue}
              onChange={(event) => onKeyChange(event.target.value)}
              placeholder={keyPlaceholder}
              autoComplete="off"
            />
          </div>
          {onEndpointChange ? (
            <Input
              value={endpointValue || ""}
              onChange={(event) => onEndpointChange(event.target.value)}
              onBlur={() => onEndpointBlur?.()}
              placeholder={endpointPlaceholder}
            />
          ) : null}
          {extra}
        </div>
        <DialogFooter>
          {hasKey && onClear ? (
            <Button type="button" variant="outline" disabled={pending} onClick={onClear}>
              {clearLabel}
            </Button>
          ) : null}
          <Button type="button" variant="ghost" disabled={pending} onClick={() => onOpenChange(false)}>
            {cancelLabel}
          </Button>
          <Button type="button" disabled={pending || !keyValue.trim()} onClick={onSave}>
            {saveLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
