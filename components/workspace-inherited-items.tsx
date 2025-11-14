"use client"

import ReactMarkdown from "react-markdown"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"

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

export function WorkspaceInheritedItems({ items, showEmptyState = true }: WorkspaceInheritedItemsProps) {
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

  return (
    <div className="space-y-4">
      {items.map((item) => {
        const title =
          item.payload?.title ??
          item.payload?.name ??
          item.payload?.question ??
          item.payload?.summary ??
          item.item_type
        const description = item.payload?.summary ?? item.payload?.description ?? item.payload?.answer

        return (
          <Card key={item.id} className="shadow">
            <CardHeader className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline">{itemTypeLabels[item.item_type] ?? item.item_type}</Badge>
                {item.classification && <Badge variant="outline">{item.classification}</Badge>}
                {item.spaces && (
                  <span>
                    From {item.spaces.name}
                    {item.spaces.space_type ? ` · ${item.spaces.space_type}` : ""}
                  </span>
                )}
                {item.created_at && <span>Published {new Date(item.created_at).toLocaleDateString()}</span>}
              </div>
              <CardTitle className="text-lg">{title}</CardTitle>
              {description && (
                <CardDescription className="prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown>{description}</ReactMarkdown>
                </CardDescription>
              )}
            </CardHeader>
            {(item.payload?.citations?.length ?? 0) > 0 || item.source_doc ? (
              <>
                <Separator />
                <CardContent className="space-y-3">
                  {item.source_doc && (
                    <div className="text-sm">
                      <span className="font-medium">Source document: </span>
                      {item.source_doc.url ? (
                        <a href={item.source_doc.url} target="_blank" rel="noopener noreferrer" className="text-primary">
                          {item.source_doc.title ?? "View document"}
                        </a>
                      ) : (
                        <span>{item.source_doc.title ?? "Workspace document"}</span>
                      )}
                    </div>
                  )}
                  {(item.payload?.citations?.length ?? 0) > 0 && (
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
                  )}
                </CardContent>
              </>
            ) : null}
          </Card>
        )
      })}
    </div>
  )
}
