"use client"

import { FileIcon } from "react-file-icon"
import { cn } from "@/lib/utils"
import { getDocumentFileExtension, type DocumentLike } from "@/lib/utils/document-files"
import { resolveFileIconAppearance } from "@/lib/utils/file-icon-appearance"

const SIZE_CLASS = {
  sm: "h-5 w-5",
  md: "h-8 w-8",
} as const

export function DocumentFileTypeIcon({
  document,
  extension,
  size = "md",
  className,
}: {
  document?: DocumentLike
  extension?: string
  size?: keyof typeof SIZE_CLASS
  className?: string
}) {
  const fileExtension = (extension || (document ? getDocumentFileExtension(document) : "file")).toLowerCase()
  const appearance = resolveFileIconAppearance(fileExtension)

  return (
    <div
      className={cn("flex shrink-0 items-center overflow-hidden [&>svg]:h-full [&>svg]:w-full", SIZE_CLASS[size], className)}
      aria-hidden
    >
      <FileIcon
        extension={fileExtension === "file" ? undefined : fileExtension}
        color={appearance.color}
        foldColor={appearance.foldColor}
        glyphColor={appearance.glyphColor}
        type={appearance.type}
        labelUppercase
        gradientOpacity={0.18}
      />
    </div>
  )
}
