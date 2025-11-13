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

interface RichTextEditorProps {
  content: string
  onChange: (content: string) => void
  placeholder?: string
  className?: string
}

export function RichTextEditor({ content, onChange, placeholder, className }: RichTextEditorProps) {
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
          editor.commands.setContent(normalizedContent || "<p></p>", false)
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
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleBold().run()}
          disabled={!editor.can().chain().focus().toggleBold().run()}
          className={cn(editor.isActive("bold") && "bg-muted")}
        >
          <Bold className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          disabled={!editor.can().chain().focus().toggleItalic().run()}
          className={cn(editor.isActive("italic") && "bg-muted")}
        >
          <Italic className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          disabled={!editor.can().chain().focus().toggleUnderline().run()}
          className={cn(editor.isActive("underline") && "bg-muted")}
        >
          <UnderlineIcon className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleStrike().run()}
          disabled={!editor.can().chain().focus().toggleStrike().run()}
          className={cn(editor.isActive("strike") && "bg-muted")}
        >
          <Strikethrough className="h-4 w-4" />
        </Button>

        <Separator orientation="vertical" className="h-6" />

        {/* Headings */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="sm">
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
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={cn(editor.isActive("bulletList") && "bg-muted")}
        >
          <List className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={cn(editor.isActive("orderedList") && "bg-muted")}
        >
          <ListOrdered className="h-4 w-4" />
        </Button>

        <Separator orientation="vertical" className="h-6" />

        {/* Alignment */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
          className={cn(editor.isActive({ textAlign: "left" }) && "bg-muted")}
        >
          <AlignLeft className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
          className={cn(editor.isActive({ textAlign: "center" }) && "bg-muted")}
        >
          <AlignCenter className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
          className={cn(editor.isActive({ textAlign: "right" }) && "bg-muted")}
        >
          <AlignRight className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().setTextAlign("justify").run()}
          className={cn(editor.isActive({ textAlign: "justify" }) && "bg-muted")}
        >
          <AlignJustify className="h-4 w-4" />
        </Button>

        <Separator orientation="vertical" className="h-6" />

        {/* Link */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={setLink}
          className={cn(editor.isActive("link") && "bg-muted")}
        >
          <LinkIcon className="h-4 w-4" />
        </Button>

        <Separator orientation="vertical" className="h-6" />

        {/* Undo/Redo */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().chain().focus().undo().run()}
        >
          <Undo className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().chain().focus().redo().run()}
        >
          <Redo className="h-4 w-4" />
        </Button>
      </div>
      <EditorContent editor={editor} />
    </div>
  )
}
