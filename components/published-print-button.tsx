"use client"

import { Button } from "@/components/ui/button"

export function PublishedPrintButton({ label }: { label: string }) {
  return (
    <Button type="button" variant="outline" onClick={() => window.print()}>
      {label}
    </Button>
  )
}
