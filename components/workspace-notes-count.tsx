"use client"

import { useEffect, useMemo, useState } from "react"

type WorkspaceContextEventDetail = {
  workspaceId?: string
  type?: string
  action?: "created" | "updated" | "deleted"
}

interface WorkspaceNotesCountProps {
  workspaceId: string
  initialCount: number
  className?: string
}

export function WorkspaceNotesCount({ workspaceId, initialCount, className }: WorkspaceNotesCountProps) {
  const [count, setCount] = useState(initialCount)

  useEffect(() => {
    setCount(initialCount)
  }, [initialCount])

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<WorkspaceContextEventDetail>).detail
      if (!detail || detail.workspaceId !== workspaceId || detail.type !== "note" || !detail.action) {
        return
      }

      setCount((prev) => {
        if (detail.action === "created") {
          return prev + 1
        }

        if (detail.action === "deleted") {
          return Math.max(0, prev - 1)
        }

        return prev
      })
    }

    window.addEventListener("workspaceContextUpdated" as any, handler as EventListener)
    return () => {
      window.removeEventListener("workspaceContextUpdated" as any, handler as EventListener)
    }
  }, [workspaceId])

  const content = useMemo(() => `(${count})`, [count])

  return <span className={className}>{content}</span>
}


