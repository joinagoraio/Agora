"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { UserAvatar } from "@/components/user-avatar"
import { useI18n } from "@/lib/i18n/use-i18n"
import { updateOwnProfile, uploadOwnAvatar } from "@/lib/actions/profile"
import { isPlaceholderProfileName, notifyProfileUpdated } from "@/lib/profile/display-name"

type Props = {
  open: boolean
  initialName: string
  email: string | null
  avatarUrl: string | null
}

export function ProfileSetupDialog({ open, initialName, email, avatarUrl }: Props) {
  const { t } = useI18n()
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState(initialName)
  const [photoUrl, setPhotoUrl] = useState(avatarUrl)
  const [pending, startTransition] = useTransition()
  const canSave = name.trim().length >= 2 && !isPlaceholderProfileName(name, email)

  return (
    <Dialog open={open} onOpenChange={() => undefined}>
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{t("profile.setup.title")}</DialogTitle>
          <DialogDescription>{t("profile.setup.body")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <UserAvatar name={name || email} url={photoUrl} className="h-14 w-14 text-sm" />
            <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => fileRef.current?.click()}>
              {t("profile.account.photoChange")}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ""
                if (!file) return
                const preview = URL.createObjectURL(file)
                setPhotoUrl(preview)
                const data = new FormData()
                data.set("file", file)
                startTransition(async () => {
                  const result = await uploadOwnAvatar(data)
                  if (result.data?.avatarUrl) {
                    setPhotoUrl(result.data.avatarUrl)
                    notifyProfileUpdated()
                    window.setTimeout(() => URL.revokeObjectURL(preview), 1500)
                  } else {
                    URL.revokeObjectURL(preview)
                    setPhotoUrl(avatarUrl)
                  }
                })
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="setup-name">{t("profile.account.nameLabel")}</Label>
            <Input
              id="setup-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("profile.account.namePlaceholder")}
            />
          </div>
          <div className="flex gap-2">
            <Button
              className="flex-1"
              disabled={pending || !canSave}
              onClick={() =>
                startTransition(async () => {
                  await updateOwnProfile({ fullName: name })
                  notifyProfileUpdated()
                  router.refresh()
                })
              }
            >
              {t("profile.setup.save")}
            </Button>
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await updateOwnProfile({ dismissSetup: true })
                  router.refresh()
                })
              }
            >
              {t("profile.setup.skip")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
