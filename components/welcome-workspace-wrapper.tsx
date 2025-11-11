"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { WelcomeWorkspaceDialog } from "@/components/welcome-workspace-dialog"

interface WelcomeWorkspaceWrapperProps {
  workspace: {
    id: string
    name: string
    description?: string | null
    context?: string | null
    location?: string | null
  }
}

export function WelcomeWorkspaceWrapper({ workspace }: WelcomeWorkspaceWrapperProps) {
  const searchParams = useSearchParams()
  const isNew = searchParams.get("new") === "true"
  const hasNoProperties = !workspace.context && !workspace.location
  const [open, setOpen] = useState(false)

  useEffect(() => {
    // Show modal if it's a new workspace and has no properties
    if (isNew && hasNoProperties) {
      setOpen(true)
    }
  }, [isNew, hasNoProperties])

  return <WelcomeWorkspaceDialog workspace={workspace} open={open} onOpenChange={setOpen} />
}

