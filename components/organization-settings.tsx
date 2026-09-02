"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, Upload, CheckCircle2, AlertCircle } from "lucide-react"
import { useRouter } from "next/navigation"
import { useI18n } from "@/lib/i18n/use-i18n"

interface OrganizationSettingsProps {
  space: {
    id: string
    name: string
    slug?: string
    logo_url?: string
    metadata?: Record<string, any>
  }
}

export function OrganizationSettings({ space }: OrganizationSettingsProps) {
  const router = useRouter()
  const { t } = useI18n()
  const [name, setName] = useState(space.name)
  const [logoUrl, setLogoUrl] = useState(space.logo_url || "")
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleSave = async () => {
    setIsSaving(true)
    setError(null)
    setSuccess(false)

    try {
      const response = await fetch("/api/tenants/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spaceId: space.id,
          name,
          logo_url: logoUrl || null,
        }),
      })

      const data = await response.json()

      if (data.error) {
        setError(data.error)
      } else {
        setSuccess(true)
        setTimeout(() => {
          setSuccess(false)
          router.refresh()
        }, 2000)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("space.settings.compliance.profile.title")}</CardTitle>
          <CardDescription>{t("space.settings.compliance.profile.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">{t("space.settings.compliance.profile.name")}</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("space.settings.compliance.profile.namePlaceholder")}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="logo">{t("space.settings.compliance.profile.logo")}</Label>
            <Input
              id="logo"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://example.com/logo.png"
            />
            <p className="text-xs text-muted-foreground">
              {t("space.settings.compliance.profile.logoHint")}
            </p>
          </div>

          {logoUrl && (
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 rounded border bg-muted flex items-center justify-center overflow-hidden">
                <img src={logoUrl} alt={t("space.settings.compliance.profile.logoPreview")} className="max-h-full max-w-full object-contain" />
              </div>
              <div className="text-sm text-muted-foreground">
                {t("space.settings.compliance.profile.logoPreview")}
              </div>
            </div>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>{t("space.settings.compliance.profile.saved")}</AlertDescription>
            </Alert>
          )}

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={isSaving || !name.trim()}>
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("space.settings.compliance.profile.saving")}
                </>
              ) : (
                <>{t("space.settings.compliance.profile.save")}</>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("space.settings.compliance.profile.ssoTitle")}</CardTitle>
          <CardDescription>{t("space.settings.compliance.profile.ssoDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertDescription>
              {t("space.settings.compliance.profile.ssoSoon")}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  )
}
