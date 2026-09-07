import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { getPrimaryTenantForUser, updateTenantName } from "@/lib/actions/tenant"
import { isTenantAdminRole } from "@/lib/tenant/domain"

export async function GET() {
  try {
    const membership = await getPrimaryTenantForUser()
    if (!membership.data) {
      return NextResponse.json({ error: membership.error || "No organisation found" }, { status: 404 })
    }
    if (!isTenantAdminRole(membership.data.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    return NextResponse.json({
      data: {
        id: membership.data.tenantId,
        name: membership.data.tenant?.name ?? "Organisation",
        llmKeyPolicy: membership.data.tenant?.llmKeyPolicy ?? "platform_only",
      },
    })
  } catch (error) {
    console.error("[Tenant settings API] GET error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const { tenantId, name } = body

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const membership = await getPrimaryTenantForUser()
    if (!membership.data || membership.data.tenantId !== tenantId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    if (!isTenantAdminRole(membership.data.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const result = await updateTenantName(tenantId, name)
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    revalidatePath("/settings")
    return NextResponse.json({
      data: {
        id: tenantId,
        name: name.trim(),
      },
    })
  } catch (error) {
    console.error("[Tenant settings API] PUT error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
