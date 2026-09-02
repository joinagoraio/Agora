"use client"

import { useEditor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import TextAlign from "@tiptap/extension-text-align"
import Underline from "@tiptap/extension-underline"
import Link from "@tiptap/extension-link"
import { Color } from "@tiptap/extension-color"
import { TextStyle } from "@tiptap/extension-text-style"
import { Button } from "@/components/ui/button"
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  Heading1,
  Heading2,
  Heading3,
  Link as LinkIcon,
  Undo,
  Redo,
} from "lucide-react"
import { Separator } from "@/components/ui/separator"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { useEffect } from "react"
import { useI18n } from "@/lib/i18n/use-i18n"
import { IconTooltip } from "@/components/icon-tooltip"
import { BlockId } from "@/lib/programme/block-id"

interface RichTextEditorProps {
  content: string
  onChange: (content: string) => void
  placeholder?: string
  className?: string
}

export function RichTextEditor({ content, onChange, placeholder, className }: RichTextEditorProps) {
  const { t } = useI18n()
  const tb = (key: string) => t(`workspace.documents.editor.toolbar.${key}`)

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
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
      BlockId,
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML())
    },
    editorProps: {
      attributes: {
        class: cn(
          "focus:outline-none min-h-[420px] p-4",
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
          className
        ),
      },
    },
  })

  // Sync content when it changes externally (e.g., from AI generation)
  useEffect(() => {
    if (editor) {
      const currentContent = editor.getHTML()
      // Only update if content actually changed to avoid unnecessary re-renders
      if (content !== currentContent) {
        // If content is empty or just whitespace, set empty content
        const normalizedContent = content?.trim() || ""
        const normalizedCurrent = currentContent?.trim() || ""
        if (normalizedContent !== normalizedCurrent) {
          editor.commands.setContent(normalizedContent || "<p></p>", { emitUpdate: false })
        }
      }
    }
  }, [content, editor])

  if (!editor) {
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

  return (
    <div className="border rounded-md">
      <div className="flex flex-wrap items-center gap-1 p-2 border-b bg-muted/50">
        {/* Text Formatting */}
        <IconTooltip label={tb("bold")}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().toggleBold().run()}
            disabled={!editor.can().chain().focus().toggleBold().run()}
            className={cn(editor.isActive("bold") && "bg-muted")}
            aria-label={tb("bold")}
          >
            <Bold className="h-4 w-4" />
          </Button>
        </IconTooltip>
        <IconTooltip label={tb("italic")}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            disabled={!editor.can().chain().focus().toggleItalic().run()}
            className={cn(editor.isActive("italic") && "bg-muted")}
            aria-label={tb("italic")}
          >
            <Italic className="h-4 w-4" />
          </Button>
        </IconTooltip>
        <IconTooltip label={tb("underline")}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            disabled={!editor.can().chain().focus().toggleUnderline().run()}
            className={cn(editor.isActive("underline") && "bg-muted")}
            aria-label={tb("underline")}
          >
            <UnderlineIcon className="h-4 w-4" />
          </Button>
        </IconTooltip>
        <IconTooltip label={tb("strike")}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().toggleStrike().run()}
            disabled={!editor.can().chain().focus().toggleStrike().run()}
            className={cn(editor.isActive("strike") && "bg-muted")}
            aria-label={tb("strike")}
          >
            <Strikethrough className="h-4 w-4" />
          </Button>
        </IconTooltip>

        <Separator orientation="vertical" className="h-6" />

        {/* Headings */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <span className="inline-flex">
              <IconTooltip label={tb("heading")}>
                <Button type="button" variant="ghost" size="sm" aria-label={tb("heading")}>
                  {editor.isActive("heading", { level: 1 }) ? (
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

        {/* Lists */}
        <IconTooltip label={tb("bulletList")}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={cn(editor.isActive("bulletList") && "bg-muted")}
            aria-label={tb("bulletList")}
          >
            <List className="h-4 w-4" />
          </Button>
        </IconTooltip>
        <IconTooltip label={tb("numberedList")}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={cn(editor.isActive("orderedList") && "bg-muted")}
            aria-label={tb("numberedList")}
          >
            <ListOrdered className="h-4 w-4" />
          </Button>
        </IconTooltip>

        <Separator orientation="vertical" className="h-6" />

        {/* Alignment */}
        <IconTooltip label={tb("alignLeft")}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().setTextAlign("left").run()}
            className={cn(editor.isActive({ textAlign: "left" }) && "bg-muted")}
            aria-label={tb("alignLeft")}
          >
            <AlignLeft className="h-4 w-4" />
          </Button>
        </IconTooltip>
        <IconTooltip label={tb("alignCenter")}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().setTextAlign("center").run()}
            className={cn(editor.isActive({ textAlign: "center" }) && "bg-muted")}
            aria-label={tb("alignCenter")}
          >
            <AlignCenter className="h-4 w-4" />
          </Button>
        </IconTooltip>
        <IconTooltip label={tb("alignRight")}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().setTextAlign("right").run()}
            className={cn(editor.isActive({ textAlign: "right" }) && "bg-muted")}
            aria-label={tb("alignRight")}
          >
            <AlignRight className="h-4 w-4" />
          </Button>
        </IconTooltip>
        <IconTooltip label={tb("justify")}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().setTextAlign("justify").run()}
            className={cn(editor.isActive({ textAlign: "justify" }) && "bg-muted")}
            aria-label={tb("justify")}
          >
            <AlignJustify className="h-4 w-4" />
          </Button>
        </IconTooltip>

        <Separator orientation="vertical" className="h-6" />

        {/* Link */}
        <IconTooltip label={tb("link")}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={setLink}
            className={cn(editor.isActive("link") && "bg-muted")}
            aria-label={tb("link")}
          >
            <LinkIcon className="h-4 w-4" />
          </Button>
        </IconTooltip>

        <Separator orientation="vertical" className="h-6" />

        {/* Undo/Redo */}
        <IconTooltip label={tb("undo")}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().chain().focus().undo().run()}
            aria-label={tb("undo")}
          >
            <Undo className="h-4 w-4" />
          </Button>
        </IconTooltip>
        <IconTooltip label={tb("redo")}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().chain().focus().redo().run()}
            aria-label={tb("redo")}
          >
            <Redo className="h-4 w-4" />
          </Button>
        </IconTooltip>
      </div>
      <EditorContent editor={editor} />
    </div>
  )
}
