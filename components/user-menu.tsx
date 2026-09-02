"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { LogOut, User, UserCircle, Languages, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { createClient } from "@/lib/supabase/client"
import { useI18n } from "@/lib/i18n/use-i18n"
import { SUPPORTED_LANGUAGES, type SupportedLanguage, isSupportedLanguage } from "@/lib/i18n/config"
import { fetchCsrfToken } from "@/lib/utils/csrf"
import { UserAvatar } from "@/components/user-avatar"
import { IconTooltip } from "@/components/icon-tooltip"
import { PROFILE_UPDATED_EVENT } from "@/lib/profile/display-name"

export function UserMenu() {
  const router = useRouter()
  const [userName, setUserName] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  const [isUpdatingLanguage, setIsUpdatingLanguage] = useState(false)
  const { language, setLanguage: setLanguageFn, t } = useI18n()
  const setLanguage = setLanguageFn!

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    const fetchUser = async () => {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name, avatar_url")
          .eq("id", user.id)
          .maybeSingle()
        const name =
          profile?.full_name ||
          user.user_metadata?.full_name ||
          user.user_metadata?.name ||
          user.email?.split("@")[0] ||
          "User"
        setUserName(name)
        setUserEmail(user.email || null)
        setAvatarUrl(profile ? profile.avatar_url : user.user_metadata?.avatar_url || null)
      }
    }
    
    void fetchUser()
    window.addEventListener(PROFILE_UPDATED_EVENT, fetchUser)
    return () => window.removeEventListener(PROFILE_UPDATED_EVENT, fetchUser)
  }, [])

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/")
    router.refresh()
  }

  const handleProfileClick = () => {
    router.push("/profile")
  }

  const languageOptions = useMemo(
    () =>
      SUPPORTED_LANGUAGES.map((value) => ({
        value,
        label: value === "en" ? t("common.language.english") : t("common.language.dutch"),
      })),
    [t],
  )

  // Prevent hydration mismatch by only rendering Radix UI components on client
  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" disabled className="rounded-full">
        <User className="h-5 w-5" />
      </Button>
    )
  }

  const persistLanguagePreference = async (nextLanguage: SupportedLanguage) => {
    setIsUpdatingLanguage(true)
    try {
      const csrfToken = await fetchCsrfToken()
      if (!csrfToken) {
        throw new Error("CSRF token unavailable")
      }

      const response = await fetch("/api/profile/language", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({ language: nextLanguage }),
      })

      if (!response.ok) {
        throw new Error("Failed to update language")
      }

      const payload = (await response.json()) as { language?: string }
      if (payload.language && isSupportedLanguage(payload.language) && payload.language !== nextLanguage) {
        setLanguage(payload.language)
      }

      router.refresh()
      toast.success(t("common.language.success"))
    } catch (error) {
      toast.error(t("common.language.error"))
      throw error
    } finally {
      setIsUpdatingLanguage(false)
    }
  }

  const handleLanguageChange = async (nextValue: string) => {
    if (!isSupportedLanguage(nextValue) || nextValue === language || isUpdatingLanguage) {
      return
    }

    const previousLanguage = language
    setLanguage(nextValue)

    try {
      await persistLanguagePreference(nextValue)
    } catch {
      setLanguage(previousLanguage)
    }
  }

  return (
    <DropdownMenu>
      <IconTooltip label={t("common.tooltips.accountMenu")}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="rounded-full" aria-label={t("common.tooltips.accountMenu")}>
            <UserAvatar name={userName} url={avatarUrl} />
          </Button>
        </DropdownMenuTrigger>
      </IconTooltip>
        <DropdownMenuContent align="end" className="w-64">
        {userName && (
          <>
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">{userName}</p>
                {userEmail && (
                  <p className="text-xs leading-none text-muted-foreground">
                    {userEmail}
                  </p>
                )}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem onClick={handleProfileClick}>
          <UserCircle className="mr-2 h-3.5 w-3.5" />
          <span>{t("common.actions.profile")}</span>
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        <DropdownMenuLabel className="flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground">
          <span className="inline-flex items-center gap-2 text-[11px] font-semibold text-muted-foreground">
            <Languages className="h-3 w-3" />
            {t("common.language.label")}
          </span>
          {isUpdatingLanguage && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup value={language} onValueChange={handleLanguageChange}>
          {languageOptions.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />
        <DropdownMenuItem 
          onClick={handleSignOut}
          className="hover:!bg-destructive/10 hover:!text-destructive focus:!bg-destructive/10 focus:!text-destructive [&:hover_svg]:!text-destructive [&:focus_svg]:!text-destructive [&:hover_span]:!text-destructive [&:focus_span]:!text-destructive"
        >
          <LogOut className="mr-2 h-3.5 w-3.5" />
          <span>{t("common.actions.signOut")}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
