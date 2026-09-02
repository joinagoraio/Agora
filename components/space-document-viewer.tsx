"use client"

import { useMemo, Suspense } from "react"

import { DocumentViewerClient } from "@/components/document-viewer-client"
import { HighlightProvider } from "@/lib/contexts/highlight-context"
import { WorkspaceChatWrapper } from "@/components/workspace-chat-wrapper"
import { useI18n } from "@/lib/i18n/use-i18n"

export type SpaceDocumentViewerItem = {
  id: string
  title: string
  summary?: string | null
  fileName?: string | null
  mimeType?: string | null
  fileUrl?: string | null
  sourceUrl?: string | null
  fullText?: string | null
}

export function SpaceDocumentViewer({
  spaceId,
  spaceName,
  item,
  pages,
  isTextDocument,
}: {
  spaceId: string
  spaceName: string
  item: SpaceDocumentViewerItem
  pages: any[]
  isTextDocument: boolean
}) {
  const { t } = useI18n()
  const fileProxyUrl = `/api/spaces/${spaceId}/items/${item.id}/file`
  const textContentUrl = `/api/spaces/${spaceId}/items/${item.id}/text-content`
  const previewUrl = isTextDocument ? textContentUrl : item.fileUrl ? fileProxyUrl : textContentUrl
  const documentUrl = item.fileUrl ? fileProxyUrl : item.sourceUrl

  const documentMetadata = useMemo(
    () => ({
      type: item.mimeType ?? (isTextDocument ? "text/plain" : undefined),
      filename: item.fileName ?? item.title,
    }),
    [item.fileName, item.mimeType, item.title, isTextDocument],
  )

  return (
    <HighlightProvider>
      <WorkspaceChatWrapper spaceId={spaceId} workspaceName={spaceName} canManage={false}>
        <Suspense fallback={null}>
          <DocumentViewerClient
            documentId={item.id}
            documentTitle={item.title}
            documentUrl={documentUrl ?? null}
            pageCount={pages.length > 0 ? pages.length : null}
            highlights={[]}
            initialPage={1}
            documentMetadata={documentMetadata}
            pages={pages}
            backHref={`/spaces/${spaceId}`}
            backLabel={t("space.documents.viewer.back", undefined, { name: spaceName })}
            previewUrl={previewUrl}
          />
        </Suspense>
      </WorkspaceChatWrapper>
    </HighlightProvider>
  )
}
