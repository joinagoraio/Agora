"use client"

import { isTextSelection } from "@tiptap/core"
import { EditorContent, useEditor, type Editor } from "@tiptap/react"
import { BubbleMenu } from "@tiptap/react/menus"
import StarterKit from "@tiptap/starter-kit"
import TextAlign from "@tiptap/extension-text-align"
import Underline from "@tiptap/extension-underline"
import Link from "@tiptap/extension-link"
import { Color } from "@tiptap/extension-color"
import { TextStyle } from "@tiptap/extension-text-style"
import { Button } from "@/components/ui/button"
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Pilcrow,
  Redo,
  Strikethrough,
  Table as TableIcon,
  Underline as UnderlineIcon,
  Undo,
  WrapText,
} from "lucide-react"
import { Separator } from "@/components/ui/separator"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { programmeChapterProseClass } from "@/lib/programme/document-layout"
import { programmeTableExtensions } from "@/lib/programme/editor-table"
import { parseProgrammeTableBorders } from "@/lib/programme/table-style"
import { ProgrammeParagraphSpacing } from "@/lib/programme/editor-paragraph"
import {
  parseProgrammeLineHeight,
  parseProgrammeSpaceAfter,
  PROGRAMME_LINE_HEIGHTS,
  PROGRAMME_SPACE_AFTER,
  type ProgrammeLineHeight,
  type ProgrammeSpaceAfter,
} from "@/lib/programme/paragraph-style"
import { useEffect, useRef, useState } from "react"
import { useI18n } from "@/lib/i18n/use-i18n"
import { IconTooltip } from "@/components/icon-tooltip"
import { BlockId, BLOCK_ID_ATTR } from "@/lib/programme/block-id"
import { ProgrammePageBreaks, registerProgrammePaginationEditor } from "@/lib/programme/editor-page-breaks"
import { programmeCitationExtension, type ProgrammeCitationLookup } from "@/lib/programme/editor-citations"
import type { ProgrammeCitationSource } from "@/lib/programme/citation-display"
import { ProgrammeCiteDialog } from "@/components/programme-cite-dialog"

interface RichTextEditorProps {
  content: string
  onChange: (content: string) => void
  placeholder?: string
  className?: string
  activeBlockId?: string | null
  onBlockClick?: (blockId: string) => void
  showHistoryButtons?: boolean
  toolbar?: "fixed" | "selection"
  workspaceId?: string | null
  citationSources?: ProgrammeCitationSource[]
}

type ToolbarLabel = (key: string) => string

function HeadingGlyph({ editor }: { editor: Editor }) {
  if (editor.isActive("heading", { level: 1 })) return <Heading1 className="h-4 w-4" />
  if (editor.isActive("heading", { level: 2 })) return <Heading2 className="h-4 w-4" />
  if (editor.isActive("heading", { level: 3 })) return <Heading3 className="h-4 w-4" />
  return <Pilcrow className="h-4 w-4" />
}

