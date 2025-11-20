declare module "react-file-icon" {
  import type { ComponentType } from "react"

  export interface FileIconProps {
    extension?: string
    color?: string
    labelColor?: string
    pdfColor?: string
    radius?: number
    [key: string]: unknown
  }

  export const defaultStyles: Record<string, unknown>

  declare const FileIconComponent: ComponentType<FileIconProps>
  export { FileIconComponent as FileIcon }
  export default FileIconComponent
}

declare module "markdown-it" {
  import type MarkdownIt from "markdown-it/lib"

  const MarkdownItConstructor: typeof MarkdownIt
  export default MarkdownItConstructor
}

declare module "markdown-it-footnote" {
  const footnote: (md: any) => void
  export default footnote
}

declare module "*?url" {
  const url: string
  export default url
}

