import type { ReactNode } from "react"

import { DemoTourFloating, DemoTourProvider } from "@/components/demo-tour"
import { ProgrammeJobsProvider } from "@/components/programme-jobs-provider"
import type { LoadedDemo } from "@/lib/actions/demo-pack"
import { getTourNarration } from "@/lib/programme/demo-narration"

/**
 * Carries the demo tour onto a page outside the programme, when the tour itself led there
 * (the address names the tour's programme). Otherwise the page shows as usual.
 */
export async function DemoTourMount({
  demo,
  tourProgramme,
  children,
}: {
  demo: LoadedDemo | null
  tourProgramme?: string | null
  children: ReactNode
}) {
  if (!demo?.tour || !demo.programmeId || tourProgramme !== demo.programmeId) return <>{children}</>
  const narration = await getTourNarration(demo.packId, demo.tour)
  return (
    <ProgrammeJobsProvider workspaceId={demo.programmeId}>
      <DemoTourProvider tour={demo.tour} workspaceId={demo.programmeId} spaceId={demo.spaceId} narration={narration}>
        <DemoTourFloating />
        {children}
      </DemoTourProvider>
    </ProgrammeJobsProvider>
  )
}