function TableControls({
  editor,
  tb,
  size,
  tipSide,
  onMenuOpenChange,
}: {
  editor: Editor
  tb: ToolbarLabel
  size: "sm" | "icon-sm"
  tipSide: "top" | "bottom"
  onMenuOpenChange?: (open: boolean) => void
}) {
  const inTable = editor.isActive("table")
  if (!inTable) {
    return (
      <IconTooltip label={tb("insertTable")} side={tipSide}>
        <Button
          type="button"
          variant="ghost"
          size={size}
          onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
          aria-label={tb("insertTable")}
        >
          <TableIcon className="h-4 w-4" />
        </Button>
      </IconTooltip>
    )
  }

  const borders = parseProgrammeTableBorders(editor.getAttributes("table").borders)

  return (
    <DropdownMenu onOpenChange={onMenuOpenChange}>
      <DropdownMenuTrigger asChild>
        <span className="inline-flex">
          <IconTooltip label={tb("table")} side={tipSide}>
            <Button type="button" variant="ghost" size={size} className="bg-muted" aria-label={tb("table")}>
              <TableIcon className="h-4 w-4" />
            </Button>
          </IconTooltip>
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>{tb("tableBorders")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={borders}
          onValueChange={(value) => {
            editor.chain().focus().updateAttributes("table", { borders: parseProgrammeTableBorders(value) }).run()
          }}
        >
          <DropdownMenuRadioItem value="all">{tb("tableBordersAll")}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="body">{tb("tableBordersBody")}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="none">{tb("tableBordersNone")}</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => editor.chain().focus().addRowAfter().run()}>{tb("addTableRow")}</DropdownMenuItem>
        <DropdownMenuItem onClick={() => editor.chain().focus().addColumnAfter().run()}>
          {tb("addTableColumn")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => editor.chain().focus().deleteTable().run()}>{tb("deleteTable")}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function currentBlockSpacing(editor: Editor) {
  const attrs = editor.isActive("heading")
    ? editor.getAttributes("heading")
    : editor.isActive("blockquote")
      ? editor.getAttributes("blockquote")
      : editor.getAttributes("paragraph")
  return {
    lineHeight: parseProgrammeLineHeight(attrs.lineHeight) ?? "",
    spaceAfter: parseProgrammeSpaceAfter(attrs.spaceAfter) ?? "",
  }
}

function lineHeightLabelKey(value: ProgrammeLineHeight | "") {
  if (!value) return "lineHeightDefault"
  return `lineHeight${value.replace(".", "")}`
}

function spaceAfterLabelKey(value: ProgrammeSpaceAfter | "") {
  if (!value) return "spaceAfterDefault"
  return `spaceAfter${value}`
}

function SpacingControls({
  editor,
  tb,
  size,
  tipSide,
  onMenuOpenChange,
}: {
  editor: Editor
  tb: ToolbarLabel
  size: "sm" | "icon-sm"
  tipSide: "top" | "bottom"
  onMenuOpenChange?: (open: boolean) => void
}) {
  const current = currentBlockSpacing(editor)
  return (
    <DropdownMenu onOpenChange={onMenuOpenChange}>
      <DropdownMenuTrigger asChild>
        <span className="inline-flex">
          <IconTooltip label={tb("spacing")} side={tipSide}>
            <Button type="button" variant="ghost" size={size} aria-label={tb("spacing")}>
              <WrapText className="h-4 w-4" />
            </Button>
          </IconTooltip>
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-44">
        <DropdownMenuLabel>{tb("lineSpacing")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={current.lineHeight || "default"}
          onValueChange={(value) => {
            editor.chain().focus().setProgrammeLineHeight(parseProgrammeLineHeight(value)).run()
          }}
        >
          <DropdownMenuRadioItem value="default">{tb(lineHeightLabelKey(""))}</DropdownMenuRadioItem>
          {PROGRAMME_LINE_HEIGHTS.map((value) => (
            <DropdownMenuRadioItem key={value} value={value}>
              {tb(lineHeightLabelKey(value))}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{tb("spaceAfter")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={current.spaceAfter || "default"}
          onValueChange={(value) => {
            editor.chain().focus().setProgrammeSpaceAfter(parseProgrammeSpaceAfter(value)).run()
          }}
        >
          <DropdownMenuRadioItem value="default">{tb(spaceAfterLabelKey(""))}</DropdownMenuRadioItem>
          {PROGRAMME_SPACE_AFTER.map((value) => (
            <DropdownMenuRadioItem key={value} value={value}>
              {tb(spaceAfterLabelKey(value))}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function FormattingControls({
  editor,
  tb,
  compact,
  showHistoryButtons,
  onMenuOpenChange,
  setLink,
}: {
  editor: Editor
  tb: ToolbarLabel
  compact: boolean
  showHistoryButtons: boolean
  onMenuOpenChange?: (open: boolean) => void
  setLink: () => void
}) {
  const size = compact ? "icon-sm" : "sm"
  const tipSide = compact ? "top" : "bottom"

  return (
    <>
      <IconTooltip label={tb("bold")} side={tipSide}>
        <Button
          type="button"
          variant="ghost"
          size={size}
          onClick={() => editor.chain().focus().toggleBold().run()}
          disabled={!editor.can().chain().focus().toggleBold().run()}
          className={cn(editor.isActive("bold") && "bg-muted")}
          aria-label={tb("bold")}
        >
          <Bold className="h-4 w-4" />
        </Button>
      </IconTooltip>
      <IconTooltip label={tb("italic")} side={tipSide}>
        <Button
          type="button"
          variant="ghost"
          size={size}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          disabled={!editor.can().chain().focus().toggleItalic().run()}
          className={cn(editor.isActive("italic") && "bg-muted")}
          aria-label={tb("italic")}
        >
          <Italic className="h-4 w-4" />
        </Button>
      </IconTooltip>
      <IconTooltip label={tb("underline")} side={tipSide}>
        <Button
          type="button"
          variant="ghost"
          size={size}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          disabled={!editor.can().chain().focus().toggleUnderline().run()}
          className={cn(editor.isActive("underline") && "bg-muted")}
          aria-label={tb("underline")}
        >
          <UnderlineIcon className="h-4 w-4" />
        </Button>
      </IconTooltip>
      <IconTooltip label={tb("strike")} side={tipSide}>
        <Button
          type="button"
          variant="ghost"
          size={size}
          onClick={() => editor.chain().focus().toggleStrike().run()}
          disabled={!editor.can().chain().focus().toggleStrike().run()}
          className={cn(editor.isActive("strike") && "bg-muted")}
          aria-label={tb("strike")}
        >
          <Strikethrough className="h-4 w-4" />
        </Button>
      </IconTooltip>

      <Separator orientation="vertical" className="h-6" />

      <DropdownMenu onOpenChange={onMenuOpenChange}>
        <DropdownMenuTrigger asChild>
          <span className="inline-flex">
            <IconTooltip label={tb("heading")} side={tipSide}>
              <Button type="button" variant="ghost" size={size} aria-label={tb("heading")}>
                {compact ? <HeadingGlyph editor={editor} /> : editor.isActive("heading", { level: 1 }) ? (
                  <Heading1 className="h-4 w-4" />
                ) : editor.isActive("heading", { level: 2 }) ? (
                  <Heading2 className="h-4 w-4" />
                ) : editor.isActive("heading", { level: 3 }) ? (
                  <Heading3 className="h-4 w-4" />
                ) : (
                  "Normal"
                )}
              </Button>
            </IconTooltip>
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem
            onClick={() => editor.chain().focus().setParagraph().run()}
            className={cn(editor.isActive("paragraph") && "bg-muted")}
          >
            Normal
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            className={cn(editor.isActive("heading", { level: 1 }) && "bg-muted")}
          >
            Heading 1
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            className={cn(editor.isActive("heading", { level: 2 }) && "bg-muted")}
          >
            Heading 2
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            className={cn(editor.isActive("heading", { level: 3 }) && "bg-muted")}
          >
            Heading 3
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Separator orientation="vertical" className="h-6" />

      <IconTooltip label={tb("bulletList")} side={tipSide}>
        <Button
          type="button"
          variant="ghost"
          size={size}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={cn(editor.isActive("bulletList") && "bg-muted")}
          aria-label={tb("bulletList")}
        >
          <List className="h-4 w-4" />
        </Button>
      </IconTooltip>
      <IconTooltip label={tb("numberedList")} side={tipSide}>
        <Button
          type="button"
          variant="ghost"
          size={size}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={cn(editor.isActive("orderedList") && "bg-muted")}
          aria-label={tb("numberedList")}
        >
          <ListOrdered className="h-4 w-4" />
        </Button>
      </IconTooltip>
      <TableControls editor={editor} tb={tb} size={size} tipSide={tipSide} onMenuOpenChange={onMenuOpenChange} />

      <Separator orientation="vertical" className="h-6" />

      <IconTooltip label={tb("alignLeft")} side={tipSide}>
        <Button
          type="button"
          variant="ghost"
          size={size}
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
          className={cn(editor.isActive({ textAlign: "left" }) && "bg-muted")}
          aria-label={tb("alignLeft")}
        >
          <AlignLeft className="h-4 w-4" />
        </Button>
      </IconTooltip>
      <IconTooltip label={tb("alignCenter")} side={tipSide}>
        <Button
          type="button"
          variant="ghost"
          size={size}
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
          className={cn(editor.isActive({ textAlign: "center" }) && "bg-muted")}
          aria-label={tb("alignCenter")}
        >
          <AlignCenter className="h-4 w-4" />
        </Button>
      </IconTooltip>
      <IconTooltip label={tb("alignRight")} side={tipSide}>
        <Button
          type="button"
          variant="ghost"
          size={size}
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
          className={cn(editor.isActive({ textAlign: "right" }) && "bg-muted")}
          aria-label={tb("alignRight")}
        >
          <AlignRight className="h-4 w-4" />
        </Button>
      </IconTooltip>
      <IconTooltip label={tb("justify")} side={tipSide}>
        <Button
          type="button"
          variant="ghost"
          size={size}
          onClick={() => editor.chain().focus().setTextAlign("justify").run()}
          className={cn(editor.isActive({ textAlign: "justify" }) && "bg-muted")}
          aria-label={tb("justify")}
        >
          <AlignJustify className="h-4 w-4" />
        </Button>
      </IconTooltip>
      <SpacingControls editor={editor} tb={tb} size={size} tipSide={tipSide} onMenuOpenChange={onMenuOpenChange} />

      <Separator orientation="vertical" className="h-6" />

      <IconTooltip label={tb("link")} side={tipSide}>
        <Button
          type="button"
          variant="ghost"
          size={size}
          onClick={setLink}
          className={cn(editor.isActive("link") && "bg-muted")}
          aria-label={tb("link")}
        >
          <LinkIcon className="h-4 w-4" />
        </Button>
      </IconTooltip>

      {showHistoryButtons ? (
        <>
          <Separator orientation="vertical" className="h-6" />
          <IconTooltip label={tb("undo")} side={tipSide}>
            <Button
              type="button"
              variant="ghost"
              size={size}
              onClick={() => editor.chain().focus().undo().run()}
              disabled={!editor.can().chain().focus().undo().run()}
              aria-label={tb("undo")}
            >
              <Undo className="h-4 w-4" />
            </Button>
          </IconTooltip>
          <IconTooltip label={tb("redo")} side={tipSide}>
            <Button
              type="button"
              variant="ghost"
              size={size}
              onClick={() => editor.chain().focus().redo().run()}
              disabled={!editor.can().chain().focus().redo().run()}
              aria-label={tb("redo")}
            >
              <Redo className="h-4 w-4" />
            </Button>
          </IconTooltip>
        </>
      ) : null}
    </>
  )
}

export function RichTextEditor({
  content,
  onChange,
  className,
  activeBlockId,
  onBlockClick,
  showHistoryButtons = true,
  toolbar = "fixed",
  workspaceId = null,
  citationSources = [],
}: RichTextEditorProps) {
  const { t } = useI18n()
  const tb = (key: string) => t(`workspace.documents.editor.toolbar.${key}`)
  const onBlockClickRef = useRef(onBlockClick)
  onBlockClickRef.current = onBlockClick
  const keepMenuRef = useRef(false)
  const keepMenuCountRef = useRef(0)
  const lastEmittedRef = useRef(content)
  const selectionToolbar = toolbar === "selection"
  const [citeOpen, setCiteOpen] = useState(false)
  const citationLookupRef = useRef<ProgrammeCitationLookup["current"]>({ workspaceId, sources: citationSources })
  citationLookupRef.current = { workspaceId, sources: citationSources }

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
        ...(showHistoryButtons ? {} : { history: false }),
      }),
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: "text-primary underline cursor-pointer",
        },
      }),
      Color,
      TextStyle,
      ...programmeTableExtensions,
      ProgrammeParagraphSpacing,
      BlockId,
      ProgrammePageBreaks,
      programmeCitationExtension(citationLookupRef),
    ],
    content,
    onUpdate: ({ editor, transaction }) => {
      if (!transaction.docChanged) return
      const html = editor.getHTML()
      lastEmittedRef.current = html
      onChange(html)
    },
    editorProps: {
      attributes: {
        class: cn(
          "focus:outline-none",
          selectionToolbar
            ? programmeChapterProseClass
            : cn(
                "min-h-[420px] p-4",
                "[&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0",
                "[&_h1]:text-3xl [&_h1]:font-bold [&_h1]:my-4 [&_h1]:mt-6 [&_h1]:mb-3",
                "[&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:my-3 [&_h2]:mt-5 [&_h2]:mb-2",
                "[&_h3]:text-xl [&_h3]:font-semibold [&_h3]:my-2 [&_h3]:mt-4 [&_h3]:mb-2",
                "[&_ul]:my-2 [&_ul]:ml-6 [&_ul]:list-disc",
                "[&_ol]:my-2 [&_ol]:ml-6 [&_ol]:list-decimal",
                "[&_li]:my-1",
                "[&_a]:text-primary [&_a]:underline [&_a]:cursor-pointer",
                "[&_strong]:font-bold",
                "[&_em]:italic",
                "[&_u]:underline",
                "[&_s]:line-through",
                "[&_blockquote]:border-l-4 [&_blockquote]:border-muted-foreground [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:my-4",
                "[&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-sm [&_code]:font-mono",
                "[&_pre]:bg-muted [&_pre]:p-4 [&_pre]:rounded [&_pre]:overflow-x-auto [&_pre]:my-4",
                "[&_pre_code]:bg-transparent [&_pre_code]:p-0",
              ),
          className,
        ),
      },
      handleClick: (_view, _pos, event) => {
        const handler = onBlockClickRef.current
        if (!handler) return false
        const target = (event.target as HTMLElement | null)?.closest?.(`[${BLOCK_ID_ATTR}]`) as HTMLElement | null
        const blockId = target?.getAttribute(BLOCK_ID_ATTR)
        if (blockId) handler(blockId)
        return false
      },
    },
  })

  useEffect(() => {
    if (!editor) return
    return registerProgrammePaginationEditor(editor)
  }, [editor])

  const citationKey = `${workspaceId || ""}:${citationSources.map((source) => `${source.id}:${source.title}`).join("|")}`
  useEffect(() => {
    if (!editor) return
    editor.view.dispatch(editor.state.tr.setMeta("addToHistory", false))
  }, [editor, citationKey])

  useEffect(() => {
    if (!editor) return
    if (content === lastEmittedRef.current) return
    const currentContent = editor.getHTML()
    const normalizedContent = content?.trim() || ""
    const normalizedCurrent = currentContent?.trim() || ""
    if (normalizedContent === normalizedCurrent) {
      lastEmittedRef.current = content
      return
    }
    editor.commands.setContent(normalizedContent || "<p></p>", { emitUpdate: false })
    lastEmittedRef.current = editor.getHTML()
  }, [content, editor])

  useEffect(() => {
    if (!editor) return
    editor.view.dom.querySelectorAll(`[${BLOCK_ID_ATTR}]`).forEach((el) => {
      el.classList.toggle("bg-amber-50", el.getAttribute(BLOCK_ID_ATTR) === activeBlockId)
    })
  }, [editor, activeBlockId])

  if (!editor) {
    if (selectionToolbar) {
      return (
        <div
          className={cn(programmeChapterProseClass, className)}
          dangerouslySetInnerHTML={{ __html: content }}
        />
      )
    }
    return null
  }

  const setLink = () => {
    const previousUrl = editor.getAttributes("link").href
    const url = window.prompt("URL", previousUrl)

    if (url === null) {
      return
    }

    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run()
      return
    }

    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run()
  }

  const controls = (
    <FormattingControls
      editor={editor}
      tb={tb}
      compact={selectionToolbar}
      showHistoryButtons={showHistoryButtons && !selectionToolbar}
      onMenuOpenChange={(open) => {
        keepMenuCountRef.current = Math.max(0, keepMenuCountRef.current + (open ? 1 : -1))
        keepMenuRef.current = keepMenuCountRef.current > 0
      }}
      setLink={setLink}
    />
  )

  return (
    <div className={cn(!selectionToolbar && "border rounded-md")}>
      {selectionToolbar ? (
        <BubbleMenu
          editor={editor}
          updateDelay={0}
          appendTo={() => document.body}
          shouldShow={({ editor: current, state, from, to }) => {
            if (keepMenuRef.current) return true
            if (!current.isEditable) return false
            if (current.isActive("table")) return true
            const { selection } = state
            if (selection.empty || from === to) return false
            return isTextSelection(selection) || from !== to
          }}
          options={{
            strategy: "fixed",
            placement: "top",
            offset: 8,
            flip: true,
            shift: true,
            scrollTarget:
              (typeof document !== "undefined" && document.getElementById("programme-document-scroll")) || window,
          }}
          ref={(el) => {
            if (!el) return
            el.style.zIndex = "80"
            el.dataset.programmeFormatMenu = ""
          }}
          className="z-[80] flex max-w-[min(100vw-2rem,44rem)] flex-wrap items-center gap-0.5 rounded-md border bg-popover p-1 shadow-md"
          data-programme-format-menu=""
          role="toolbar"
          aria-label={tb("formatMenu")}
          onMouseDown={(event) => event.preventDefault()}
        >
          {controls}
          {citationSources.length > 0 ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setCiteOpen(true)}
            >
              {t("workspace.programme.citeAdd")}
            </Button>
          ) : null}
        </BubbleMenu>
      ) : (
        <div className="flex flex-wrap items-center gap-1 border-b bg-muted/50 p-2" onMouseDown={(event) => event.preventDefault()}>
          {controls}
        </div>
      )}
      <EditorContent editor={editor} />
      {citeOpen && citationSources.length > 0 ? (
        <ProgrammeCiteDialog
          sources={citationSources}
          onClose={() => setCiteOpen(false)}
          onInsert={(marker) => {
            const to = editor.state.selection.to
            editor.chain().focus().setTextSelection(to).insertContent(marker).run()
          }}
        />
      ) : null}
    </div>
  )
}
