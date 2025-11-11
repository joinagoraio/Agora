"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Plus, Loader2 } from "lucide-react"
import { addDocumentsFromSource } from "@/lib/actions/document"
import { useRouter } from "next/navigation"
import { OverheidSearch } from "@/components/overheid-search"

interface AddFromSourceDialogProps {
  workspaceId: string
  sources: Array<{
    id: string
    name: string
    type: string
  }>
  trigger?: React.ReactNode
  onSuccess?: () => void
}

interface SearchResult {
  title: string
  identifier: string
  type: string
  date?: string
  description?: string
  url?: string
}

export function AddFromSourceDialog({
  workspaceId,
  sources,
  trigger,
  onSuccess,
}: AddFromSourceDialogProps) {
  const [open, setOpen] = useState(false)
  const [selectedSourceId, setSelectedSourceId] = useState<string>("")
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const router = useRouter()

  // Filter out direct_upload sources since they have their own upload button
  const availableSources = sources.filter((source) => source.type !== "direct_upload")

  const selectedSource = availableSources.find((c) => c.id === selectedSourceId)
  
  // Auto-select Overheid.nl source if only one exists when dialog opens
  useEffect(() => {
    if (open && !selectedSourceId) {
      const overheidSource = availableSources.find((s) => s.type === "overheid_nl")
      if (overheidSource) {
        setSelectedSourceId(overheidSource.id)
      }
    }
  }, [open, selectedSourceId, availableSources])

  const handleDocumentsSelected = async (documents: SearchResult[]) => {
    if (!selectedSourceId || documents.length === 0) {
      return
    }

    setAdding(true)
    setError(null)
    setSuccess(null)

    try {
      const result = await addDocumentsFromSource(workspaceId, selectedSourceId, documents)

      if (result.error) {
        setError(result.error)
      } else if (result.addedCount === 0 && documents.length > 0) {
        // No documents were added even though documents were selected
        setError("Failed to add documents. Please check the console for details or try again.")
      } else {
        setSuccess(`Successfully added ${result.addedCount || 0} document(s)`)
        router.refresh()
        onSuccess?.()
        setTimeout(() => {
          setOpen(false)
          setSuccess(null)
        }, 2000)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add documents")
    } finally {
      setAdding(false)
    }
  }

  const handleClose = (open: boolean) => {
    setOpen(open)
    if (!open) {
      // Reset state when closing
      setSelectedSourceId("")
      setError(null)
      setSuccess(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm">
            <Plus className="mr-2 h-4 w-4" />
            Add from Source
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="!max-w-[95vw] sm:!max-w-[1400px] w-full max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle>Add Documents from Source</DialogTitle>
          <DialogDescription>Search and add documents from your connected sources</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 pb-4">
          <div className="space-y-6">
            {/* Source Selection */}
            {availableSources.length === 0 ? (
              <Alert>
                <AlertDescription>
                  No sources available. Please add a source first in the Sources tab.
                </AlertDescription>
              </Alert>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="source-select">Select Source</Label>
                  <Select value={selectedSourceId} onValueChange={setSelectedSourceId}>
                    <SelectTrigger id="source-select">
                      <SelectValue placeholder="Choose a source" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableSources.map((source) => (
                        <SelectItem key={source.id} value={source.id}>
                          {source.name} ({source.type})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Overheid.nl Search UI */}
                {selectedSource?.type === "overheid_nl" && (
                  <OverheidSearch
                    onDocumentsSelected={handleDocumentsSelected}
                    showSelection={true}
                  />
                )}

                {/* Other source types placeholder */}
                {selectedSource && selectedSource.type !== "overheid_nl" && (
                  <Alert>
                    <AlertDescription>
                      Search functionality for {selectedSource.type} source is not yet implemented.
                    </AlertDescription>
                  </Alert>
                )}
              </>
            )}
          </div>
        </div>

        {/* Footer with Error/Success Messages - Always visible */}
        <DialogFooter className="px-6 py-4 border-t bg-background flex-col gap-2 sm:flex-row sm:justify-start">
          <div className="flex-1 w-full">
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
