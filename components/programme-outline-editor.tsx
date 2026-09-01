"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { useEditor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Heading from "@tiptap/extension-heading"
import { Button } from "@/components/ui/button"
import { useI18n } from "@/lib/i18n/use-i18n"
import { IconTooltip } from "@/components/icon-tooltip"
import {
  buildOutlineTree,
  outlineNodesToTipTapHtml,
  tipTapHtmlToOutlineDrafts,
  type ProgrammeOutlineNode,
} from "@/lib/programme/domain"
import {
  ensureProgrammeOutline,
  listProgrammeOutlineNodes,
  reorderProgrammeOutlineNodes,
  syncProgrammeOutlineFromEditor,
} from "@/lib/actions/outline"
import { Heading2, Save, ArrowUp, ArrowDown, Plus } from "lucide-react"
import { cn } from "@/lib/utils"

const OutlineHeading = Heading.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      outlineId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-outline-id"),
        renderHTML: (attributes) => {
          if (!attributes.outlineId) return {}
          return { "data-outline-id": attributes.outlineId }
        },
      },
    }
  },
})

type Props = {
  workspaceId: string
  spaceId: string
  templateId: string | null
  onTemplateBound: (templateId: string) => void
  onMessage: (message: string) => void
}

export function ProgrammeOutlineEditor({
  workspaceId,
  spaceId,
  templateId,
  onTemplateBound,
  onMessage,
}: Props) {
  const { t } = useI18n()
  const [nodes, setNodes] = useState<ProgrammeOutlineNode[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: false,
      }),
      OutlineHeading.configure({ levels: [2, 3] }),
    ],
    content: "<h2>New section</h2><p></p>",
    editorProps: {
      attributes: {
        class: cn(
          "focus:outline-none min-h-[280px] rounded-md border bg-background p-4",
          "[&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mt-4 [&_h2]:mb-2",
          "[&_h3]:text-lg [&_h3]:font-medium [&_h3]:mt-3 [&_h3]:mb-1",
          "[&_p]:my-2 [&_p]:text-sm [&_p]:text-muted-foreground",
        ),
      },
    },
  })

  const applyNodes = (next: ProgrammeOutlineNode[]) => {
    setNodes(next)
    setSelectedId(next[0]?.id ?? null)
    editor?.commands.setContent(outlineNodesToTipTapHtml(next), { emitUpdate: false })
  }

  const tree = useMemo(() => buildOutlineTree(nodes), [nodes])

  useEffect(() => {
    if (!templateId) return
    startTransition(async () => {
      const result = await listProgrammeOutlineNodes(templateId)
      if (result.error) {
        onMessage(result.error)
        return
      }
      applyNodes(result.data)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, editor])

  const ensure = () => {
    startTransition(async () => {
      const ensured = await ensureProgrammeOutline(workspaceId, spaceId)
      if (ensured.error || !ensured.data) {
        onMessage(ensured.error || t("workspace.programme.outlineLoadError"))
        return
      }
      onTemplateBound(ensured.data.templateId)
      applyNodes(ensured.data.nodes)
      onMessage(t("workspace.programme.outlineReady"))
    })
  }

  const save = () => {
    if (!templateId) {
      onMessage(t("workspace.programme.outlineNeedTemplate"))
      return
    }
    const drafts = tipTapHtmlToOutlineDrafts(editor?.getHTML() || "")
    startTransition(async () => {
      const result = await syncProgrammeOutlineFromEditor({
        workspaceId,
        templateId,
        drafts,
      })
      if (result.error) {
        onMessage(result.error)
        return
      }
      applyNodes(result.data || [])
      onMessage(t("workspace.programme.outlineSaved", undefined, { count: String(result.data?.length ?? 0) }))
    })
  }

  const moveSelected = (direction: "up" | "down") => {
    if (!templateId || !selectedId) return
    const ordered = [...nodes].sort((a, b) => a.sortOrder - b.sortOrder)
    const index = ordered.findIndex((n) => n.id === selectedId)
    const swap = direction === "up" ? index - 1 : index + 1
    if (index < 0 || swap < 0 || swap >= ordered.length) return
    const next = [...ordered]
    ;[next[index], next[swap]] = [next[swap], next[index]]
    const orderedIds = next.map((n) => n.id)
    startTransition(async () => {
      const result = await reorderProgrammeOutlineNodes({ workspaceId, templateId, orderedIds })
      if (result.error) {
        onMessage(result.error)
        return
      }
      applyNodes(result.data || [])
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {!templateId ? (
          <Button disabled={pending} onClick={ensure}>
            {t("workspace.programme.outlineEnsure")}
          </Button>
        ) : (
          <>
            <Button disabled={pending} onClick={save}>
              <Save className="mr-2 h-4 w-4" />
              {t("workspace.programme.outlineSave")}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={pending || !editor}
              onClick={() => editor?.chain().focus().insertContent("<h2>New section</h2><p></p>").run()}
            >
              <Plus className="mr-2 h-4 w-4" />
              {t("workspace.programme.outlineAddSection")}
            </Button>
            <IconTooltip label={t("workspace.programme.outlineMoveUp")}>
              <Button
                type="button"
                variant="outline"
                size="icon"
                disabled={pending || !selectedId}
                onClick={() => moveSelected("up")}
                aria-label={t("workspace.programme.outlineMoveUp")}
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
            </IconTooltip>
            <IconTooltip label={t("workspace.programme.outlineMoveDown")}>
              <Button
                type="button"
                variant="outline"
                size="icon"
                disabled={pending || !selectedId}
                onClick={() => moveSelected("down")}
                aria-label={t("workspace.programme.outlineMoveDown")}
              >
                <ArrowDown className="h-4 w-4" />
              </Button>
            </IconTooltip>
          </>
        )}
      </div>

      {templateId && (
        <div className="grid gap-4 md:grid-cols-[220px_1fr]">
          <aside className="space-y-1 rounded-md border p-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("workspace.programme.outlineTree")}
            </p>
            {tree.length === 0 && (
              <p className="text-sm text-muted-foreground">{t("workspace.programme.outlineEmpty")}</p>
            )}
            {tree.map((node) => (
              <button
                key={node.id}
                type="button"
                className={cn(
                  "flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted",
                  selectedId === node.id && "bg-muted font-medium",
                )}
                onClick={() => setSelectedId(node.id)}
              >
                <Heading2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="line-clamp-2">{node.title}</span>
              </button>
            ))}
          </aside>
          <div>
            <p className="mb-2 text-sm text-muted-foreground">{t("workspace.programme.outlineEditorHint")}</p>
            <EditorContent editor={editor} />
          </div>
        </div>
      )}
    </div>
  )
}
