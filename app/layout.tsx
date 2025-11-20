import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { ErrorBoundary } from '@/components/error-boundary'
import { Toaster } from 'sonner'
import './globals.css'

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`font-sans antialiased bg-white`}>
        <ErrorBoundary>
          {children}
        </ErrorBoundary>
        <Toaster position="bottom-center" richColors closeButton />
        <Analytics />
      </body>
    </html>
  )
}
