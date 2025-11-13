"use client"

import { useState, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Loader2, Search, CheckCircle2, ExternalLink, Plus, FileText, Folder, ArrowLeft, RefreshCw } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { FileIcon, defaultStyles } from "react-file-icon"
import { createClient } from "@/lib/supabase/client"

interface GoogleDriveFile {
  id: string
  name: string
  mimeType: string
  modifiedTime?: string
  size?: string
  webViewLink?: string
  thumbnailLink?: string
}

interface GoogleDriveSearchProps {
  accessToken: string
  onDocumentsSelected?: (documents: Array<{
    title: string
    identifier: string
    type: string
    date?: string
    description?: string
    url?: string
  }>) => void
  showSelection?: boolean
}

export function GoogleDriveSearch({ accessToken, onDocumentsSelected, showSelection = true }: GoogleDriveSearchProps) {
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(false)
  const [files, setFiles] = useState<GoogleDriveFile[]>([])
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [hasSearched, setHasSearched] = useState(false)
  const [currentFolderId, setCurrentFolderId] = useState<string>("root")
  const [folderStack, setFolderStack] = useState<Array<{ id: string; name: string }>>([])
  const [nextPageToken, setNextPageToken] = useState<string | null>(null)
  const [isReconnecting, setIsReconnecting] = useState(false)
  
  const isAuthError = error?.includes("AUTH_REQUIRED") || error?.includes("Authentication failed")

  const formatFileSize = (bytes?: string) => {
    if (!bytes) return ""
    const size = parseInt(bytes, 10)
    if (size < 1024) return `${size} B`
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
    return `${(size / (1024 * 1024)).toFixed(1)} MB`
  }

  const getFileType = (mimeType: string) => {
    if (mimeType.includes("folder")) return "Folder"
    if (mimeType.includes("pdf")) return "PDF"
    if (mimeType.includes("word") || mimeType.includes("document")) return "Word"
    if (mimeType.includes("spreadsheet") || mimeType.includes("sheet")) return "Spreadsheet"
    if (mimeType.includes("presentation") || mimeType.includes("slides")) return "Presentation"
    if (mimeType.includes("text")) return "Text"
    if (mimeType.includes("image")) return "Image"
    return "File"
  }

  const handleListFiles = async (folderId: string = currentFolderId, pageToken?: string) => {
    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({
        action: "list",
        accessToken,
        folderId,
        ...(pageToken && { pageToken }),
      })

      const response = await fetch(`/api/google-drive?${params}`)
      const data = await response.json()

      if (!response.ok) {
        if (response.status === 401 || data.code === "AUTH_ERROR") {
          const errorMsg = data.error || "Authentication failed. Please reconnect your Google account in the Sources settings."
          throw new Error(errorMsg)
        }
        throw new Error(data.error || "Failed to list files")
      }

      if (pageToken) {
        // Append to existing files for pagination
        setFiles((prev) => [...prev, ...(data.files || [])])
      } else {
        setFiles(data.files || [])
      }
      setNextPageToken(data.nextPageToken || null)
      setHasSearched(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = async () => {
    if (!query.trim()) {
      setError("Please enter a search query")
      return
    }

    setLoading(true)
    setError(null)
    setFiles([])
    setSelectedFiles(new Set())
    setNextPageToken(null)

    try {
      const params = new URLSearchParams({
        action: "search",
        accessToken,
        query: query.trim(),
      })

      const response = await fetch(`/api/google-drive?${params}`)
      const data = await response.json()

      if (!response.ok) {
        if (response.status === 401 || data.code === "AUTH_ERROR") {
          const errorMsg = data.error || "Authentication failed. Please reconnect your Google account in the Sources settings."
          throw new Error(errorMsg)
        }
        throw new Error(data.error || "Search failed")
      }

      setFiles(data.files || [])
      setNextPageToken(data.nextPageToken || null)
      setHasSearched(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setLoading(false)
    }
  }

  const handleFolderClick = (folderId: string, folderName: string) => {
    setFolderStack((prev) => [...prev, { id: currentFolderId, name: folderStack.length === 0 ? "My Drive" : "..." }])
    setCurrentFolderId(folderId)
    setFiles([])
    setSelectedFiles(new Set())
    handleListFiles(folderId)
  }

  const handleBack = () => {
    if (folderStack.length > 0) {
      const previousFolder = folderStack[folderStack.length - 1]
      setFolderStack((prev) => prev.slice(0, -1))
      setCurrentFolderId(previousFolder.id)
      setFiles([])
      setSelectedFiles(new Set())
      handleListFiles(previousFolder.id)
    }
  }

  const toggleFileSelection = (fileId: string) => {
    if (!showSelection) return

    const newSelected = new Set(selectedFiles)
    if (newSelected.has(fileId)) {
      newSelected.delete(fileId)
    } else {
      newSelected.add(fileId)
    }
    setSelectedFiles(newSelected)
  }

  const handleAddSelected = () => {
    if (onDocumentsSelected && selectedFiles.size > 0) {
      const documentsToAdd = Array.from(selectedFiles)
        .map((fileId) => {
          const file = files.find((f) => f.id === fileId)
          if (!file || file.mimeType.includes("folder")) return null
          return {
            title: file.name,
            identifier: file.id,
            type: getFileType(file.mimeType),
            date: file.modifiedTime,
            description: `${getFileType(file.mimeType)} • ${formatFileSize(file.size)}`,
            url: file.webViewLink,
          }
        })
        .filter((doc): doc is NonNullable<typeof doc> => doc !== null)

      onDocumentsSelected(documentsToAdd)
    }
  }

  const loadMore = () => {
    if (nextPageToken && !loading) {
      handleListFiles(currentFolderId, nextPageToken)
    }
  }

  // Load root folder on mount
  useEffect(() => {
    if (!hasSearched && currentFolderId === "root") {
      handleListFiles("root")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        {/* Breadcrumb navigation */}
        {folderStack.length > 0 && (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleBack}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <span className="text-sm text-muted-foreground">
              {folderStack.map((f) => f.name).join(" / ")} / Current Folder
            </span>
          </div>
        )}

        <div className="flex gap-2">
          <div className="flex-1 space-y-2">
            <Label htmlFor="search-query">Search Files</Label>
            <div className="flex gap-2">
              <Input
                id="search-query"
                placeholder="Search for files..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !loading && handleSearch()}
                className="flex-1"
              />
              <Button onClick={handleSearch} disabled={loading || !query.trim()}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Searching...
                  </>
                ) : (
                  <>
                    <Search className="mr-2 h-4 w-4" />
                    Search
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        {!query && (
          <div className="flex gap-2">
            <Button onClick={() => handleListFiles(currentFolderId)} disabled={loading} variant="outline">
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  <Folder className="mr-2 h-4 w-4" />
                  Refresh Folder
                </>
              )}
            </Button>
          </div>
        )}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <span className="flex-1">{error}</span>
            {isAuthError && (
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  setIsReconnecting(true)
                  const supabase = createClient()
                  try {
                    const { error: oauthError } = await supabase.auth.signInWithOAuth({
                      provider: "google",
                      options: {
                        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(window.location.pathname)}`,
                        queryParams: {
                          access_type: "offline",
                          prompt: "consent",
                          scope: "openid email profile https://www.googleapis.com/auth/drive.readonly",
                        },
                      },
                    })
                    if (oauthError) throw oauthError
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Failed to reconnect")
                    setIsReconnecting(false)
                  }
                }}
                disabled={isReconnecting}
                className="shrink-0"
              >
                {isReconnecting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Reconnect Google
                  </>
                )}
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}

      {loading && files.length === 0 && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!loading && files.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">
              Files ({files.length})
              {showSelection && selectedFiles.size > 0 && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  - {selectedFiles.size} selected
                </span>
              )}
            </h3>
            {showSelection && selectedFiles.size > 0 && onDocumentsSelected && (
              <Button onClick={handleAddSelected} size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Add Selected ({selectedFiles.size})
              </Button>
            )}
          </div>
          <div className="space-y-3 max-h-[500px] overflow-y-auto">
            {files.map((file) => {
              const isFolder = file.mimeType.includes("folder")
              const isSelected = showSelection && selectedFiles.has(file.id)
              const canSelect = showSelection && !isFolder

              return (
                <Card
                  key={file.id}
                  className={`transition-all ${canSelect ? "cursor-pointer hover:shadow-md" : ""} ${
                    isSelected ? "border-2 border-primary" : ""
                  }`}
                  onClick={() => {
                    if (isFolder) {
                      handleFolderClick(file.id, file.name)
                    } else if (canSelect) {
                      toggleFileSelection(file.id)
                    }
                  }}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start gap-4">
                      {isFolder ? (
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                          <Folder className="h-5 w-5 text-primary" />
                        </div>
                      ) : getFileType(file.mimeType) === "PDF" ? (
                        <div className="w-10 h-10 shrink-0 flex items-center overflow-hidden [&>svg]:w-full [&>svg]:h-full [&>svg]:grayscale">
                          <FileIcon
                            extension="pdf"
                            {...(defaultStyles.pdf || {})}
                            label={false}
                            glyphColor="#fff"
                            color="#6b7280"
                          />
                        </div>
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                          <FileText className="h-5 w-5 text-primary" />
                        </div>
                      )}
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          {showSelection && isSelected && <CheckCircle2 className="h-5 w-5 text-green-600" />}
                          {getFileType(file.mimeType) !== "PDF" && <Badge variant="secondary">{getFileType(file.mimeType)}</Badge>}
                          {file.modifiedTime && (
                            <span className="text-xs text-muted-foreground">
                              {new Date(file.modifiedTime).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                        <CardTitle className="text-base">{file.name}</CardTitle>
                        {file.size && (
                          <CardDescription className="mt-1">{formatFileSize(file.size)}</CardDescription>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  {file.webViewLink && (
                    <CardContent className="pt-0">
                      <a
                        href={file.webViewLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline inline-flex items-center gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Open in Google Drive
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </CardContent>
                  )}
                </Card>
              )
            })}
          </div>
          {nextPageToken && (
            <div className="flex justify-center">
              <Button onClick={loadMore} disabled={loading} variant="outline">
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading...
                  </>
                ) : (
                  "Load More"
                )}
              </Button>
            </div>
          )}
        </div>
      )}

      {!loading && !error && files.length === 0 && hasSearched && (
        <div className="text-center py-8 text-muted-foreground">
          {query ? "No files found. Try a different search query." : "No files in this folder."}
        </div>
      )}
    </div>
  )
}
