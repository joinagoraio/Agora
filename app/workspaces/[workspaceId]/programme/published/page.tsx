import { redirect } from "next/navigation"

import { getActiveProgrammePublication } from "@/lib/actions/publish"

/** The programme's current public page, so the demo tour can go there without knowing its address. */
export default async function ProgrammePublishedPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<{ tourProgramme?: string }>
}) {
  const { workspaceId } = await params
  const { tourProgramme } = await searchParams
  const { data: publication } = await getActiveProgrammePublication(workspaceId)
  const back = tourProgramme ? `?tourProgramme=${encodeURIComponent(tourProgramme)}` : ""
  if (!publication) redirect(`/workspaces/${workspaceId}/programme?view=document&section=publish`)
  redirect(`/published/${publication.id}${back}`)
}
