import { NextResponse } from "next/server"

import { createAdminClient } from "@/lib/supabase/admin"
import { isAvatarStoragePath } from "@/lib/profile/avatar-url"

export async function GET(_request: Request, context: { params: Promise<{ path: string[] }> }) {
  const path = (await context.params).path.join("/")
  if (!isAvatarStoragePath(path)) {
    return new NextResponse("Not found", { status: 404 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin.storage.from("avatars").download(path)
  if (error || !data) {
    return new NextResponse("Not found", { status: 404 })
  }

  const ext = path.split(".").pop()?.toLowerCase()
  const contentType = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg"
  return new NextResponse(data, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=3600",
    },
  })
}

