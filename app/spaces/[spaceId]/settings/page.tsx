import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

export default async function SpaceSettingsPage({
  params,
}: {
  params: Promise<{ spaceId: string }>
}) {
  const { spaceId } = await params
  redirect(`/spaces/${spaceId}`)
}
