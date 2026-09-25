"use client"

import { BookOpen, ChevronDown, Eye, FileText, Focus, GalleryVertical, MessageSquare, PanelTop, PencilLine, Redo, Search, Undo, ZoomIn, ZoomOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { IconTooltip } from "@/components/icon-tooltip"
import { useOptionalProgrammeTextHistory } from "@/components/programme-text-history"
import { useI18n } from "@/lib/i18n/use-i18n"
import {
  PROGRAMME_ZOOM_PRESETS,
  stepProgrammeScale,
  type ProgrammeDocumentLayout,
  type ProgrammeDocumentLayoutPatch,
} from "@/lib/programme/document-layout"
import {
  PROGRAMME_CHROME_SIZES,
  PROGRAMME_PAGE_NUMBER_POSITIONS,
  type ProgrammeChromeSize,
  type ProgrammePageNumberPosition,
} from "@/lib/programme/page-chrome"
import { toggleFocusChapterId, type ProgrammeDocumentMode } from "@/lib/programme/document-mode"
import { cn } from "@/lib/utils"

type WritableChapter = { id: string; title: string }

type Props = {
  isKnowledgeView: boolean
  layout: ProgrammeDocumentLayout
  onLayoutChange: (patch: ProgrammeDocumentLayoutPatch) => void
  documentMode: ProgrammeDocumentMode
  onDocumentModeChange: (mode: ProgrammeDocumentMode) => void
  onViewChange: (view: "document" | "knowledge") => void
  canWrite: boolean
  writableChapters: WritableChapter[]
  focusChapterIds: string[]
  onFocusChapterIdsChange: (ids: string[]) => void
  findCommonNotes?: { label: string; disabled?: boolean; onClick: () => void }
  compact?: boolean
}

function Divider() {
  return <span className="mx-1 h-5 w-px shrink-0 bg-border" aria-hidden />
}

export function ProgrammeDocumentChrome({
  isKnowledgeView,
  layout,
  onLayoutChange,
  documentMode,
  onDocumentModeChange,
  onViewChange,
  canWrite,
  writableChapters,
  focusChapterIds,
  onFocusChapterIdsChange,
  findCommonNotes,
  compact = false,
}: Props) {
  const { t } = useI18n()
  const textHistory = useOptionalProgrammeTextHistory()
  const minScale = PROGRAMME_ZOOM_PRESETS[0]
  const maxScale = PROGRAMME_ZOOM_PRESETS[PROGRAMME_ZOOM_PRESETS.length - 1]
  const canWriteText = !isKnowledgeView && documentMode !== "read"
  const buttonSize = compact ? "icon-sm" : "icon"
  const iconClass = compact ? "h-4 w-4" : "h-5 w-5"
  const checkedFocusIds =
    focusChapterIds.length > 0
      ? focusChapterIds
      : writableChapters.map((chapter) => chapter.id)

  return (
    <div className={cn("flex shrink-0 items-center", compact ? "justify-start" : "justify-end")}>
      {!isKnowledgeView ? (
        <>
          {canWriteText ? (
            <>
              <div className="flex items-center">
                <IconTooltip label={t("workspace.programme.undo")}>
                  <Button
                    type="button"
                    variant="ghost"
                    size={buttonSize}
                    disabled={!textHistory?.canUndo}
                    aria-label={t("workspace.programme.undo")}
                    onClick={() => textHistory?.undo()}
                  >
                    <Undo className={iconClass} />
                  </Button>
                </IconTooltip>
                <IconTooltip label={t("workspace.programme.redo")}>
                  <Button
                    type="button"
                    variant="ghost"
                    size={buttonSize}
                    disabled={!textHistory?.canRedo}
                    aria-label={t("workspace.programme.redo")}
                    onClick={() => textHistory?.redo()}
                  >
                    <Redo className={iconClass} />
                  </Button>
                </IconTooltip>
              </div>
              <Divider />
            </>
          ) : null}
          <IconTooltip label={layout.showComments ? t("workspace.programme.hideComments") : t("workspace.programme.showComments")}>
            <Button
              type="button"
              variant={layout.showComments ? "secondary" : "ghost"}
              size={buttonSize}
              aria-label={layout.showComments ? t("workspace.programme.hideComments") : t("workspace.programme.showComments")}
              onClick={() => onLayoutChange({ showComments: !layout.showComments })}
              data-guidance-target="show-comments"
              data-guidance-state={layout.showComments ? "on" : "off"}
            >
              <MessageSquare className={iconClass} />
            </Button>
          </IconTooltip>
          {findCommonNotes ? (
            <IconTooltip label={findCommonNotes.label}>
              <Button
                type="button"
                variant="ghost"
                size={buttonSize}
                aria-label={findCommonNotes.label}
                disabled={findCommonNotes.disabled}
                onClick={findCommonNotes.onClick}
                data-guidance-target="find-common-notes"
              >
                <Search className={iconClass} />
              </Button>
            </IconTooltip>
          ) : null}
          <Divider />
          <div className="flex items-center" role="group" aria-label={t("workspace.programme.layoutAria")}>
            <IconTooltip label={t("workspace.programme.layoutPages")}>
              <Button
                type="button"
                variant={layout.paged ? "secondary" : "ghost"}
                size={buttonSize}
                aria-label={t("workspace.programme.layoutPages")}
                aria-pressed={layout.paged}
                onClick={() => onLayoutChange({ paged: !layout.paged })}
              >
                <GalleryVertical className={iconClass} />
              </Button>
            </IconTooltip>
            {layout.paged ? (
              <DropdownMenu>
                <IconTooltip label={t("workspace.programme.pageChrome")}>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size={buttonSize}
                      aria-label={t("workspace.programme.pageChromeAria")}
                    >
                      <PanelTop className={iconClass} />
                    </Button>
                  </DropdownMenuTrigger>
                </IconTooltip>
                <DropdownMenuContent align="end" className="w-80 p-3" onCloseAutoFocus={(event) => event.preventDefault()}>
                  <div className="space-y-3" onPointerDown={(event) => event.stopPropagation()}>
                    <div className="flex items-center justify-between gap-3">
                      <Label htmlFor="programme-page-header" className="text-xs">
                        {t("workspace.programme.pageChromeHeader")}
                      </Label>
                      <Switch
                        id="programme-page-header"
                        checked={layout.pageChrome.showHeader}
                        onCheckedChange={(checked) => onLayoutChange({ pageChrome: { showHeader: checked } })}
                      />
                    </div>
                    <Input
                      value={layout.pageChrome.headerText}
                      placeholder={t("workspace.programme.pageChromeHeaderPlaceholder")}
                      disabled={!layout.pageChrome.showHeader}
                      aria-label={t("workspace.programme.pageChromeHeader")}
                      onChange={(event) => onLayoutChange({ pageChrome: { headerText: event.target.value } })}
                    />
                    <div className="flex items-center justify-between gap-3">
                      <Label htmlFor="programme-page-footer" className="text-xs">
                        {t("workspace.programme.pageChromeFooter")}
                      </Label>
                      <Switch
                        id="programme-page-footer"
                        checked={layout.pageChrome.showFooter}
                        onCheckedChange={(checked) => onLayoutChange({ pageChrome: { showFooter: checked } })}
                      />
                    </div>
                    <Input
                      value={layout.pageChrome.footerText}
                      placeholder={t("workspace.programme.pageChromeFooterPlaceholder")}
                      disabled={!layout.pageChrome.showFooter}
                      aria-label={t("workspace.programme.pageChromeFooter")}
                      onChange={(event) => onLayoutChange({ pageChrome: { footerText: event.target.value } })}
                    />
                    <div className="space-y-1">
                      <p className="text-xs font-medium">{t("workspace.programme.pageChromeNumbers")}</p>
                      <div className="flex flex-wrap gap-1">
                        {PROGRAMME_PAGE_NUMBER_POSITIONS.map((position) => (
                          <Button
                            key={position}
                            type="button"
                            size="sm"
                            variant={layout.pageChrome.pageNumbers === position ? "secondary" : "ghost"}
                            className="h-7 px-2 text-xs"
                            aria-pressed={layout.pageChrome.pageNumbers === position}
                            onClick={() =>
                              onLayoutChange({ pageChrome: { pageNumbers: position as ProgrammePageNumberPosition } })
                            }
                          >
                            {t(`workspace.programme.pageChromeNumber.${position}`)}
                          </Button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium">{t("workspace.programme.pageChromeSize")}</p>
                      <div className="flex flex-wrap gap-1">
                        {PROGRAMME_CHROME_SIZES.map((size) => (
                          <Button
                            key={size}
                            type="button"
                            size="sm"
                            variant={layout.pageChrome.size === size ? "secondary" : "ghost"}
                            className="h-7 px-2 text-xs"
                            aria-pressed={layout.pageChrome.size === size}
                            onClick={() => onLayoutChange({ pageChrome: { size: size as ProgrammeChromeSize } })}
                          >
                            {t(`workspace.programme.pageChromeSizeOption.${size}`)}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
          <Divider />
          <DropdownMenu>
            <IconTooltip label={t("workspace.programme.zoom")}>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size={buttonSize} aria-label={t("workspace.programme.zoom")}>
                  <ZoomIn className={iconClass} />
                </Button>
              </DropdownMenuTrigger>
            </IconTooltip>
            <DropdownMenuContent align="end" className="flex w-auto min-w-0 items-center p-1">
              <DropdownMenuItem
                className="px-2"
                disabled={layout.scale <= minScale}
                aria-label={t("workspace.programme.zoomOut")}
                onSelect={(event) => {
                  event.preventDefault()
                  onLayoutChange({ scale: stepProgrammeScale(layout.scale, -1) })
                }}
              >
                <ZoomOut className="h-4 w-4" />
              </DropdownMenuItem>
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="focus:bg-accent focus:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground flex cursor-pointer items-center justify-center gap-1 rounded-sm px-2 py-1.5 text-sm tabular-nums outline-hidden select-none"
                  >
                    {Math.round(layout.scale * 100)}%
                    <ChevronDown className="size-4 opacity-50" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="bottom" align="center" className="w-fit min-w-0">
                  {PROGRAMME_ZOOM_PRESETS.map((preset) => (
                    <DropdownMenuItem key={preset} onSelect={() => onLayoutChange({ scale: preset })}>
                      {Math.round(preset * 100)}%
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenuItem
                className="px-2"
                disabled={layout.scale >= maxScale}
                aria-label={t("workspace.programme.zoomIn")}
                onSelect={(event) => {
                  event.preventDefault()
                  onLayoutChange({ scale: stepProgrammeScale(layout.scale, 1) })
                }}
              >
                <ZoomIn className="h-4 w-4" />
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Divider />
          <div className="flex items-center" role="tablist" aria-label={t("workspace.programme.modesAria")}>
            <IconTooltip label={t("workspace.programme.modes.read")}>
              <Button
                type="button"
                size={buttonSize}
                variant={documentMode === "read" ? "secondary" : "ghost"}
                aria-label={t("workspace.programme.modes.read")}
                aria-pressed={documentMode === "read"}
                onClick={() => onDocumentModeChange("read")}
              >
                <Eye className={iconClass} />
              </Button>
            </IconTooltip>
            <IconTooltip label={t("workspace.programme.modes.edit")}>
              <Button
                type="button"
                size={buttonSize}
                variant={documentMode === "edit" ? "secondary" : "ghost"}
                disabled={!canWrite}
                aria-label={t("workspace.programme.modes.edit")}
                aria-pressed={documentMode === "edit"}
                onClick={() => onDocumentModeChange("edit")}
              >
                <PencilLine className={iconClass} />
              </Button>
            </IconTooltip>
            <IconTooltip label={t("workspace.programme.modes.focus")}>
              <Button
                type="button"
                size={buttonSize}
                variant={documentMode === "focus" ? "secondary" : "ghost"}
                disabled={!canWrite}
                aria-label={t("workspace.programme.modes.focus")}
                aria-pressed={documentMode === "focus"}
                onClick={() => onDocumentModeChange("focus")}
              >
                <Focus className={iconClass} />
              </Button>
            </IconTooltip>
            {writableChapters.length > 1 ? (
              <DropdownMenu>
                <IconTooltip label={t("workspace.programme.focusChapters")}>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      size={buttonSize}
                      variant={documentMode === "focus" ? "secondary" : "ghost"}
                      disabled={!canWrite}
                      aria-label={t("workspace.programme.focusChaptersAria")}
                    >
                      <ChevronDown className={iconClass} />
                    </Button>
                  </DropdownMenuTrigger>
                </IconTooltip>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuLabel>{t("workspace.programme.focusChapters")}</DropdownMenuLabel>
                  {writableChapters.map((chapter) => (
                    <DropdownMenuCheckboxItem
                      key={chapter.id}
                      checked={checkedFocusIds.includes(chapter.id)}
                      onSelect={(event) => {
                        event.preventDefault()
                        onFocusChapterIdsChange(
                          toggleFocusChapterId(
                            checkedFocusIds,
                            chapter.id,
                            !checkedFocusIds.includes(chapter.id),
                          ),
                        )
                      }}
                    >
                      {chapter.title}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
          <Divider />
        </>
      ) : null}
      <div className="flex items-center" role="tablist" aria-label={t("workspace.programme.viewsAria")}>
        <IconTooltip label={t("workspace.programme.views.document")}>
          <Button
            type="button"
            size={buttonSize}
            variant={!isKnowledgeView ? "secondary" : "ghost"}
            aria-label={t("workspace.programme.views.document")}
            aria-pressed={!isKnowledgeView}
            onClick={() => onViewChange("document")}
          >
            <FileText className={iconClass} />
          </Button>
        </IconTooltip>
        <IconTooltip label={t("workspace.programme.views.knowledge")}>
          <Button
            type="button"
            size={buttonSize}
            variant={isKnowledgeView ? "secondary" : "ghost"}
            aria-label={t("workspace.programme.views.knowledge")}
            aria-pressed={isKnowledgeView}
            onClick={() => onViewChange("knowledge")}
          >
            <BookOpen className={iconClass} />
          </Button>
        </IconTooltip>
      </div>
    </div>
  )
}
