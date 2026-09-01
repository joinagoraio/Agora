/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  // Security headers
  async headers() {
    const isDev = process.env.NODE_ENV !== "production"
    
    const scriptSources = ["'self'", "https://va.vercel-scripts.com", "'unsafe-inline'"]
    if (isDev) {
      scriptSources.push("'unsafe-eval'", "https://vercel.live")
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
    ]
    if (isDev) {
      // Local Supabase (supabase start) — required for browser auth/API calls
      connectSources.push(
        "http://localhost:54321",
        "http://127.0.0.1:54321",
        "ws://localhost:54321",
        "ws://127.0.0.1:54321",
        "https://vercel.live",
      )
    }
    
    const imageSources = ["'self'", "data:", "blob:", "https:"]
    if (isDev) {
      imageSources.push("http://localhost:54321", "http://127.0.0.1:54321")
    }

    const csp = [
      "default-src 'self'",
      `script-src ${scriptSources.join(" ")}`,
      `style-src ${styleSources.join(" ")}`,
      `img-src ${imageSources.join(" ")}`,
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
            value: "geolocation=(), microphone=(), camera=()",
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
