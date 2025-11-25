"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Loader2, CheckCircle2, FileText, ExternalLink, Sparkles, Edit2, Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ensureOverheidNLSource, addDocumentsFromSource } from "@/lib/actions/document"
import { fetchCsrfToken } from "@/lib/utils/csrf"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

interface AddOverheidDocumentsDialogProps {
  workspaceId?: string
  spaceId?: string
  workspaceLocation?: string | null
  workspaceContext?: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
  onDocumentsAdded?: (documents: any[]) => void
}

interface SearchResult {
  title: string
  identifier: string
  type: string
  date?: string
  description?: string
  url?: string
  source?: string
  relevanceScore?: number
}

export function AddOverheidDocumentsDialog({
  workspaceId,
  spaceId,
  workspaceLocation,
  workspaceContext,
  open,
  onOpenChange,
  onSuccess,
  onDocumentsAdded,
}: AddOverheidDocumentsDialogProps) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const router = useRouter()
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<SearchResult[]>([])
  const [selectedResults, setSelectedResults] = useState<Set<number>>(new Set())
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [hasSearched, setHasSearched] = useState(false)
  const [searchQueries, setSearchQueries] = useState<string[]>([])
  const [editableQueries, setEditableQueries] = useState<string[]>([])
  const [showQueryEditor, setShowQueryEditor] = useState(false)
  const [focusLastQuery, setFocusLastQuery] = useState(false)
  const queryInputRefs = useRef<(HTMLInputElement | null)[]>([])
  const hasResults = results.length > 0
  const dialogWidthClass = hasResults ? "sm:!max-w-[1400px]" : "sm:!max-w-[700px]"

  const handleIntelligentSearch = useCallback(async () => {
    if (!workspaceContext || !workspaceContext.trim()) {
      setError("Scope is required for intelligent search")
      return
    }

    setSearching(true)
    setError(null)
    setResults([])
    setSelectedResults(new Set())
    setHasSearched(true)
    // Clear previous queries to show loading state
    setSearchQueries([])

    try {
      const csrfToken = await fetchCsrfToken()
      if (!csrfToken) {
        setError("Could not verify your session. Refresh and try again.")
        setSearching(false)
        return
      }

      const response = await fetch("/api/overheid-intelligent-search", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({
          context: workspaceContext,
          location: workspaceLocation || undefined,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Search failed")
      }

      setResults(data.results || [])
      const queries = data.metadata?.queries || []
      setSearchQueries(queries)
      setEditableQueries(queries)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to search documents")
    } finally {
      setSearching(false)
    }
  }, [workspaceContext, workspaceLocation])

  // Auto-search when dialog opens
  useEffect(() => {
    if (open && workspaceContext && !hasSearched) {
      handleIntelligentSearch()
    }
  }, [open, workspaceContext, hasSearched, handleIntelligentSearch])

  // Focus newly added query input
  useEffect(() => {
    if (focusLastQuery && editableQueries.length > 0) {
      const lastIndex = editableQueries.length - 1
      queryInputRefs.current[lastIndex]?.focus()
      setFocusLastQuery(false)
    }
  }, [editableQueries, focusLastQuery])

  const toggleResultSelection = (index: number) => {
    const newSelected = new Set(selectedResults)
    if (newSelected.has(index)) {
      newSelected.delete(index)
    } else {
      newSelected.add(index)
    }
    setSelectedResults(newSelected)
  }

  const handleAddSelected = async () => {
    if (selectedResults.size === 0) {
      return
    }

    const documentsToAdd = Array.from(selectedResults).map((index) => results[index])
    await handleDocumentsSelected(documentsToAdd)
  }

  const handleDocumentsSelected = async (documents: SearchResult[]) => {
    if (documents.length === 0) {
      return
    }

    if (!workspaceId && !spaceId) {
      setError("Select a destination before adding documents.")
      return
    }

    setAdding(true)
    setError(null)
    setSuccess(null)

    try {
      if (spaceId && !workspaceId) {
        const { addedCount, addedItems } = await addDocumentsToSpace(spaceId, documents)
        setSuccess(`Successfully added ${addedCount} document(s)`)
        toast.success("Overheid.nl documents added", {
          description: `${addedCount} publication${addedCount === 1 ? "" : "s"} imported into this space.`,
        })
        router.refresh()
        if (addedItems.length > 0) {
          onDocumentsAdded?.(addedItems)
        }
        onSuccess?.()
      } else if (workspaceId) {
        // Ensure overheid_nl source exists
        const sourceResult = await ensureOverheidNLSource(workspaceId)
        if (sourceResult.error || !sourceResult.data) {
          const description = sourceResult.error || "Failed to create Overheid.nl source"
          setError(description)
          toast.error("Cannot add documents", { description })
          setAdding(false)
          return
        }

        // Add documents using the source
        const result = await addDocumentsFromSource(
          workspaceId,
          sourceResult.data.id,
          documents,
          "public" // Overheid.nl documents are public by default
        )

        if (result.error) {
          setError(result.error)
          toast.error("Failed to add documents", { description: result.error })
        } else if (result.addedCount === 0 && documents.length > 0) {
          const message = "Failed to add documents. Please check the console for details or try again."
          setError(message)
          toast.error("No documents added", { description: message })
        } else {
          const addedCount = result.addedCount || documents.length
          setSuccess(`Successfully added ${addedCount} document(s)`)
          toast.success("Overheid.nl documents added", {
            description: `${addedCount} publication${addedCount === 1 ? "" : "s"} imported.`,
          })
          router.refresh()
          onSuccess?.()
          
          // Dispatch custom event to notify chat interface and other components
          window.dispatchEvent(new CustomEvent("documentUploaded", { 
            detail: { workspaceId } 
          }))
        }
      }

      setTimeout(() => {
        onOpenChange(false)
        setSuccess(null)
      }, 2000)
    } catch (err) {
      const description = err instanceof Error ? err.message : "Failed to add documents"
      setError(description)
      toast.error("Failed to add documents", { description })
    } finally {
      setAdding(false)
    }
  }

  const addDocumentsToSpace = async (targetSpaceId: string, documents: SearchResult[]) => {
    const csrfToken = await fetchCsrfToken()
    if (!csrfToken) {
      throw new Error("Could not verify your session. Refresh and try again.")
    }

    let addedCount = 0
    const addedItems: any[] = []

    for (const document of documents) {
      const response = await fetch(`/api/spaces/${targetSpaceId}/import-overheid`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        credentials: "include",
        body: JSON.stringify({
          title: document.title,
          identifier: document.identifier,
          type: document.type,
          date: document.date,
          description: document.description,
          url: document.url,
          classification: "public",
        }),
      })

      const responseText = await response.text()
      let payload: any = null
      if (responseText) {
        try {
          payload = JSON.parse(responseText)
        } catch {
          payload = { raw: responseText }
        }
      }

      if (!response.ok || payload?.error) {
        const message = payload?.error || payload?.raw || "Failed to add document to the space."
        throw new Error(message)
      }

      if (payload?.data) {
        addedItems.push(payload.data)
      }

      addedCount += 1
    }

    return { addedCount, addedItems }
  }

  const handleClose = (open: boolean) => {
    onOpenChange(open)
    if (!open) {
      // Reset state when closing
      setError(null)
      setSuccess(null)
      setResults([])
      setSelectedResults(new Set())
      setHasSearched(false)
      setSearchQueries([])
      setEditableQueries([])
      setShowQueryEditor(false)
    }
  }

  const handleSearchWithCustomQueries = async () => {
    const validQueries = editableQueries.filter(q => q.trim())
    if (validQueries.length === 0) {
      setError("Please enter at least one search query")
      return
    }

    setSearching(true)
    setError(null)
    setResults([])
    setSelectedResults(new Set())
    // Show the queries being used during search
    setSearchQueries(validQueries)

    try {
      const csrfToken = await fetchCsrfToken()
      if (!csrfToken) {
        setError("Could not verify your session. Refresh and try again.")
        setSearching(false)
        return
      }

      const response = await fetch("/api/overheid-intelligent-search", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({
          context: workspaceContext,
          location: workspaceLocation || undefined,
          customQueries: validQueries,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Search failed")
      }

      setResults(data.results || [])
      const queries = data.metadata?.queries || validQueries
      setSearchQueries(queries)
      setEditableQueries(queries)
      setShowQueryEditor(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to search documents")
    } finally {
      setSearching(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className={`!max-w-[95vw] ${dialogWidthClass} w-full max-h-[90vh] flex flex-col p-0 overflow-hidden`}>
        <DialogHeader className="px-6 pt-6 pb-4 flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Add Documents from Overheid.nl
          </DialogTitle>
          <DialogDescription>
            AI-powered search finds relevant Dutch government publications based on your workspace scope.
            {workspaceLocation && (
              <span className="block mt-1 text-xs">
                Location: {workspaceLocation}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6">
          <div className="space-y-6 pb-4">
            {searching && (
              <div className="flex flex-col items-center justify-center py-12 space-y-4">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <div className="text-center space-y-2">
                  <p className="text-sm font-medium">Searching multiple endpoints and ranking results by relevance...</p>
                  {searchQueries.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <p className="text-xs text-muted-foreground font-medium">Search queries being used:</p>
                      <div className="flex flex-wrap gap-2 justify-center">
                        {searchQueries.map((query, idx) => (
                          <Badge key={idx} variant="outline" className="text-xs">
                            {query}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {!searching && results.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">
                      Found {results.length} relevant document{results.length !== 1 ? "s" : ""} (ordered by relevance)
                    </p>
                    {searchQueries.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 items-center">
                        <span className="text-xs text-muted-foreground">Queries:</span>
                        {searchQueries.map((query, idx) => (
                          <Badge key={idx} variant="outline" className="text-xs">
                            {query}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  {selectedResults.size > 0 && (
                    <Button onClick={handleAddSelected} disabled={adding}>
                      {adding ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Adding...
                        </>
                      ) : (
                        <>
                          Add {selectedResults.size} Selected
                        </>
                      )}
                    </Button>
                  )}
                </div>

                <div className="space-y-3 max-h-[500px] overflow-y-auto">
                  {results.map((result, index) => {
                    const isSelected = selectedResults.has(index)
                    return (
                      <Card
                        key={`${result.identifier}-${index}`}
                        className={`transition-all cursor-pointer hover:shadow-md ${
                          isSelected ? "border-2 border-primary" : ""
                        }`}
                        onClick={() => toggleResultSelection(index)}
                      >
                        <CardHeader className="pb-3">
                          <div className="flex items-start gap-3">
                            <FileText className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-2 flex-wrap">
                                {isSelected && <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />}
                                {result.type && (
                                  <Badge variant="secondary" className="text-xs">
                                    {result.type}
                                  </Badge>
                                )}
                                {result.source && (
                                  <Badge variant="outline" className="text-xs">
                                    {result.source}
                                  </Badge>
                                )}
                                {result.relevanceScore !== undefined && (
                                  <Badge variant="outline" className="text-xs">
                                    {(result.relevanceScore * 100).toFixed(0)}% match
                                  </Badge>
                                )}
                                {result.date && (
                                  <span className="text-xs text-muted-foreground">{result.date}</span>
                                )}
                              </div>
                              <CardTitle className="text-base leading-tight">{result.title}</CardTitle>
                              {result.identifier && (
                                <CardDescription className="mt-1 text-xs">
                                  ID: {result.identifier}
                                </CardDescription>
                              )}
                              {result.description && (
                                <CardDescription className="mt-2 line-clamp-2">
                                  {result.description}
                                </CardDescription>
                              )}
                            </div>
                          </div>
                        </CardHeader>
                        {result.url && (
                          <CardContent className="pt-0">
                            <a
                              href={result.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-xs text-primary hover:underline flex items-center gap-1"
                            >
                              <ExternalLink className="h-3 w-3" />
                              View source
                            </a>
                          </CardContent>
                        )}
                      </Card>
                    )
                  })}
                </div>
              </div>
            )}

            {!searching && !error && results.length === 0 && hasSearched && (
              <div className="space-y-4 py-8">
                <div className="text-center space-y-2">
                  <p className="text-sm text-muted-foreground">
                    No relevant documents found with the current search queries.
                  </p>
                  {searchQueries.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <p className="text-xs text-muted-foreground font-medium">Queries used:</p>
                      <div className="flex flex-wrap gap-2 justify-center">
                        {searchQueries.map((query, idx) => (
                          <Badge key={idx} variant="outline" className="text-xs">
                            {query}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {!showQueryEditor ? (
                  <div className="flex justify-center">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowQueryEditor(true)}
                      className="text-xs"
                    >
                      <Edit2 className="mr-2 h-3 w-3" />
                      Adjust Search Queries
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4 p-4 border rounded-lg bg-muted/50">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Edit Search Queries</Label>
                      <p className="text-xs text-muted-foreground">
                        Modify the search queries to find different documents. Each query will be searched across all endpoints.
                      </p>
                    </div>
                    <div className="space-y-2">
                      {editableQueries.map((query, idx) => (
                        <div key={idx} className="flex gap-2">
                          <Input
                            ref={(el) => {
                              queryInputRefs.current[idx] = el
                            }}
                            value={query}
                            onChange={(e) => {
                              const newQueries = [...editableQueries]
                              newQueries[idx] = e.target.value
                              setEditableQueries(newQueries)
                            }}
                            placeholder=""
                            className="text-sm bg-white"
                          />
                          {editableQueries.length > 1 && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                const newQueries = editableQueries.filter((_, i) => i !== idx)
                                setEditableQueries(newQueries)
                                queryInputRefs.current = queryInputRefs.current.filter((_, i) => i !== idx)
                              }}
                              className="h-10 w-10 shrink-0"
                            >
                              ×
                            </Button>
                          )}
                        </div>
                      ))}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditableQueries([...editableQueries, ""])
                          setFocusLastQuery(true)
                        }}
                        className="w-full text-xs"
                      >
                        + Add Query
                      </Button>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={handleSearchWithCustomQueries}
                        disabled={searching || editableQueries.every(q => !q.trim())}
                        className="flex-1"
                      >
                        <Search className="mr-2 h-4 w-4" />
                        Search with These Queries
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setShowQueryEditor(false)
                          setEditableQueries(searchQueries)
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
            {(error || success || adding) && (
              <div className="space-y-2">
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                {success && (
                  <Alert>
                    <AlertDescription>{success}</AlertDescription>
                  </Alert>
                )}

                {adding && (
                  <div className="flex items-center py-2">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mr-2" />
                    <span className="text-sm text-muted-foreground">Adding documents...</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

