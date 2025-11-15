"use client"

import { useState } from "react"
import { MultiFormatViewer } from "@/components/multi-format-viewer"
import { ZOOM_PRESETS, type ViewerControls } from "@/components/pdf-viewer"
import { Button } from "@/components/ui/button"
import {
  ArrowLeft,
  Download,
  ZoomIn,
  ZoomOut,
  ChevronsLeftRight,
  ChevronsUpDown,
  ChevronDown,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import Link from "next/link"

interface DocumentViewerClientProps {
  workspaceId: string
  documentId: string
  documentTitle: string
  documentUrl: string | null
  pageCount: number | null
  highlights: any[]
  initialPage: number
  documentMetadata?: Record<string, any>
}

const DOCUMENT_VIEWER_HEADER_HEIGHT = 64

export function DocumentViewerClient({
  workspaceId,
  documentId,
  documentTitle,
  documentUrl,
  pageCount,
  highlights,
  initialPage,
  documentMetadata,
}: DocumentViewerClientProps) {
  const [controls, setControls] = useState<ViewerControls | null>(null)

  console.log("[DocumentViewerClient] Received highlights:", {
    highlightsCount: highlights.length,
    highlights,
  })

  return (
    <TooltipProvider>
      <div className="flex h-screen flex-col">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-4 flex-1">
            <Link href={`/workspaces/${workspaceId}`}>
              <Button variant="ghost" size="sm">
                <ArrowLeft className="mr-2 h-3 w-3" />
                <span className="text-xs">Back to Workspace</span>
              </Button>
            </Link>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center">
            <h1 className="text-sm font-normal">{documentTitle}</h1>
            {pageCount !== null && pageCount > 0 && (
              <p className="text-xs text-muted-foreground">{pageCount} pages</p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-1 justify-end">
            {controls && (
              <>
                <span className="text-sm text-muted-foreground">
                  {controls.pageNumber} of {controls.numPages || "?"}
                </span>
                <div className="h-6 w-px bg-border" />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={controls.zoomOut}
                  disabled={controls.scale <= (controls.minScale ?? 0.5)}
                >
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="gap-2 px-2">
                      {controls.fitMode === "width" ? (
                        <span className="flex items-center gap-2">
                          Fit
                          <ChevronsLeftRight className="h-4 w-4" />
                        </span>
                      ) : controls.fitMode === "height" ? (
                        <span className="flex items-center gap-2">
                          Fit
                          <ChevronsUpDown className="h-4 w-4" />
                        </span>
                      ) : (
                        <span>{Math.round(controls.scale * 100)}%</span>
                      )}
                      <ChevronDown className="h-4 w-4 opacity-60" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-fit min-w-0">
                    {ZOOM_PRESETS.map((preset) => (
                      <DropdownMenuItem
                        key={preset}
                        onSelect={() => controls.setScale?.(preset)}
                        disabled={!controls.setScale}
                      >
                        {Math.round(preset * 100)}%
                      </DropdownMenuItem>
                    ))}
                    {(controls.fitToWidth || controls.fitToHeight) && <DropdownMenuSeparator />}
                    {controls.fitToWidth && (
                      <DropdownMenuItem onSelect={controls.fitToWidth}>
                        <span className="flex items-center gap-2">
                          Fit
                          <ChevronsLeftRight className="h-4 w-4" />
                        </span>
                      </DropdownMenuItem>
                    )}
                    {controls.fitToHeight && (
                      <DropdownMenuItem onSelect={controls.fitToHeight}>
                        <span className="flex items-center gap-2">
                          Fit
                          <ChevronsUpDown className="h-4 w-4" />
                        </span>
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={controls.zoomIn}
                  disabled={controls.scale >= (controls.maxScale ?? 3.0)}
                >
                  <ZoomIn className="h-4 w-4" />
                </Button>
              </>
            )}
            {documentUrl && (
              <>
                <div className="h-6 w-px bg-border" />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" asChild>
                      <a href={documentUrl} target="_blank" rel="noopener noreferrer">
                        <Download className="h-4 w-4" />
                      </a>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Download</p>
                  </TooltipContent>
                </Tooltip>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Multi-Format Document Viewer */}
      <div className="flex-1 overflow-hidden">
        {documentUrl ? (
          <MultiFormatViewer
            url={`/api/documents/${documentId}/pdf`}
            documentId={documentId}
            documentTitle={documentTitle}
            highlights={highlights}
            initialPage={initialPage}
            className="h-full"
            hideControls={true}
            documentMetadata={documentMetadata}
            viewportOffset={DOCUMENT_VIEWER_HEADER_HEIGHT}
            onControlsReady={setControls}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <p className="text-muted-foreground">Document URL not available</p>
            </div>
          </div>
        )}
      </div>
    </div>
    </TooltipProvider>
  )
}
