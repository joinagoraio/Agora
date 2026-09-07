"use client"

import { Toaster } from "sonner"

export function AppToaster() {
  return (
    <Toaster
      position="bottom-center"
      richColors
      closeButton
      toastOptions={{
        classNames: {
          toast: "!border-0",
          success: "!bg-emerald-600 !text-white",
          error: "!bg-red-600 !text-white",
          warning: "!bg-amber-400 !text-amber-950",
          info: "!bg-sky-600 !text-white",
        },
      }}
    />
  )
}
