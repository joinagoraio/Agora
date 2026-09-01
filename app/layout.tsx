import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import { ErrorBoundary } from "@/components/error-boundary"
import { Toaster } from "sonner"
import { getServerDictionary } from "@/lib/i18n/server"
import { I18nClientProvider } from "@/components/providers/i18n-client-provider"
import { TooltipProvider } from "@/components/ui/tooltip"
import "./globals.css"

const _geist = Geist({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });

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
    <html lang={language}>
      <body className={`font-sans antialiased bg-white`}>
        <I18nClientProvider initialLanguage={language} initialMessages={messages}>
          <TooltipProvider delayDuration={400}>
            <ErrorBoundary>{children}</ErrorBoundary>
          </TooltipProvider>
        <Toaster position="bottom-center" richColors closeButton />
        <Analytics />
        </I18nClientProvider>
      </body>
    </html>
  )
}
