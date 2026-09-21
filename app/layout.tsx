import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { ErrorBoundary } from "@/components/error-boundary"
import { JumpPaletteProvider } from "@/components/jump-palette"
import { AppToaster } from "@/components/app-toaster"
import { getServerDictionary } from "@/lib/i18n/server"
import { I18nClientProvider } from "@/components/providers/i18n-client-provider"
import { TooltipProvider } from "@/components/ui/tooltip"
import "./globals.css"

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
})
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
})

export const metadata: Metadata = {
  title: 'Agora',
  description: 'Collaborative research workbench for Agora teams.',
  generator: 'Agora',
  icons: {
    icon: [
      {
        url: '/logo.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/logo.svg',
  },
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const { language, messages } = await getServerDictionary()

  return (
    <html lang={language} className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className={`${geistSans.className} font-sans antialiased bg-white [font-variant-ligatures:none]`}>
        <I18nClientProvider initialLanguage={language} initialMessages={messages}>
          <TooltipProvider delayDuration={400}>
            <JumpPaletteProvider>
              <ErrorBoundary>{children}</ErrorBoundary>
            </JumpPaletteProvider>
          </TooltipProvider>
        <AppToaster />
        </I18nClientProvider>
      </body>
    </html>
  )
}
