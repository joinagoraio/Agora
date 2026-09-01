"use client"

import type React from "react"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createSpace } from "@/lib/actions/space"
import { Plus } from "lucide-react"
import { toast } from "sonner"
import { useI18n } from "@/lib/i18n/use-i18n"
import { IconTooltip } from "@/components/icon-tooltip"

export function CreateSpaceDialog({ variant = "button" }: { variant?: "button" | "icon" }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()
  const { t } = useI18n()
  const triggerLabel = t("space.dashboard.createSpace.trigger")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName) {
      setError(t("space.dashboard.createSpace.errorRequired"))
      return
    }

    setIsLoading(true)
    setError(null)

    const result = await createSpace(trimmedName)

    if (result.error) {
      setError(result.error)
      toast.error(t("space.dashboard.createSpace.toastError"), {
        description: result.error,
      })
      setIsLoading(false)
    } else {
      setOpen(false)
      setName("")
      setIsLoading(false)
      toast.success(t("space.dashboard.createSpace.toastSuccess"), {
        description: t("space.dashboard.createSpace.toastSuccessDescription", undefined, {
          name: result.data?.name || trimmedName,
        }),
      })
      router.push(`/spaces/${result.data?.id}`)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {variant === "icon" ? (
        <IconTooltip label={triggerLabel}>
          <DialogTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-5 rounded-full [&_svg]:size-3"
              aria-label={triggerLabel}
            >
              <Plus className="size-3" />
            </Button>
          </DialogTrigger>
        </IconTooltip>
      ) : (
        <DialogTrigger asChild>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            {triggerLabel}
          </Button>
        </DialogTrigger>
      )}
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t("space.dashboard.createSpace.title")}</DialogTitle>
            <DialogDescription>{t("space.dashboard.createSpace.description")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t("space.dashboard.createSpace.nameLabel")}</Label>
              <Input
                id="name"
                placeholder={t("space.dashboard.createSpace.namePlaceholder")}
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isLoading}>
              {t("space.dashboard.createSpace.cancel")}
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? t("space.dashboard.createSpace.submitting") : t("space.dashboard.createSpace.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
