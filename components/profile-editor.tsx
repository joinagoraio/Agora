"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Mail, Calendar } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { UserAvatar } from "@/components/user-avatar"
import { useI18n } from "@/lib/i18n/use-i18n"
import { updateOwnProfile, uploadOwnAvatar, removeOwnAvatar } from "@/lib/actions/profile"
import { notifyProfileUpdated } from "@/lib/profile/display-name"

type Props = {
  initialName: string
  email: string | null
  avatarUrl: string | null
  memberSince: string
}

export function ProfileEditor({ initialName, email, avatarUrl, memberSince }: Props) {
  const { t } = useI18n()
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const previewRef = useRef<string | null>(null)
  const [name, setName] = useState(initialName)
  const [photoUrl, setPhotoUrl] = useState(avatarUrl)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    setName(initialName)
  }, [initialName])

  useEffect(() => {
    if (previewRef.current) return
    setPhotoUrl(avatarUrl)
  }, [avatarUrl])

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("profile.account.title")}</CardTitle>
        <CardDescription>{t("profile.account.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center gap-4">
          <UserAvatar name={name} url={photoUrl} className="h-16 w-16 text-base" />
          <div className="space-y-1">
            <p className="text-sm font-medium">{t("profile.account.photoLabel")}</p>
            <p className="text-sm text-muted-foreground">{t("profile.account.photoHint")}</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => fileRef.current?.click()}>
                {t("profile.account.photoChange")}
              </Button>
              {photoUrl ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => {
                    startTransition(async () => {
                      const result = await removeOwnAvatar()
                      if (result.error) {
                        toast.error(result.error || t("profile.account.photoRemoveError"))
                        return
                      }
                      if (previewRef.current) {
                        URL.revokeObjectURL(previewRef.current)
                        previewRef.current = null
                      }
                      setPhotoUrl(null)
                      notifyProfileUpdated()
                      toast.success(t("profile.account.saved"))
                      router.refresh()
                    })
                  }}
                >
                  {t("profile.account.photoRemove")}
                </Button>
              ) : null}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ""
                if (!file) return
                if (previewRef.current) URL.revokeObjectURL(previewRef.current)
                const preview = URL.createObjectURL(file)
                previewRef.current = preview
                setPhotoUrl(preview)
                const data = new FormData()
                data.set("file", file)
                startTransition(async () => {
                  const result = await uploadOwnAvatar(data)
                  if (result.error || !result.data) {
                    if (previewRef.current) URL.revokeObjectURL(previewRef.current)
                    previewRef.current = null
                    setPhotoUrl(avatarUrl)
                    toast.error(result.error || t("profile.account.photoError"))
                    return
                  }
                  setPhotoUrl(result.data.avatarUrl)
                  const stalePreview = previewRef.current
                  previewRef.current = null
                  if (stalePreview) {
                    window.setTimeout(() => URL.revokeObjectURL(stalePreview), 1500)
                  }
                  notifyProfileUpdated()
                  toast.success(t("profile.account.saved"))
                  router.refresh()
                })
              }}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="profile-name">{t("profile.account.nameLabel")}</Label>
          <Input
            id="profile-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("profile.account.namePlaceholder")}
          />
        </div>

        {email && (
          <div className="flex items-center gap-3">
            <Mail className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">{t("profile.account.emailLabel")}</p>
              <p className="text-sm text-muted-foreground">{email}</p>
            </div>
          </div>
        )}

        <div className="flex items-center gap-3">
          <Calendar className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">{t("profile.account.memberSinceLabel")}</p>
            <p className="text-sm text-muted-foreground">{memberSince}</p>
          </div>
        </div>

        <Button
          disabled={pending || name.trim().length < 2}
          onClick={() =>
            startTransition(async () => {
              const result = await updateOwnProfile({ fullName: name })
              if (result.error) {
                toast.error(result.error || t("profile.account.saveError"))
                return
              }
              toast.success(t("profile.account.saved"))
              notifyProfileUpdated()
              router.refresh()
            })
          }
        >
          {pending ? t("profile.account.saving") : t("profile.account.save")}
        </Button>
      </CardContent>
    </Card>
  )
}
