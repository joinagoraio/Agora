"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

export function EvidenceRefreshListener() {
  const router = useRouter()

  useEffect(() => {
    const handleEvidenceSaved = () => {
      console.log("[EvidenceRefreshListener] Evidence saved, refreshing page...")
      router.refresh()
    }

    window.addEventListener('evidenceSaved', handleEvidenceSaved)
    return () => window.removeEventListener('evidenceSaved', handleEvidenceSaved)
  }, [router])

  return null
}

