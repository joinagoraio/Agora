"use client"

import { useState, useTransition } from "react"

import Image from "next/image"

import { updateSpaceScope, enhanceScopeText } from "@/lib/actions/space"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Wand2, Save, Loader2 } from "lucide-react"

type SpaceScope = {
  summary?: string | null
  description?: string | null
  timeframe?: string | null
}

interface SpaceScopeEditorProps {
  spaceId: string
  spaceName: string
  logoUrl?: string | null
  spaceType?: string | null
  visibility?: string | null
  jurisdiction?: Record<string, any> | null
  initialScope: SpaceScope
}

export function SpaceScopeEditor({
  spaceId,
  spaceName,
  logoUrl,
  spaceType,
  visibility,
  jurisdiction,
  initialScope,
}: SpaceScopeEditorProps) {
  const [summary, setSummary] = useState(initialScope.summary ?? "")
  const [description, setDescription] = useState(initialScope.description ?? "")
  const [timeframe, setTimeframe] = useState(initialScope.timeframe ?? "")
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isSaving, startSaving] = useTransition()
  const [isEnhancing, startEnhancing] = useTransition()

  const handleSave = () => {
    setError(null)
    setSuccess(null)
    startSaving(async () => {
      const result = await updateSpaceScope(spaceId, {
        summary,
        description,
        timeframe,
      })

      if (result.error) {
        setError(result.error)
      } else {
        setSuccess("Scope updated")
      }
    })
  }

  const handleEnhance = () => {
    if (!description || description.trim().length === 0) {
      setError("Add a description before enhancing with AI.")
      return
    }

    setError(null)
    setSuccess(null)
    startEnhancing(async () => {
      const result = await enhanceScopeText(description)

      if (result.error) {
        setError(result.error)
      } else if (result.enhanced) {
        setDescription(result.enhanced)
      }
    })
  }

  const jurisdictionLabel =
    jurisdiction && Object.keys(jurisdiction).length > 0
      ? Object.values(jurisdiction).join(" • ")
      : undefined

  return (
    <Card className="overflow-hidden border-border/70 bg-card/80 shadow-sm">
      <CardHeader className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4">
          {logoUrl ? (
            <Image src={logoUrl} alt={`${spaceName} logo`} width={64} height={64} className="h-16 w-16 rounded-lg object-cover" />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-primary/10 text-lg font-semibold text-primary">
              {spaceName.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div>
            <CardTitle className="text-2xl font-semibold">{spaceName}</CardTitle>
            <CardDescription className="flex flex-wrap items-center gap-2 pt-2 text-xs uppercase tracking-widest text-muted-foreground">
              {spaceType && <Badge variant="outline">{spaceType}</Badge>}
              {visibility && <Badge variant="outline">{visibility}</Badge>}
              {timeframe && timeframe.trim().length > 0 && <Badge variant="secondary">{timeframe}</Badge>}
              {jurisdictionLabel && <span className="text-muted-foreground">{jurisdictionLabel}</span>}
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="space-summary">Scope summary</Label>
            <Textarea
              id="space-summary"
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              placeholder="High-level mission statement that appears at the top of the space."
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="space-description" className="flex items-center justify-between">
              <span>Detailed description</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleEnhance}
                disabled={isEnhancing}
                className="gap-2 text-primary"
              >
                {isEnhancing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Enhancing…
                  </>
                ) : (
                  <>
                    <Wand2 className="h-4 w-4" />
                    Enhance with AI
                  </>
                )}
              </Button>
            </Label>
            <Textarea
              id="space-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Describe the policy mandate, stakeholders, datasets, or directives that define this scope."
              rows={8}
            />
            <p className="text-xs text-muted-foreground">
              This description is inherited by every workspace in the space and is used as context for the assistant.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="space-timeframe">Timeframe / programme window</Label>
            <Input
              id="space-timeframe"
              value={timeframe}
              onChange={(event) => setTimeframe(event.target.value)}
              placeholder="e.g., 2024 – 2027"
            />
          </div>
        </div>

        {(error || success) && (
          <div
            className={`rounded-md border px-3 py-2 text-sm ${
              error ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700"
            }`}
          >
            {error || success}
          </div>
        )}

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save scope
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
