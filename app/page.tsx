import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-background to-muted/20">
      <div className="container flex max-w-5xl flex-col items-center gap-8 px-4 text-center">
        <div className="flex flex-col gap-4">
          <h1 className="text-balance text-6xl font-bold tracking-tight lg:text-7xl">Welcome to AGORA</h1>
          <p className="text-balance text-xl text-muted-foreground lg:text-2xl">
            Your intelligent multi-tenant policy assistant
          </p>
        </div>

        <p className="max-w-2xl text-pretty text-lg text-muted-foreground">
          Connect your knowledge bases, ask questions, and get instant answers powered by advanced AI. Perfect for teams
          that need quick access to policy documents and institutional knowledge.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-4">
          <Button asChild size="lg" className="text-lg">
            <Link href="/auth/sign-up">Get Started</Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="text-lg bg-transparent">
            <Link href="/auth/login">Sign In</Link>
          </Button>
        </div>

        <div className="mt-12 grid w-full max-w-3xl gap-6 sm:grid-cols-3">
          <div className="flex flex-col gap-2 rounded-lg border bg-card p-6">
            <h3 className="font-semibold">Multi-Tenant</h3>
            <p className="text-sm text-muted-foreground">Create spaces for different teams and organizations</p>
          </div>
          <div className="flex flex-col gap-2 rounded-lg border bg-card p-6">
            <h3 className="font-semibold">RAG-Powered</h3>
            <p className="text-sm text-muted-foreground">AI assistant with retrieval-augmented generation</p>
          </div>
          <div className="flex flex-col gap-2 rounded-lg border bg-card p-6">
            <h3 className="font-semibold">Integrations</h3>
            <p className="text-sm text-muted-foreground">Connect Google Drive, Notion, Confluence, and more</p>
          </div>
        </div>
      </div>
    </div>
  )
}
