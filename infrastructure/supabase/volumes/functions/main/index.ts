import { serve } from "https://deno.land/std@0.131.0/http/server.ts"
import * as jose from "https://deno.land/x/jose@v4.14.4/index.ts"

console.log("main function started")

const JWT_SECRET = Deno.env.get("JWT_SECRET")
const VERIFY_JWT = Deno.env.get("VERIFY_JWT") === "true"

function getAuthToken(req: Request) {
  const authHeader = req.headers.get("authorization")
  if (!authHeader) {
    throw new Error("Missing authorization header")
  }
  const [bearer, token] = authHeader.split(" ")
  if (bearer !== "Bearer") {
    throw new Error("Auth header is not 'Bearer {token}'")
  }
  return token
}

async function verifyJWT(jwt: string): Promise<boolean> {
  const encoder = new TextEncoder()
  const secretKey = encoder.encode(JWT_SECRET)
  try {
    await jose.jwtVerify(jwt, secretKey)
  } catch (err) {
    console.error(err)
    return false
  }
  return true
}

serve(async (req: Request) => {
  if (req.method !== "OPTIONS" && VERIFY_JWT) {
    try {
      const token = getAuthToken(req)
      const isValidJWT = await verifyJWT(token)
      if (!isValidJWT) {
        return new Response(JSON.stringify({ msg: "Invalid JWT" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        })
      }
    } catch (error) {
      console.error(error)
      return new Response(JSON.stringify({ msg: String(error) }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      })
    }
  }

  const url = new URL(req.url)
  const serviceName = url.pathname.split("/")[1]
  if (!serviceName) {
    return new Response(JSON.stringify({ msg: "missing function name in request" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  const servicePath = `/home/deno/functions/${serviceName}`
  try {
    const worker = await EdgeRuntime.userWorkers.create({
      servicePath,
      memoryLimitMb: 150,
      workerTimeoutMs: 60_000,
      noModuleCache: false,
      importMapPath: null,
      envVars: Object.entries(Deno.env.toObject()),
    })
    return await worker.fetch(req)
  } catch (error) {
    return new Response(JSON.stringify({ msg: String(error) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
})
