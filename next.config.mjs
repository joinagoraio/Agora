import { copyFileSync, mkdirSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"

const require = createRequire(import.meta.url)

function resolvePdfWorker() {
  try {
    const reactPdfDir = path.dirname(require.resolve("react-pdf/package.json"))
    return require.resolve("pdfjs-dist/build/pdf.worker.min.mjs", { paths: [reactPdfDir] })
  } catch {
    return require.resolve("pdfjs-dist/build/pdf.worker.min.mjs")
  }
}

try {
  mkdirSync(path.join(process.cwd(), "public"), { recursive: true })
  copyFileSync(resolvePdfWorker(), path.join(process.cwd(), "public/pdf.worker.min.mjs"))
} catch (error) {
  console.warn("[next.config] Could not copy pdf.worker.min.mjs into public/", error)
}

function supabaseConnectSources() {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL
  const placeholderOrigin = "https://__AGORA_SUPABASE_URL_PLACEHOLDER__"

  // Docker builds bake this placeholder; docker-entrypoint.sh replaces it at boot.
  // Skipping it meant production CSP never allowed the self-hosted API host.
  if (!raw || raw.includes("PLACEHOLDER") || raw.includes("placeholder")) {
    if (process.env.DOCKER_BUILD === "1") {
      const host = placeholderOrigin.slice("https://".length)
      return [placeholderOrigin, `wss://${host}`, `ws://${host}`]
    }
    return []
  }

  try {
    const url = new URL(raw)
    return [url.origin, `wss://${url.host}`, `ws://${url.host}`]
  } catch {
    return []
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  agentRules: false,
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  typescript: {
    ignoreBuildErrors: process.env.DOCKER_BUILD === "1",
  },
  serverExternalPackages: ["pdfjs-dist"],
  // The file tracer copies only playwright's ESM entry, which loads the rest at runtime; without it the PDF export falls back to a print page.
  outputFileTracingIncludes: {
    "/*": [
      "./node_modules/.pnpm/playwright@*/node_modules/playwright/**/*",
      "./node_modules/.pnpm/playwright-core@*/node_modules/playwright-core/**/*",
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "200mb",
    },
    proxyClientMaxBodySize: "200mb",
  },
  images: {
    unoptimized: true,
  },
  async headers() {
    const isDev = process.env.NODE_ENV !== "production"

    const scriptSources = ["'self'", "'unsafe-inline'"]
    if (isDev) {
      scriptSources.push("'unsafe-eval'", "https://vercel.live", "https://va.vercel-scripts.com")
    }

    const styleSources = ["'self'", "'unsafe-inline'"]
    if (isDev) {
      styleSources.push("https://vercel.live")
    }

    const connectSources = [
      "'self'",
      "https://*.supabase.co",
      "https://*.openai.com",
      "https://*.upstash.io",
      ...supabaseConnectSources(),
    ]
    if (isDev) {
      connectSources.push(
        "http://localhost:54321",
        "http://127.0.0.1:54321",
        "ws://localhost:54321",
        "ws://127.0.0.1:54321",
        "http:",
        "ws:",
        "https://vercel.live",
      )
    }
    
    const imageSources = ["'self'", "data:", "blob:", "https:"]
    if (isDev) {
      imageSources.push("http://localhost:54321", "http://127.0.0.1:54321", "http:")
    }

    const mediaSources = [
      "'self'",
      "blob:",
      "data:",
      "https://*.supabase.co",
      ...supabaseConnectSources().filter((source) => !source.startsWith("ws")),
    ]
    if (isDev) {
      mediaSources.push("http://localhost:54321", "http://127.0.0.1:54321")
    }

    const csp = [
      "default-src 'self'",
      `script-src ${scriptSources.join(" ")}`,
      `style-src ${styleSources.join(" ")}`,
      `img-src ${imageSources.join(" ")}`,
      `media-src ${mediaSources.join(" ")}`,
      "font-src 'self' data:",
      `connect-src ${connectSources.join(" ")}`,
      "worker-src 'self' blob:",
      "frame-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ]
    // Local Supabase is HTTP. This directive would upgrade those calls to HTTPS
    // and produce a browser TypeError: Failed to fetch on login.
    if (!isDev) {
      csp.push("upgrade-insecure-requests")
    }

    const cspHeader = csp.join("; ")
    
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "geolocation=(), microphone=(self), camera=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains; preload",
          },
          {
            key: "Content-Security-Policy",
            value: cspHeader,
          },
        ],
      },
    ]
  },
}

export default nextConfig
