import Link from "next/link"
import Image from "next/image"
import { ArrowRight, Search, MessageSquare, Database, Users, Shield, Zap } from "lucide-react"

import { Button } from "@/components/ui/button"
import { LandingHeader } from "@/components/landing-header"
import { getServerTranslator } from "@/lib/i18n/server"

export default async function HomePage() {
  const { t } = await getServerTranslator()

  const stats = [
    { value: "10x", label: t("landing.stats.speed") },
    { value: "100%", label: t("landing.stats.accuracy") },
    { value: "24/7", label: t("landing.stats.availability") },
  ]

  const features = [
    {
      icon: Database,
      title: t("landing.features.connectors.title"),
      description: t("landing.features.connectors.description"),
    },
    {
      icon: MessageSquare,
      title: t("landing.features.assistant.title"),
      description: t("landing.features.assistant.description"),
    },
    {
      icon: Search,
      title: t("landing.features.search.title"),
      description: t("landing.features.search.description"),
    },
    {
      icon: Users,
      title: t("landing.features.collaboration.title"),
      description: t("landing.features.collaboration.description"),
    },
    {
      icon: Shield,
      title: t("landing.features.security.title"),
      description: t("landing.features.security.description"),
    },
    {
      icon: Zap,
      title: t("landing.features.performance.title"),
      description: t("landing.features.performance.description"),
    },
  ]

  const steps = [
    {
      label: "1",
      title: t("landing.howItWorks.steps.connect.title"),
      description: t("landing.howItWorks.steps.connect.description"),
    },
    {
      label: "2",
      title: t("landing.howItWorks.steps.organize.title"),
      description: t("landing.howItWorks.steps.organize.description"),
    },
    {
      label: "3",
      title: t("landing.howItWorks.steps.ask.title"),
      description: t("landing.howItWorks.steps.ask.description"),
    },
  ]

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-white via-neutral-100 to-white">
      {/* Header */}
      <LandingHeader />

      {/* Hero Section */}
      <section
        data-hero
        className="relative mx-auto flex w-full max-w-6xl flex-col items-center justify-center gap-0 px-4 pb-12 pt-6 text-center lg:px-6 lg:pb-20 lg:pt-12"
      >
        <div className="flex flex-col items-center gap-6 max-w-4xl">
          <Image
            src="/logo.svg"
            alt={t("common.appName")}
            width={695}
            height={136}
            className="w-[520px] max-w-full h-auto pb-4"
            priority
          />
          <div className="inline-flex items-center justify-center">
            <span className="rounded-full border border-border px-4 py-1.5 text-sm font-medium text-muted-foreground">
              {t("landing.hero.badge")}
            </span>
          </div>
          <h1 className="text-balance text-5xl font-bold tracking-tight lg:text-7xl">
            <span className="bg-gradient-to-b from-foreground via-foreground to-muted-foreground bg-clip-text text-transparent">
              {t("landing.hero.headingLineOne")}
            </span>
            <span className="block text-foreground">{t("landing.hero.headingLineTwo")}</span>
          </h1>
          <p className="text-balance text-xl text-muted-foreground lg:text-2xl max-w-3xl mx-auto leading-relaxed">
            {t("landing.hero.description")}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-4">
          <Button
            asChild
            size="lg"
            className="h-12 px-8 text-base bg-foreground text-background hover:bg-foreground/90"
          >
            <Link href="/auth/sign-up">
              {t("landing.hero.primaryCta")}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            size="lg"
            className="h-12 px-8 text-base border-border bg-transparent text-foreground hover:bg-muted"
          >
            <Link href="#how-it-works">{t("landing.hero.secondaryCta")}</Link>
          </Button>
        </div>

        {/* Stats */}
        <div className="mt-16 grid w-full max-w-5xl gap-8 sm:grid-cols-3 border-t border-border pt-16">
          {stats.map((stat) => (
            <div key={stat.label} className="flex flex-col items-center gap-2">
              <div className="text-4xl font-bold">{stat.value}</div>
              <div className="text-sm text-muted-foreground">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="mx-auto w-full max-w-6xl px-6 py-24 lg:py-32">
        <div className="flex flex-col items-center gap-4 text-center mb-16">
          <h2 className="text-balance text-4xl font-bold tracking-tight lg:text-5xl">
            {t("landing.overview.title")}
          </h2>
          <p className="text-balance text-lg text-muted-foreground max-w-2xl">
            {t("landing.overview.description")}
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-3">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="flex flex-col gap-4 rounded-xl border bg-card p-8 transition-colors hover:border-foreground/40"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted text-foreground">
                <feature.icon className="h-6 w-6" />
              </div>
              <h3 className="text-2xl font-semibold">{feature.title}</h3>
              <p className="text-muted-foreground leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="mx-auto w-full max-w-6xl border-t border-border px-6 py-24 lg:py-32">
        <div className="flex flex-col items-center gap-4 text-center mb-16">
          <h2 className="text-balance text-4xl font-bold tracking-tight lg:text-5xl">
            {t("landing.howItWorks.title")}
          </h2>
          <p className="text-balance text-lg text-muted-foreground max-w-2xl">
            {t("landing.howItWorks.description")}
          </p>
        </div>

        <div className="grid gap-12 lg:grid-cols-3">
          {steps.map((step) => (
            <div key={step.label} className="flex flex-col items-center gap-4 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-foreground text-background text-2xl font-bold">
                {step.label}
              </div>
              <h3 className="text-2xl font-semibold">{step.title}</h3>
              <p className="text-muted-foreground leading-relaxed">{step.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA Section */}
      <section className="mx-auto w-full max-w-6xl px-6 py-24 lg:py-32">
        <div className="flex flex-col items-center gap-8 rounded-2xl border bg-card p-12 text-center lg:p-20">
          <h2 className="text-balance text-4xl font-bold tracking-tight lg:text-5xl max-w-3xl">
            {t("landing.cta.title")}
          </h2>
          <p className="text-balance text-lg text-muted-foreground max-w-2xl">
            {t("landing.cta.description")}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Button
              asChild
              size="lg"
              className="h-12 px-8 text-base bg-foreground text-background hover:bg-foreground/90"
            >
              <Link href="/auth/sign-up">
                {t("landing.cta.primaryCta")}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="h-12 px-8 text-base border-border bg-transparent text-foreground hover:bg-muted"
            >
              <Link href="/auth/login">{t("landing.cta.secondaryCta")}</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="mx-auto w-full max-w-6xl px-6 py-12">
          <div className="grid gap-8 lg:grid-cols-4">
            <div className="flex flex-col gap-4">
              <div className="flex items-center">
                <Image src="/logo.svg" alt={t("common.appName")} width={695} height={136} className="w-24 h-auto" />
              </div>
              <p className="text-sm text-muted-foreground">
                {t("landing.footer.description")}
              </p>
            </div>

            <div className="flex flex-col gap-4">
              <h4 className="font-semibold">{t("common.navigation.product")}</h4>
              <Link href="#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                {t("common.navigation.features")}
              </Link>
              <Link
                href="#how-it-works"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {t("common.navigation.howItWorks")}
              </Link>
              <Link
                href="/auth/sign-up"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {t("common.navigation.pricing")}
              </Link>
            </div>

            <div className="flex flex-col gap-4">
              <h4 className="font-semibold">{t("common.navigation.resources")}</h4>
              <Link
                href="/auth/login"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {t("common.navigation.docs")}
              </Link>
              <Link
                href="/auth/login"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {t("common.navigation.support")}
              </Link>
              <Link
                href="/auth/login"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {t("common.navigation.blog")}
              </Link>
            </div>

            <div className="flex flex-col gap-4">
              <h4 className="font-semibold">{t("common.navigation.company")}</h4>
              <Link
                href="/auth/login"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {t("common.navigation.about")}
              </Link>
              <Link
                href="/auth/login"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {t("common.navigation.contact")}
              </Link>
              <Link
                href="/auth/login"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {t("common.navigation.privacy")}
              </Link>
            </div>
          </div>

          <div className="mt-12 border-t border-border pt-8 text-center text-sm text-muted-foreground">
            <p>&copy; 2025 {t("common.appName")}. {t("landing.footer.copyright")}</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
