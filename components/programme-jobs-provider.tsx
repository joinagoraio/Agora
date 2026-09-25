"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"

import { listProgrammeJobs } from "@/lib/actions/programme-jobs"
import type { BackgroundJob, BackgroundJobKind } from "@/lib/programme/jobs"

type Jobs = Partial<Record<BackgroundJobKind, BackgroundJob>>

type ContextValue = {
  jobs: Jobs
  loaded: boolean
  /** Call after starting a job, so the page begins watching it straight away. */
  watch: (job?: BackgroundJob | null) => void
  refresh: () => Promise<void>
}

const JobsContext = createContext<ContextValue | null>(null)

const POLL_MS = 2500

export function ProgrammeJobsProvider({ workspaceId, children }: { workspaceId: string; children: ReactNode }) {
  const [jobs, setJobs] = useState<Jobs>({})
  const [loaded, setLoaded] = useState(false)
  const [watchUntil, setWatchUntil] = useState(0)
  const busy = useRef(false)

  const refresh = useCallback(async () => {
    if (busy.current) return
    busy.current = true
    try {
      const result = await listProgrammeJobs(workspaceId)
      setJobs(result.data)
      setLoaded(true)
    } finally {
      busy.current = false
    }
  }, [workspaceId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const anyRunning = Object.values(jobs).some((job) => job?.status === "running")
  useEffect(() => {
    if (!anyRunning && Date.now() > watchUntil) return
    const timer = window.setInterval(() => void refresh(), POLL_MS)
    return () => window.clearInterval(timer)
  }, [anyRunning, watchUntil, refresh])

  const watch = useCallback((job?: BackgroundJob | null) => {
    if (job) setJobs((current) => ({ ...current, [job.kind]: job }))
    setWatchUntil(Date.now() + 15000)
  }, [])

  const value = useMemo(() => ({ jobs, loaded, watch, refresh }), [jobs, loaded, watch, refresh])
  return <JobsContext.Provider value={value}>{children}</JobsContext.Provider>
}

export function useProgrammeJobs() {
  const value = useContext(JobsContext)
  if (!value) throw new Error("useProgrammeJobs needs ProgrammeJobsProvider")
  return value
}

/**
 * One kind of background job, with a callback when a run started in this session or seen running finishes.
 */
export function useBackgroundJob(kind: BackgroundJobKind, onFinished?: (job: BackgroundJob) => void) {
  const { jobs, watch, loaded } = useProgrammeJobs()
  const job = jobs[kind] ?? null
  const seenRunning = useRef<string | null>(null)
  const callback = useRef(onFinished)
  callback.current = onFinished

  useEffect(() => {
    if (!job) return
    if (job.status === "running") {
      seenRunning.current = job.id
      return
    }
    if (seenRunning.current === job.id) {
      seenRunning.current = null
      callback.current?.(job)
    }
  }, [job])

  return { job, running: job?.status === "running", watch, loaded }
}
