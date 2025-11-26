"use client"

import { useState, useEffect, useCallback, useMemo, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog"
import { Card, CardContent } from "@/components/ui/card"
import { SourceCard } from "@/components/source-card"
import { getSourcesByWorkspace, createSource } from "@/lib/actions/source"
import { getGoogleTokens } from "@/lib/actions/auth"
import { createClient } from "@/lib/supabase/client"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Plug, Plus, CheckCircle2 } from "lucide-react"
import { useI18n } from "@/lib/i18n/use-i18n"
import { getBaseUrl } from "@/lib/utils/get-base-url"

interface ManageSourcesDialogProps {
  workspaceId: string
  trigger?: ReactNode
  initialSources?: Array<{
    id: string
    name: string
    type: string
    status: string
    last_sync_at: string | null
  }>
}

export function ManageSourcesDialog({
  workspaceId,
  trigger,
  initialSources = [],
}: ManageSourcesDialogProps) {
  const [open, setOpen] = useState(false)
  const [sources, setSources] = useState(initialSources)
  const [isLoading, setIsLoading] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  
  // Create source form state
  const [name, setName] = useState("")
  const [type, setType] = useState<string>("")
  const [apiKey, setApiKey] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [hasGoogleToken, setHasGoogleToken] = useState(false)
  const [checkingToken, setCheckingToken] = useState(false)
  const { t } = useI18n()

  const sourceTypes = useMemo(
    () =>
      [
        {
          value: "google_drive",
          label: t("workspace.sources.manage.typeOptions.googleDrive.label"),
          description: t("workspace.sources.manage.typeOptions.googleDrive.description"),
        },
        {
          value: "overheid_nl",
          label: t("workspace.sources.manage.typeOptions.overheid.label"),
          description: t("workspace.sources.manage.typeOptions.overheid.description"),
        },
      ].sort((a, b) => a.label.localeCompare(b.label)),
    [t],
  )

  // Filter out direct_upload sources - they shouldn't be displayed
  const displaySources = sources.filter((source) => source.type !== "direct_upload")

  const refreshSources = async () => {
    setIsLoading(true)
    try {
      const { data } = await getSourcesByWorkspace(workspaceId)
      if (data) {
        setSources(data)
      }
    } catch (error) {
      console.error("Failed to refresh sources:", error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (open) {
      refreshSources()
      setShowCreateForm(false)
      resetCreateForm()
    }
  }, [open, workspaceId])

  const resetCreateForm = () => {
    setName("")
    setType("")
    setApiKey("")
    setError(null)
    setHasGoogleToken(false)
    setCheckingToken(false)
  }

  const checkGoogleTokens = useCallback(async () => {
    setCheckingToken(true)
    setError(null)
    try {
      const tokens = await getGoogleTokens()
      if (tokens.access_token && !tokens.error) {
        try {
          const testParams = new URLSearchParams({
            action: "list",
            accessToken: tokens.access_token,
            folderId: "root",
          })
          const testResponse = await fetch(`/api/google-drive?${testParams}`)
          
          if (testResponse.ok) {
            setHasGoogleToken(true)
            setApiKey(tokens.access_token)
          } else {
            const testData = await testResponse.json().catch(() => ({}))
            if (testResponse.status === 401 || testData.code === "AUTH_ERROR") {
              setHasGoogleToken(false)
              setApiKey("")
              setError(t("workspace.sources.manage.errorTokenExpired"))
            } else {
              setHasGoogleToken(true)
              setApiKey(tokens.access_token)
            }
          }
        } catch (testErr) {
          setHasGoogleToken(true)
          setApiKey(tokens.access_token)
        }
      } else {
        setHasGoogleToken(false)
        setApiKey("")
      }
    } catch (err) {
      setHasGoogleToken(false)
      setApiKey("")
    } finally {
      setCheckingToken(false)
    }
  }, [])

  useEffect(() => {
    if (showCreateForm && type === "google_drive") {
      checkGoogleTokens()
    } else {
      setHasGoogleToken(false)
      setApiKey("")
    }
  }, [type, showCreateForm, checkGoogleTokens])

  const handleGoogleConnect = async () => {
    const supabase = createClient()
    try {
      const redirectUrl = `${getBaseUrl()}/auth/callback?next=${encodeURIComponent(window.location.pathname)}`
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: redirectUrl,
          queryParams: {
            access_type: "offline",
            prompt: "consent",
            scope: "openid email profile https://www.googleapis.com/auth/drive.readonly",
          },
        },
      })
      if (error) {
        throw error
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("workspace.sources.manage.errorGoogleConnect"))
    }
  }

  const handleTypeChange = (newType: string) => {
    setType(newType)
    const option = sourceTypes.find((opt) => opt.value === newType)
    if (newType === "overheid_nl" || newType === "google_drive") {
      setName(option?.label ?? "")
    } else {
      setName("")
    }
  }

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsCreating(true)
    setError(null)

    const isAlreadyAdded = displaySources.some((s) => s.type === type)
    if (isAlreadyAdded) {
      setError(t("workspace.sources.manage.errorDuplicate"))
      setIsCreating(false)
      return
    }

    let config: Record<string, any> = {}

    if (type === "overheid_nl") {
      config = {}
    } else if (type === "google_drive") {
      if (!apiKey) {
        setError(t("workspace.sources.manage.errorTokenMissing"))
        setIsCreating(false)
        return
      }

      try {
        const testParams = new URLSearchParams({
          action: "list",
          accessToken: apiKey,
          folderId: "root",
        })
        const testResponse = await fetch(`/api/google-drive?${testParams}`)
        const testData = await testResponse.json()

        if (!testResponse.ok) {
          if (testResponse.status === 401 || testData.code === "AUTH_ERROR") {
            setError(t("workspace.sources.manage.errorTokenExpired"))
            setIsCreating(false)
            return
          }
          throw new Error(testData.error || t("workspace.sources.manage.errorGoogleValidate"))
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : t("workspace.sources.manage.errorGoogleValidate"))
        setIsCreating(false)
        return
      }

      config = {
        access_token: apiKey,
      }
    } else {
      config = {
        api_key: apiKey,
      }
    }

    const option = sourceTypes.find((opt) => opt.value === type)
    const sourceName =
      type === "overheid_nl" ? option?.label ?? "Overheid.nl" : type === "google_drive" ? option?.label ?? "Google Drive" : name
    const result = await createSource(workspaceId, sourceName, type as any, config)

    if (result.error) {
      setError(result.error)
      setIsCreating(false)
    } else {
      resetCreateForm()
      setShowCreateForm(false)
      setIsCreating(false)
      refreshSources()
    }
  }

  const selectedSource = sourceTypes.find((c) => c.value === type)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {showCreateForm
              ? t("workspace.sources.manage.titleAdd")
              : t("workspace.sources.manage.titleManage")}
          </DialogTitle>
          <DialogDescription>
            {showCreateForm
              ? t("workspace.sources.manage.descriptionAdd")
              : t("workspace.sources.manage.descriptionManage")}
          </DialogDescription>
        </DialogHeader>

        {showCreateForm ? (
          <form onSubmit={handleCreateSubmit}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="source-type">{t("workspace.sources.manage.labelType")}</Label>
                <Select value={type} onValueChange={handleTypeChange} required>
                  <SelectTrigger id="source-type" className="[&_[data-slot=select-value]_span[aria-hidden='true']]:hidden">
                    <SelectValue placeholder={t("workspace.sources.manage.placeholderType")} />
                  </SelectTrigger>
                  <SelectContent className="min-w-[var(--radix-select-trigger-width)]">
                    {sourceTypes.map((source) => {
                      const isDisabled = displaySources.some((s) => s.type === source.value)
                      return (
                        <SelectItem
                          key={source.value}
                          value={source.value}
                          className="py-2.5 items-start"
                          textValue={source.label}
                          disabled={isDisabled}
                        >
                          <div className="flex flex-col gap-0.5 text-left w-full pr-6">
                            <span className="font-medium leading-tight">{source.label}</span>
                            <span className="text-xs text-muted-foreground leading-tight" aria-hidden="true">
                              {isDisabled ? t("workspace.sources.manage.alreadyAdded") : source.description}
                            </span>
                          </div>
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
              </div>

              {type && (
                <>
                  {type !== "overheid_nl" && (
                    <div className="space-y-2">
                      <Label htmlFor="source-name">{t("workspace.sources.manage.labelName")}</Label>
                      <Input
                        id="source-name"
                        placeholder={t("workspace.sources.manage.placeholderName", undefined, {
                          label: selectedSource?.label ?? "",
                        })}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                      />
                    </div>
                  )}
                  {type === "overheid_nl" ? (
                    <div className="space-y-2">
                      <p className="text-sm text-muted-foreground">
                        {t("workspace.sources.manage.overheidInfo")}
                      </p>
                    </div>
                  ) : type === "google_drive" ? (
                    <div className="space-y-3">
                      {checkingToken ? (
                        <div className="text-sm text-muted-foreground">
                          {t("workspace.sources.manage.googleChecking")}
                        </div>
                      ) : hasGoogleToken ? (
                        <Alert className="border-0 bg-green-50">
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          <AlertDescription>{t("workspace.sources.manage.googleConnected")}</AlertDescription>
                        </Alert>
                      ) : (
                        <Button type="button" variant="outline" className="w-full" onClick={handleGoogleConnect}>
                          <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                            <path
                              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                              fill="#4285F4"
                            />
                            <path
                              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                              fill="#34A853"
                            />
                            <path
                              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                              fill="#FBBC05"
                            />
                            <path
                              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                              fill="#EA4335"
                            />
                          </svg>
                          {t("workspace.sources.manage.googleButton")}
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Label htmlFor="api-key">{t("workspace.sources.manage.labelApiKey")}</Label>
                      <Input
                        id="api-key"
                        type="password"
                        placeholder={t("workspace.sources.manage.placeholderApiKey")}
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        required
                      />
                      <p className="text-xs text-muted-foreground">{t("workspace.sources.manage.apiKeyNote")}</p>
                    </div>
                  )}
                </>
              )}

              {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowCreateForm(false)
                  resetCreateForm()
                }}
                disabled={isCreating}
              >
                {t("workspace.sources.manage.cancel")}
              </Button>
              <Button
                type="submit"
                disabled={isCreating || !type || (type !== "overheid_nl" && (!name || (!hasGoogleToken && !apiKey)))}
              >
                {isCreating ? t("workspace.sources.manage.submitting") : t("workspace.sources.manage.submit")}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-end">
              <Button onClick={() => setShowCreateForm(true)}>
                <Plus className="mr-2 h-4 w-4" />
                {t("workspace.sources.manage.trigger")}
              </Button>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <p className="text-sm text-muted-foreground">{t("workspace.sources.manage.loading")}</p>
              </div>
            ) : displaySources && displaySources.length > 0 ? (
              <div className="overflow-hidden rounded-md border divide-y divide-border">
                {displaySources.map((source) => (
                  <SourceCard key={source.id} source={source} />
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Plug className="mb-4 h-12 w-12 text-muted-foreground" />
                  <h3 className="mb-2 text-lg font-semibold">{t("workspace.sources.manage.emptyTitle")}</h3>
                  <p className="mb-4 text-center text-sm text-muted-foreground">
                    {t("workspace.sources.manage.emptyDescription")}
                  </p>
                  <Button variant="outline" onClick={() => setShowCreateForm(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    {t("workspace.sources.manage.trigger")}
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

