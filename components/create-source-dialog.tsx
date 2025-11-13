"use client"

import type React from "react"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { createSource } from "@/lib/actions/source"
import { getGoogleTokens } from "@/lib/actions/auth"
import { createClient } from "@/lib/supabase/client"
import { Plus, CheckCircle2 } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"

interface CreateSourceDialogProps {
  workspaceId: string
  onSuccess?: () => void
  existingSources?: Array<{
    id: string
    type: string
  }>
}

const SOURCE_TYPES = [
  { value: "google_drive", label: "Google Drive", description: "Sync documents from Google Drive" },
  { value: "overheid_nl", label: "Overheid.nl", description: "Search Dutch government publications and regulations" },
].sort((a, b) => a.label.localeCompare(b.label)) as const

export function CreateSourceDialog({ workspaceId, onSuccess, existingSources = [] }: CreateSourceDialogProps) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [type, setType] = useState<string>("")
  const [apiKey, setApiKey] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [hasGoogleToken, setHasGoogleToken] = useState(false)
  const [checkingToken, setCheckingToken] = useState(false)

  const checkGoogleTokens = useCallback(async () => {
    setCheckingToken(true)
    setError(null)
    try {
      const tokens = await getGoogleTokens()
      console.log("[CreateSource] getGoogleTokens result:", { 
        hasToken: !!tokens.access_token, 
        hasError: !!tokens.error,
        error: tokens.error 
      })
      
      if (tokens.access_token && !tokens.error) {
        // Validate the token by testing it
        try {
          const testParams = new URLSearchParams({
            action: "list",
            accessToken: tokens.access_token,
            folderId: "root",
          })
          console.log("[CreateSource] Validating token with Google Drive API...")
          const testResponse = await fetch(`/api/google-drive?${testParams}`)
          
          if (testResponse.ok) {
            console.log("[CreateSource] Token validation successful")
            setHasGoogleToken(true)
            setApiKey(tokens.access_token)
          } else {
            // Token exists but is invalid/expired
            let testData: any = {}
            try {
              const responseText = await testResponse.text()
              if (responseText) {
                testData = JSON.parse(responseText)
              }
            } catch (parseError) {
              console.warn("[CreateSource] Failed to parse error response:", parseError)
            }
            
            console.error("[CreateSource] Token validation failed:", {
              status: testResponse.status,
              statusText: testResponse.statusText,
              error: testData.error || testResponse.statusText || "Unknown error",
              code: testData.code,
              message: testData.message,
            })
            
            if (testResponse.status === 401 || testData.code === "AUTH_ERROR" || testData.error?.includes("authentication") || testData.error?.includes("token")) {
              setHasGoogleToken(false)
              setApiKey("")
              setError("Google token expired. Please reconnect your Google account.")
            } else {
              // Other error, but token might still be valid
              console.warn("[CreateSource] Non-auth error, assuming token is valid")
              setHasGoogleToken(true)
              setApiKey(tokens.access_token)
            }
          }
        } catch (testErr) {
          // If test fails, still set the token but warn user
          console.error("[CreateSource] Token validation exception:", testErr)
          setHasGoogleToken(true)
          setApiKey(tokens.access_token)
          console.warn("Could not validate Google token:", testErr)
        }
      } else {
        console.log("[CreateSource] No tokens found or error:", tokens.error)
        setHasGoogleToken(false)
        setApiKey("")
      }
    } catch (err) {
      console.error("[CreateSource] Error checking Google tokens:", err)
      setHasGoogleToken(false)
      setApiKey("")
    } finally {
      setCheckingToken(false)
    }
  }, [])

  // Check for Google tokens when Google Drive is selected or dialog opens
  useEffect(() => {
    if (type === "google_drive") {
      checkGoogleTokens()
    } else {
      setHasGoogleToken(false)
      setApiKey("")
    }
  }, [type, open, checkGoogleTokens])

  const handleGoogleConnect = async () => {
    const supabase = createClient()
    try {
      const redirectUrl = `${window.location.origin}/auth/callback?next=${encodeURIComponent(`/workspaces/${workspaceId}/sources`)}`
      console.log("[CreateSource] Initiating Google OAuth with redirect:", redirectUrl)
      
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
        console.error("[CreateSource] OAuth error:", error)
        throw error
      }
    } catch (err) {
      console.error("[CreateSource] Failed to connect with Google:", err)
      setError(err instanceof Error ? err.message : "Failed to connect with Google")
    }
  }

  const handleTypeChange = (newType: string) => {
    setType(newType)
    if (newType === "overheid_nl") {
      setName("Overheid.nl")
    } else if (newType === "google_drive") {
      setName("Google Drive")
    } else {
      setName("")
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    // Check if source type is already added
    const isAlreadyAdded = existingSources.some((s) => s.type === type)
    if (isAlreadyAdded) {
      setError("This source type has already been added")
      setIsLoading(false)
      return
    }

    let config: Record<string, any> = {}

    if (type === "overheid_nl") {
      // Overheid.nl doesn't need a query in config - users search when adding documents
      config = {}
    } else if (type === "google_drive") {
      // Validate Google Drive token before creating source
      if (!apiKey) {
        setError("Google Drive access token is required. Please connect your Google account.")
        setIsLoading(false)
        return
      }

      // Test the token by making a simple API call
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
            setError("Invalid or expired access token. Please reconnect your Google account or refresh your token.")
            setIsLoading(false)
            return
          }
          throw new Error(testData.error || "Failed to validate Google Drive connection")
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to validate Google Drive connection. Please check your token.")
        setIsLoading(false)
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

    const sourceName = type === "overheid_nl" ? "Overheid.nl" : name
    const result = await createSource(workspaceId, sourceName, type as any, config)

    if (result.error) {
      setError(result.error)
      setIsLoading(false)
    } else {
      setOpen(false)
      setName("")
      setType("")
      setApiKey("")
      setIsLoading(false)
      onSuccess?.()
    }
  }

  const selectedSource = SOURCE_TYPES.find((c) => c.value === type)

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen)
    if (!newOpen) {
      // Reset form when dialog closes
      setName("")
      setType("")
      setApiKey("")
      setError(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add Source
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add a new source</DialogTitle>
            <DialogDescription>Connect external document sources to your workspace</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="source-type">Source Type</Label>
              <Select value={type} onValueChange={handleTypeChange} required>
                <SelectTrigger id="source-type" className="[&_[data-slot=select-value]_span[aria-hidden='true']]:hidden">
                  <SelectValue placeholder="Select Source" />
                </SelectTrigger>
                <SelectContent className="min-w-[var(--radix-select-trigger-width)]">
                  {SOURCE_TYPES.map((source) => {
                    const isDisabled = existingSources.some((s) => s.type === source.value)
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
                            {isDisabled ? "Already added" : source.description}
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
                  <Label htmlFor="source-name">Source Name</Label>
                  <Input
                    id="source-name"
                    placeholder={`My ${selectedSource?.label} Source`}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
                )}
                {type === "overheid_nl" ? (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      Overheid.nl source allows you to search and add Dutch government publications on demand.
                      No configuration needed - you'll search when adding documents.
                    </p>
                  </div>
                ) : type === "google_drive" ? (
                  <div className="space-y-3">
                    {checkingToken ? (
                      <div className="text-sm text-muted-foreground">Checking for Google account...</div>
                    ) : hasGoogleToken ? (
                      <Alert>
                        <CheckCircle2 className="h-4 w-4" />
                        <AlertDescription>
                          Google account connected
                        </AlertDescription>
                      </Alert>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        onClick={handleGoogleConnect}
                      >
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
                        Connect with Google
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="api-key">API Key / Token</Label>
                    <Input
                      id="api-key"
                      type="password"
                      placeholder="Enter your API key or access token"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      required
                    />
                    <p className="text-xs text-muted-foreground">This will be encrypted and stored securely</p>
                  </div>
                )}
              </>
            )}

            {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isLoading}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLoading || !type || (type !== "overheid_nl" && (!name || (!hasGoogleToken && !apiKey)))}
            >
              {isLoading ? "Connecting..." : "Add Source"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
