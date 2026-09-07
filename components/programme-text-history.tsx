"use client"

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react"
import {
  EMPTY_PROGRAMME_TEXT_HISTORY,
  recordTextRevision,
  redoTextRevision,
  undoTextRevision,
  type ProgrammeTextHistoryState,
  type ProgrammeTextRevision,
} from "@/lib/programme/text-history"

const DEBOUNCE_MS = 400

type ApplyDirection = "undo" | "redo"

type ProgrammeTextHistoryContextValue = {
  canUndo: boolean
  canRedo: boolean
  record: (chapterId: string, nextHtml: string) => void
  recordImmediate: (chapterId: string, before: string, after: string) => void
  prime: (chapterId: string, html: string) => void
  undo: () => void
  redo: () => void
  registerApplier: (applier: ((revision: ProgrammeTextRevision, direction: ApplyDirection) => void) | null) => void
}

const ProgrammeTextHistoryContext = createContext<ProgrammeTextHistoryContextValue | null>(null)

export function ProgrammeTextHistoryProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ProgrammeTextHistoryState>(EMPTY_PROGRAMME_TEXT_HISTORY)
  const [hasPending, setHasPending] = useState(false)
  const committedRef = useRef<Record<string, string>>({})
  const pendingRef = useRef<ProgrammeTextRevision | null>(null)
  const timerRef = useRef<number | null>(null)
  const applierRef = useRef<((revision: ProgrammeTextRevision, direction: ApplyDirection) => void) | null>(null)
  const stateRef = useRef(state)
  stateRef.current = state

  const clearTimer = () => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  const takePending = useCallback(() => {
    clearTimer()
    const pending = pendingRef.current
    pendingRef.current = null
    setHasPending(false)
    if (!pending || pending.before === pending.after) return null
    committedRef.current[pending.chapterId] = pending.after
    return pending
  }, [])

  const flushPending = useCallback(() => {
    const pending = takePending()
    if (!pending) return
    setState((current) => recordTextRevision(current, pending))
  }, [takePending])

  const prime = useCallback((chapterId: string, html: string) => {
    flushPending()
    committedRef.current[chapterId] = html
  }, [flushPending])

  const record = useCallback(
    (chapterId: string, nextHtml: string) => {
      if (pendingRef.current && pendingRef.current.chapterId !== chapterId) flushPending()
      const before = pendingRef.current?.chapterId === chapterId
        ? pendingRef.current.before
        : (committedRef.current[chapterId] ?? nextHtml)
      pendingRef.current = { chapterId, before, after: nextHtml }
      setHasPending(true)
      clearTimer()
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null
        flushPending()
      }, DEBOUNCE_MS)
    },
    [flushPending],
  )

  const recordImmediate = useCallback(
    (chapterId: string, before: string, after: string) => {
      flushPending()
      if (before === after) return
      committedRef.current[chapterId] = after
      setState((current) => recordTextRevision(current, { chapterId, before, after }))
    },
    [flushPending],
  )

  const undo = useCallback(() => {
    const pending = takePending()
    let base = stateRef.current
    if (pending) base = recordTextRevision(base, pending)
    const next = undoTextRevision(base)
    if (!next) {
      if (pending) setState(base)
      return
    }
    committedRef.current[next.revision.chapterId] = next.revision.before
    setState(next.state)
    applierRef.current?.(next.revision, "undo")
  }, [takePending])

  const redo = useCallback(() => {
    flushPending()
    const next = redoTextRevision(stateRef.current)
    if (!next) return
    committedRef.current[next.revision.chapterId] = next.revision.after
    setState(next.state)
    applierRef.current?.(next.revision, "redo")
  }, [flushPending])

  const registerApplier = useCallback(
    (applier: ((revision: ProgrammeTextRevision, direction: ApplyDirection) => void) | null) => {
      applierRef.current = applier
    },
    [],
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "z") return
      const target = event.target as HTMLElement | null
      if (target?.closest("[data-programme-comments], input, textarea") && !target.closest(".ProseMirror")) {
        return
      }
      if (!target?.closest("#programme-document-scroll, header")) return
      event.preventDefault()
      if (event.shiftKey) redo()
      else undo()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [redo, undo])

  useEffect(() => () => {
    if (timerRef.current != null) window.clearTimeout(timerRef.current)
  }, [])

  return (
    <ProgrammeTextHistoryContext.Provider
      value={{
        canUndo: state.undo.length > 0 || hasPending,
        canRedo: state.redo.length > 0,
        record,
        recordImmediate,
        prime,
        undo,
        redo,
        registerApplier,
      }}
    >
      {children}
    </ProgrammeTextHistoryContext.Provider>
  )
}

export function useProgrammeTextHistory() {
  const value = useContext(ProgrammeTextHistoryContext)
  if (!value) {
    throw new Error("useProgrammeTextHistory must be used within ProgrammeTextHistoryProvider")
  }
  return value
}

export function useOptionalProgrammeTextHistory() {
  return useContext(ProgrammeTextHistoryContext)
}
