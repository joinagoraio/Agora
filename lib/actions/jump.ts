"use server"

import { createClient } from "@/lib/supabase/server"
import { isEnvironmentalProgrammeWorkspace, workspaceHomeHref } from "@/lib/programme/domain"
import { getUserSpaces } from "@/lib/actions/space"
import { listDashboardPins } from "@/lib/actions/dashboard-pins"

export type JumpTarget = {
  kind: "programme" | "authority"
  id: string
  name: string
  href: string
  subtitle?: string
  pinned?: boolean
}

export async function listJumpTargets(): Promise<{ data: JumpTarget[] } | { error: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  const { data: spaces } = await getUserSpaces()
  const authorities: JumpTarget[] = ((spaces ?? []) as Array<{ id: string; name: string }>).map((space) => ({
    kind: "authority" as const,
    id: space.id,
    name: space.name,
    href: `/spaces/${space.id}`,
  }))
  const spaceNameById = new Map(authorities.map((authority) => [authority.id, authority.name]))

  const spaceIds = [...spaceNameById.keys()]
  const programmeById = new Map<string, JumpTarget>()

  const rememberProgramme = (row: {
    id: string
    name: string
    space_id?: string | null
    kind?: string | null
    metadata?: Record<string, unknown> | null
  }) => {
    if (!isEnvironmentalProgrammeWorkspace(row)) return
    programmeById.set(row.id, {
      kind: "programme",
      id: row.id,
      name: row.name,
      href: workspaceHomeHref(row),
      subtitle: (row.space_id && spaceNameById.get(row.space_id)) || undefined,
    })
  }

  if (spaceIds.length > 0) {
    const { data: spaceProgrammes } = await supabase
      .from("workspaces")
      .select("id, name, space_id, kind, metadata")
      .in("space_id", spaceIds)
      .order("name", { ascending: true })

    for (const row of spaceProgrammes ?? []) {
      rememberProgramme(row)
    }
  }

  const { data: memberships } = await supabase
    .from("workspace_members")
    .select(
      `
      workspace:workspaces(
        id,
        name,
        space_id,
        kind,
        metadata
      )
    `,
    )
    .eq("user_id", user.id)

  for (const membership of memberships ?? []) {
    const raw = (membership as { workspace?: unknown }).workspace
    const workspace = Array.isArray(raw) ? raw[0] : raw
    if (!workspace || typeof workspace !== "object" || !("id" in workspace)) continue
    rememberProgramme(
      workspace as {
        id: string
        name: string
        space_id?: string | null
        kind?: string | null
        metadata?: Record<string, unknown> | null
      },
    )
  }

  const programmes = [...programmeById.values()].sort((a, b) => a.name.localeCompare(b.name))
  authorities.sort((a, b) => a.name.localeCompare(b.name))

  const { data: pins } = await listDashboardPins()
  const pinKeys = pins.map((pin) => `${pin.kind}:${pin.id}`)
  const pinSet = new Set(pinKeys)
  const byKey = new Map(
    [...programmes, ...authorities].map((target) => [`${target.kind}:${target.id}`, target]),
  )

  const pinned = pinKeys
    .map((key) => byKey.get(key))
    .filter((target): target is JumpTarget => Boolean(target))
    .map((target) => ({ ...target, pinned: true }))

  const rest = [...programmes, ...authorities]
    .filter((target) => !pinSet.has(`${target.kind}:${target.id}`))
    .map((target) => ({ ...target, pinned: false }))

  return { data: [...pinned, ...rest] }
}
