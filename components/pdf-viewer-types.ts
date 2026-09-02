export type ViewerFitMode = "width" | "height"

export const ZOOM_PRESETS = [0.5, 0.75, 0.9, 1, 1.25, 1.5, 2]

export interface ViewerControls {
  pageNumber: number
  numPages: number | null
  scale: number
  minScale?: number
  maxScale?: number
  fitMode?: ViewerFitMode | null
  changePage: (offset: number) => void
  goToPage: (page: number) => void
  zoomIn: () => void
  zoomOut: () => void
  rotate: () => void
  fitToWidth?: () => void
  fitToHeight?: () => void
  setScale?: (value: number) => void
}

export interface Highlight {
  id: string
  pageNumber: number
  textSpan: { start: number; end: number }
  coordinates?: { x: number; y: number; width: number; height: number }
  color?: string
  quote?: string
}
