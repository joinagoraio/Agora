import { toast } from "sonner"

export type NotifyKind = "success" | "error" | "warning" | "info"

function showToast(kind: NotifyKind, message: string) {
  // Escape useTransition so Sonner is not treated as a low-priority update.
  setTimeout(() => toast[kind](message), 0)
}

export function notify(message: string | null | undefined, kind: NotifyKind = "success") {
  if (!message) return
  showToast(kind, message)
}

export function notifyResult(error: string | null | undefined, success: string) {
  if (error) showToast("error", error)
  else showToast("success", success)
}

export function persistOrRevert(
  action: () => Promise<{ error?: string }>,
  revert: () => void,
  success: string,
) {
  void action().then((result) => {
    if (result.error) {
      revert()
      showToast("error", result.error)
      return
    }
    showToast("success", success)
  })
}
