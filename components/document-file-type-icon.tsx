"use client"

import { FileIcon, defaultStyles } from "react-file-icon"
import { cn } from "@/lib/utils"
import { getDocumentFileExtension, type DocumentLike } from "@/lib/utils/document-files"

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
  const styles = defaultStyles[fileExtension] || {}

  return (
    <div
      className={cn(
        "flex shrink-0 items-center overflow-hidden [&>svg]:h-full [&>svg]:w-full [&>svg]:grayscale",
        SIZE_CLASS[size],
        className,
      )}
      aria-hidden
    >
      <FileIcon
        extension={fileExtension}
        {...styles}
        label={false}
        glyphColor="#fff"
        color="#6b7280"
      />
    </div>
  )
}
