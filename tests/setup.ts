import { afterEach } from "vitest"
import { cleanup } from "@testing-library/react"
import "@testing-library/jest-dom/vitest"

const requiredEnvDefaults: Record<string, string> = {
  NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-test-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-test-key",
}

for (const [key, value] of Object.entries(requiredEnvDefaults)) {
  if (!process.env[key]) {
    process.env[key] = value
  }
}

afterEach(() => {
  cleanup()
})

