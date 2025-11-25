"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { WelcomeWorkspaceDialog } from "@/components/welcome-workspace-dialog"

interface WelcomeWorkspaceWrapperProps {
  workspace: {
    id: string
    name: string
    summary?: string | null
    description?: string | null
    context?: string | null
    location?: string | null
  }
}

export function WelcomeWorkspaceWrapper({ workspace }: WelcomeWorkspaceWrapperProps) {
  const searchParams = useSearchParams()
  const isNew = searchParams.get("new") === "true"
  const isSummaryMissing = !workspace.summary || workspace.summary.trim().length === 0
  const isDescriptionMissing = !workspace.description || workspace.description.trim().length === 0
  const needsScopeDetails = isSummaryMissing || isDescriptionMissing
  const [open, setOpen] = useState(false)

  useEffect(() => {
    // Show modal if it's a new workspace and has no properties
    if (isNew && needsScopeDetails) {
      setOpen(true)
    }
  }, [isNew, needsScopeDetails])

  return <WelcomeWorkspaceDialog workspace={workspace} open={open} onOpenChange={setOpen} />
}
