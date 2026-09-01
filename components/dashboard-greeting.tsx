"use client"

import { useI18n } from "@/lib/i18n/use-i18n"
import { greetingPeriodFromHour } from "@/lib/profile/time-of-day"

type Props = {
  name?: string | null
}

export function DashboardGreeting({ name }: Props) {
  const { t } = useI18n()
  const period = greetingPeriodFromHour(new Date().getHours())
  const greeting = name
    ? t(`dashboard.welcome.${period}`, undefined, { name })
    : t(`dashboard.welcome.${period}Fallback`)

  return (
    <h1 className="text-3xl font-semibold tracking-tight" suppressHydrationWarning>
      {greeting}
    </h1>
  )
}
