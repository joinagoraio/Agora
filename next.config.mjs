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
      connectSources.push("https://vercel.live")
    }
    
    const csp = [
      "default-src 'self'",
      `script-src ${scriptSources.join(" ")}`,
      `style-src ${styleSources.join(" ")}`,
      "img-src 'self' data: https:",
      "font-src 'self' data:",
      `connect-src ${connectSources.join(" ")}`,
      "worker-src 'self' blob:",
      "frame-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "upgrade-insecure-requests",
    ].join("; ")
    
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
            value: csp,
          },
        ],
      },
    ]
  },
}

export default nextConfig
