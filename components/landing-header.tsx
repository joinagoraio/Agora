"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { User } from "lucide-react"

import { useI18n } from "@/lib/i18n/use-i18n"
import { IconTooltip } from "@/components/icon-tooltip"

export function LandingHeader() {
  const [showLogo, setShowLogo] = useState(false)
  const { t } = useI18n()

  useEffect(() => {
    const hero = document.querySelector("[data-hero]")
    if (!hero) {
      setShowLogo(true)
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        setShowLogo(!entry.isIntersecting)
      },
      { threshold: 0.2 }
    )

    observer.observe(hero)

    return () => observer.disconnect()
  }, [])

  return (
    <header className="sticky top-0 z-50 bg-white backdrop-blur supports-[backdrop-filter]:bg-white/90">
      <div className="flex h-16 w-full items-center justify-between px-6">
        <div
          className={`flex w-24 items-center justify-center transition-opacity duration-300 ${
            showLogo ? "opacity-100" : "opacity-0"
          }`}
          aria-hidden={!showLogo}
        >
          <Image src="/logo.svg" alt="AGORA" width={695} height={136} className="w-24 h-auto" priority />
        </div>
        <nav className="hidden items-center gap-4 md:flex">
          <IconTooltip label={t("common.navigation.signIn")}>
            <Link
              href="/auth/login"
              aria-label={t("common.navigation.signIn")}
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              <User className="h-5 w-5" />
            </Link>
          </IconTooltip>
        </nav>
      </div>
    </header>
  )
}
