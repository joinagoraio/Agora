import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowRight, Search, MessageSquare, Database, Users, Shield, Zap } from "lucide-react"

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <span className="text-lg font-bold">A</span>
            </div>
            <span className="text-xl font-bold">AGORA</span>
          </div>
          <nav className="hidden items-center gap-6 md:flex">
            <Link
              href="#features"
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Features
            </Link>
            <Link
              href="#how-it-works"
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              How it Works
            </Link>
            <Link
              href="/auth/login"
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Sign In
            </Link>
            <Button asChild>
              <Link href="/auth/sign-up">Get Started</Link>
            </Button>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="container relative flex flex-col items-center justify-center gap-8 py-24 text-center lg:py-32">
        <div className="flex flex-col gap-4 max-w-4xl">
          <div className="inline-flex items-center justify-center">
            <span className="rounded-full bg-accent/10 px-4 py-1.5 text-sm font-medium text-accent border border-accent/20">
              AI-Powered Policy Management
            </span>
          </div>
          <h1 className="text-balance text-5xl font-bold tracking-tight lg:text-7xl">
            Your team's intelligent
            <span className="block text-accent">policy assistant</span>
          </h1>
          <p className="text-balance text-xl text-muted-foreground lg:text-2xl max-w-3xl mx-auto leading-relaxed">
            Connect your policy documents, ask questions, and get instant AI-powered answers. Built for teams that need
            fast access to institutional knowledge.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-4">
          <Button asChild size="lg" className="text-base h-12 px-8">
            <Link href="/auth/sign-up">
              Start Free Trial
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="text-base h-12 px-8 bg-transparent">
            <Link href="#how-it-works">See How it Works</Link>
          </Button>
        </div>

        {/* Stats */}
        <div className="mt-16 grid w-full max-w-5xl gap-8 sm:grid-cols-3 border-t border-border pt-16">
          <div className="flex flex-col items-center gap-2">
            <div className="text-4xl font-bold">10x</div>
            <div className="text-sm text-muted-foreground">Faster policy search</div>
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="text-4xl font-bold">100%</div>
            <div className="text-sm text-muted-foreground">Accurate citations</div>
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="text-4xl font-bold">24/7</div>
            <div className="text-sm text-muted-foreground">Always available</div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="container py-24 lg:py-32">
        <div className="flex flex-col items-center gap-4 text-center mb-16">
          <h2 className="text-balance text-4xl font-bold tracking-tight lg:text-5xl">
            Everything you need to manage policies
          </h2>
          <p className="text-balance text-lg text-muted-foreground max-w-2xl">
            Connect, search, and chat with your policy documents using advanced AI technology
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-3">
          <div className="flex flex-col gap-4 rounded-xl border bg-card p-8 transition-colors hover:border-accent/50">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-accent/10 text-accent">
              <Database className="h-6 w-6" />
            </div>
            <h3 className="text-2xl font-semibold">Document Connectors</h3>
            <p className="text-muted-foreground leading-relaxed">
              Seamlessly integrate with Google Drive, Notion, Confluence, SharePoint, and Dropbox. All your policies in
              one place.
            </p>
          </div>

          <div className="flex flex-col gap-4 rounded-xl border bg-card p-8 transition-colors hover:border-accent/50">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-accent/10 text-accent">
              <MessageSquare className="h-6 w-6" />
            </div>
            <h3 className="text-2xl font-semibold">AI Assistant</h3>
            <p className="text-muted-foreground leading-relaxed">
              Ask questions in natural language and get instant answers with accurate citations from your policy
              documents.
            </p>
          </div>

          <div className="flex flex-col gap-4 rounded-xl border bg-card p-8 transition-colors hover:border-accent/50">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-accent/10 text-accent">
              <Search className="h-6 w-6" />
            </div>
            <h3 className="text-2xl font-semibold">Smart Search</h3>
            <p className="text-muted-foreground leading-relaxed">
              Full-text search with semantic understanding. Find exactly what you need, even if you don't know the exact
              wording.
            </p>
          </div>

          <div className="flex flex-col gap-4 rounded-xl border bg-card p-8 transition-colors hover:border-accent/50">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-accent/10 text-accent">
              <Users className="h-6 w-6" />
            </div>
            <h3 className="text-2xl font-semibold">Team Collaboration</h3>
            <p className="text-muted-foreground leading-relaxed">
              Organize workspaces for different teams, invite members, and control access with role-based permissions.
            </p>
          </div>

          <div className="flex flex-col gap-4 rounded-xl border bg-card p-8 transition-colors hover:border-accent/50">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-accent/10 text-accent">
              <Shield className="h-6 w-6" />
            </div>
            <h3 className="text-2xl font-semibold">Enterprise Security</h3>
            <p className="text-muted-foreground leading-relaxed">
              Multi-tenant architecture with row-level security. Your data is isolated, encrypted, and protected.
            </p>
          </div>

          <div className="flex flex-col gap-4 rounded-xl border bg-card p-8 transition-colors hover:border-accent/50">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-accent/10 text-accent">
              <Zap className="h-6 w-6" />
            </div>
            <h3 className="text-2xl font-semibold">Lightning Fast</h3>
            <p className="text-muted-foreground leading-relaxed">
              Built with modern technology for instant responses. Get answers in seconds, not minutes.
            </p>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="container py-24 lg:py-32 border-t border-border">
        <div className="flex flex-col items-center gap-4 text-center mb-16">
          <h2 className="text-balance text-4xl font-bold tracking-tight lg:text-5xl">Get started in minutes</h2>
          <p className="text-balance text-lg text-muted-foreground max-w-2xl">
            Three simple steps to transform how your team accesses policy information
          </p>
        </div>

        <div className="grid gap-12 lg:grid-cols-3">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent text-accent-foreground text-2xl font-bold">
              1
            </div>
            <h3 className="text-2xl font-semibold">Connect Your Sources</h3>
            <p className="text-muted-foreground leading-relaxed">
              Link your Google Drive, Notion, or other platforms. AGORA automatically syncs your policy documents.
            </p>
          </div>

          <div className="flex flex-col items-center gap-4 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent text-accent-foreground text-2xl font-bold">
              2
            </div>
            <h3 className="text-2xl font-semibold">Organize Workspaces</h3>
            <p className="text-muted-foreground leading-relaxed">
              Create spaces for different teams or departments. Invite members and set permissions.
            </p>
          </div>

          <div className="flex flex-col items-center gap-4 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent text-accent-foreground text-2xl font-bold">
              3
            </div>
            <h3 className="text-2xl font-semibold">Ask Questions</h3>
            <p className="text-muted-foreground leading-relaxed">
              Chat with your AI assistant to get instant answers with accurate citations from your documents.
            </p>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container py-24 lg:py-32">
        <div className="flex flex-col items-center gap-8 rounded-2xl border bg-card p-12 text-center lg:p-20">
          <h2 className="text-balance text-4xl font-bold tracking-tight lg:text-5xl max-w-3xl">
            Ready to transform your policy management?
          </h2>
          <p className="text-balance text-lg text-muted-foreground max-w-2xl">
            Join teams already using AGORA to make their institutional knowledge instantly accessible
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Button asChild size="lg" className="text-base h-12 px-8">
              <Link href="/auth/sign-up">
                Get Started Free
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="text-base h-12 px-8 bg-transparent">
              <Link href="/auth/login">Sign In</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-muted/30">
        <div className="container py-12">
          <div className="grid gap-8 lg:grid-cols-4">
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
                  <span className="text-lg font-bold">A</span>
                </div>
                <span className="text-xl font-bold">AGORA</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Your intelligent multi-tenant policy assistant powered by AI
              </p>
            </div>

            <div className="flex flex-col gap-4">
              <h4 className="font-semibold">Product</h4>
              <Link href="#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Features
              </Link>
              <Link
                href="#how-it-works"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                How it Works
              </Link>
              <Link
                href="/auth/sign-up"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Pricing
              </Link>
            </div>

            <div className="flex flex-col gap-4">
              <h4 className="font-semibold">Resources</h4>
              <Link
                href="/auth/login"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Documentation
              </Link>
              <Link
                href="/auth/login"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Support
              </Link>
              <Link
                href="/auth/login"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Blog
              </Link>
            </div>

            <div className="flex flex-col gap-4">
              <h4 className="font-semibold">Company</h4>
              <Link
                href="/auth/login"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                About
              </Link>
              <Link
                href="/auth/login"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Contact
              </Link>
              <Link
                href="/auth/login"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Privacy
              </Link>
            </div>
          </div>

          <div className="mt-12 border-t border-border pt-8 text-center text-sm text-muted-foreground">
            <p>&copy; 2025 AGORA. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
