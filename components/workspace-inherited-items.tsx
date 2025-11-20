"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import ReactMarkdown from "react-markdown"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { FileIcon, defaultStyles } from "react-file-icon"
import { FileText, Search } from "lucide-react"
import { getDocumentFileExtension } from "@/lib/utils/document-files"

type ParentSpace = {
  id: string
  name: string
  space_type?: string | null
}

type SourceDocument = {
  id: string
  title?: string | null
  url?: string | null
}

type InheritedItem = {
  id: string
  item_type: string
  classification: "public" | "internal" | "confidential" | null
  created_at: string
  payload: Record<string, any>
  spaces?: ParentSpace | null
  source_doc?: SourceDocument | null
}

interface WorkspaceInheritedItemsProps {
  items: InheritedItem[]
  showEmptyState?: boolean
}

const itemTypeLabels: Record<string, string> = {
  policy: "Policy",
  document: "Document",
  answer: "Answer",
  note: "Note",
}

function getItemTitle(item: InheritedItem) {
  return (
    item.payload?.title ??
    item.payload?.name ??
    item.payload?.question ??
    item.payload?.summary ??
    item.item_type
  )
}

function getItemDescription(item: InheritedItem) {
  return item.payload?.summary ?? item.payload?.description ?? item.payload?.answer ?? ""
}

export function WorkspaceInheritedItems({ items, showEmptyState = true }: WorkspaceInheritedItemsProps) {
  const [searchQuery, setSearchQuery] = useState("")

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) {
      return items
    }

    const query = searchQuery.toLowerCase().trim()
    return items.filter((item) => {
      const title = getItemTitle(item).toLowerCase()
      const description = getItemDescription(item).toLowerCase()
      const classification = item.classification?.toLowerCase() ?? ""
      const sourceName = item.spaces?.name?.toLowerCase() ?? ""
      const itemType = (itemTypeLabels[item.item_type] ?? item.item_type).toLowerCase()
      const citationMatch =
        Array.isArray(item.payload?.citations) &&
        item.payload.citations.some((citation: any) => {
          const citationText = String(citation.title || citation.url || "").toLowerCase()
          return citationText.includes(query)
        })

      return (
        title.includes(query) ||
        description.includes(query) ||
        classification.includes(query) ||
        sourceName.includes(query) ||
        itemType.includes(query) ||
        citationMatch
      )
    })
  }, [items, searchQuery])

  if (items.length === 0) {
    if (!showEmptyState) {
      return null
    }

    return (
      <Card className="shadow">
        <CardHeader>
          <CardTitle>No inherited items yet</CardTitle>
          <CardDescription>
            Link this workspace to a parent space to automatically inherit public policies, answers, and reference
            material.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const itemsToRender = filteredItems

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-md w-full">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search inherited items..."
            className="pl-10 w-full"
          />
        </div>
      </div>

      {itemsToRender.length === 0 ? (
        <Card className="shadow">
          <CardContent className="py-10 text-center space-y-2">
            <CardTitle className="text-base">No inherited items found</CardTitle>
            <CardDescription>
              No documents or policies match &ldquo;{searchQuery}&rdquo;. Try different keywords.
            </CardDescription>
          </CardContent>
        </Card>
      ) : (
        itemsToRender.map((item) => {
          const title = getItemTitle(item)
          const description = getItemDescription(item)
          const isDocument = item.item_type === "document"
          const documentLike = {
            metadata: {
              ...(item.payload?.metadata || {}),
              type: item.payload?.mime_type || item.payload?.type || item.payload?.content_type,
            },
            url: item.payload?.file_url || item.source_doc?.url || item.payload?.source_url,
            title,
          }
          const fileExtension = isDocument ? getDocumentFileExtension(documentLike) : "file"
          const viewUrl = item.source_doc?.url || item.payload?.file_url || item.payload?.source_url
          const isInternalLink = typeof viewUrl === "string" && viewUrl.startsWith("/")

          return (
            <Card key={item.id} className="shadow">
              <CardHeader className="space-y-4">
                {item.spaces && (
                  <div className="text-xs text-muted-foreground">
                    From {item.spaces.name}
                    {item.spaces.space_type ? ` · ${item.spaces.space_type}` : ""}
                  </div>
                )}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 shrink-0 mt-0.5 flex items-center justify-center rounded-md border bg-muted">
                      {isDocument ? (
                        <FileIcon
                          extension={fileExtension}
                          {...(defaultStyles[fileExtension as keyof typeof defaultStyles] || {})}
                          label={false}
                          glyphColor="#fff"
                          color="#6b7280"
                        />
                      ) : (
                        <FileText className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 space-y-2">
                      <CardTitle className="text-lg break-words">{title}</CardTitle>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline">{itemTypeLabels[item.item_type] ?? item.item_type}</Badge>
                        {item.classification && <Badge variant="outline">{item.classification}</Badge>}
                        {item.created_at && <span>Published {new Date(item.created_at).toLocaleDateString()}</span>}
                      </div>
                      {description && (
                        <CardDescription className="prose prose-sm dark:prose-invert max-w-none line-clamp-3">
                          <ReactMarkdown>{description}</ReactMarkdown>
                        </CardDescription>
                      )}
                    </div>
                  </div>
                  {viewUrl && (
                    <Button variant="outline" size="sm" asChild>
                      {isInternalLink ? (
                        <Link href={viewUrl}>View document</Link>
                      ) : (
                        <a href={viewUrl} target="_blank" rel="noopener noreferrer">
                          View document
                        </a>
                      )}
                    </Button>
                  )}
                </div>
              </CardHeader>
              {(item.payload?.citations?.length ?? 0) > 0 ? (
                <>
                  <Separator />
                  <CardContent className="space-y-3">
                    <div className="space-y-2 text-sm">
                      <div className="font-medium">Citations</div>
                      <ul className="space-y-1">
                        {item.payload?.citations?.map((citation: any, index: number) => (
                          <li key={citation.url ?? citation.title ?? index} className="text-muted-foreground">
                            {citation.title ?? "Reference"}
                            {citation.page && ` · Page ${citation.page}`}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </CardContent>
                </>
              ) : null}
            </Card>
          )
        })
      )}
    </div>
  )
}

