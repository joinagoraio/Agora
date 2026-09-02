"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { usePathname, useRouter } from "next/navigation"
import { Command } from "cmdk"
import { FolderKanban, Layers2, Star } from "lucide-react"

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { listJumpTargets, type JumpTarget } from "@/lib/actions/jump"
import { useI18n } from "@/lib/i18n/use-i18n"
import { cn } from "@/lib/utils"

type JumpPaletteContextValue = {
  open: boolean
  setOpen: (open: boolean) => void
}

const JumpPaletteContext = createContext<JumpPaletteContextValue | null>(null)

const GROUP_HEADING =
  "[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground"

function paletteFilter(value: string, search: string) {
  if (!search.trim()) return 1
  const haystack = value.toLowerCase()
  const terms = search.toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length > 0 && terms.every((term) => haystack.includes(term))) return 1
  return haystack.includes(search.toLowerCase()) ? 0.5 : 0
}

function isAppPath(pathname: string) {
  return (
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/spaces") ||
    pathname.startsWith("/workspaces") ||
    pathname.startsWith("/profile") ||
    pathname.startsWith("/settings")
  )
}

export function JumpPaletteProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const enabled = isAppPath(pathname)

  useEffect(() => {
    if (!enabled) {
      setOpen(false)
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) return
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setOpen((current) => !current)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [enabled])

  const value = useMemo(() => ({ open, setOpen }), [open])

  return (
    <JumpPaletteContext.Provider value={value}>
      {children}
      {enabled ? <JumpPaletteDialog /> : null}
    </JumpPaletteContext.Provider>
  )
}

function useJumpPalette() {
  const context = useContext(JumpPaletteContext)
  if (!context) {
    throw new Error("JumpPaletteDialog must be used within JumpPaletteProvider")
  }
  return context
}

function JumpPaletteDialog() {
  const { open, setOpen } = useJumpPalette()
  const { t } = useI18n()
  const router = useRouter()
  const [targets, setTargets] = useState<JumpTarget[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    void listJumpTargets().then((result) => {
      if (cancelled) return
      setTargets("data" in result ? result.data : [])
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [open])

  const goTo = useCallback(
    (href: string) => {
      setOpen(false)
      router.push(href)
    },
    [router, setOpen],
  )

  const pinned = targets.filter((target) => target.pinned)
  const programmes = targets.filter((target) => target.kind === "programme" && !target.pinned)
  const authorities = targets.filter((target) => target.kind === "authority" && !target.pinned)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[min(36rem,85vh)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">{t("common.jumpPalette.title")}</DialogTitle>
        <Command className="flex min-h-0 flex-1 flex-col" shouldFilter filter={paletteFilter}>
          <div className="flex items-center border-b px-4 py-4">
            <Command.Input
              placeholder={t("common.jumpPalette.placeholder")}
              className="h-auto w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <Command.List className="min-h-0 flex-1 overflow-y-auto p-1">
            <Command.Empty className="px-3 py-8 text-center text-sm text-muted-foreground">
              {loading ? t("common.jumpPalette.loading") : t("common.jumpPalette.empty")}
            </Command.Empty>
            {pinned.length > 0 && (
              <Command.Group heading={t("dashboard.pinned.title")} className={GROUP_HEADING}>
                {pinned.map((target) => (
                  <JumpItem key={`pinned-${target.kind}-${target.id}`} target={target} onSelect={goTo} favorite />
                ))}
              </Command.Group>
            )}
            {programmes.length > 0 && (
              <Command.Group heading={t("common.jumpPalette.programmes")} className={GROUP_HEADING}>
                {programmes.map((target) => (
                  <JumpItem key={`programme-${target.id}`} target={target} onSelect={goTo} />
                ))}
              </Command.Group>
            )}
            {authorities.length > 0 && (
              <Command.Group heading={t("common.jumpPalette.authorities")} className={GROUP_HEADING}>
                {authorities.map((target) => (
                  <JumpItem key={`authority-${target.id}`} target={target} onSelect={goTo} />
                ))}
              </Command.Group>
            )}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  )
}

function JumpItem({
  target,
  onSelect,
  favorite = false,
}: {
  target: JumpTarget
  onSelect: (href: string) => void
  favorite?: boolean
}) {
  const Icon = target.kind === "programme" ? FolderKanban : Layers2
  return (
    <Command.Item
      value={`${target.kind} ${target.name} ${target.subtitle ?? ""} ${target.id}`}
      onSelect={() => onSelect(target.href)}
      className={cn(
        "flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground",
      )}
    >
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{target.name}</span>
        {target.subtitle ? (
          <span className="block truncate text-xs text-muted-foreground">{target.subtitle}</span>
        ) : null}
      </span>
      {favorite ? <Star className="h-3.5 w-3.5 shrink-0 fill-current text-primary" /> : null}
    </Command.Item>
  )
}
