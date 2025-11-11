"use client"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { ChevronDown } from "lucide-react"
import { useEffect, useRef } from "react"

interface RequestMetadata {
  endpoint: string
  method?: string
  params?: Record<string, string>
  body?: unknown
  timestamp?: string
}

interface ResponseMetadata {
  status: number
  statusText?: string
  duration?: number
  fetchTime?: number
  resultCount?: number
  totalRecords?: number
  headers?: Record<string, string>
}

interface DebugPanelProps {
  request?: RequestMetadata
  response?: ResponseMetadata
  error?: string | null
}

export function DebugPanel({ request, response, error }: DebugPanelProps) {
  const detailsRef = useRef<HTMLDetailsElement>(null)

  useEffect(() => {
    if ((response || error) && detailsRef.current) {
      detailsRef.current.open = true
    }
  }, [response, error])

  const hasData = request || response || error

  return (
    <div className="border-t pt-4">
      <details ref={detailsRef} className="space-y-3 group">
        <summary className="text-sm font-medium cursor-pointer hover:text-primary flex items-center gap-2 list-none">
          <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
          Request & Response Details
          {response && (
            <Badge variant={response.status === 200 ? "default" : "destructive"} className="ml-2">
              {response.status}
            </Badge>
          )}
        </summary>

        <div className="pl-4 space-y-3">
          {!hasData && (
            <Card>
              <CardContent className="pt-4">
                <p className="text-sm text-muted-foreground">
                  No search performed yet. Request and response details will appear here after searching.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Request Information */}
          {request && (
            <Card>
              <CardContent className="pt-4 space-y-2">
                <h4 className="text-sm font-semibold">Request</h4>
                <div className="space-y-1 text-xs font-mono">
                  <div className="flex gap-2">
                    <span className="text-muted-foreground min-w-[80px]">Method:</span>
                    <span className="font-medium">{request.method || "GET"}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-muted-foreground min-w-[80px]">Endpoint:</span>
                    <span className="break-all">{request.endpoint}</span>
                  </div>
                  {request.timestamp && (
                    <div className="flex gap-2">
                      <span className="text-muted-foreground min-w-[80px]">Time:</span>
                      <span>{new Date(request.timestamp).toLocaleString()}</span>
                    </div>
                  )}
                  {request.params && Object.keys(request.params).length > 0 && (
                    <div className="pt-2">
                      <span className="text-muted-foreground">Parameters:</span>
                      <pre className="mt-1 p-2 bg-muted rounded text-xs overflow-x-auto">
                        {JSON.stringify(request.params, null, 2)}
                      </pre>
                    </div>
                  )}
                  {request.body && (
                    <div className="pt-2">
                      <span className="text-muted-foreground">Body:</span>
                      <pre className="mt-1 p-2 bg-muted rounded text-xs overflow-x-auto">
                        {JSON.stringify(request.body, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Response Information */}
          {response && (
            <Card>
              <CardContent className="pt-4 space-y-2">
                <h4 className="text-sm font-semibold">Response</h4>
                <div className="space-y-1 text-xs font-mono">
                  <div className="flex gap-2">
                    <span className="text-muted-foreground min-w-[80px]">Status:</span>
                    <span className={response.status === 200 ? "text-green-600" : "text-red-600"}>
                      {response.status} {response.statusText}
                    </span>
                  </div>
                  {response.duration !== undefined && (
                    <div className="flex gap-2">
                      <span className="text-muted-foreground min-w-[80px]">Duration:</span>
                      <span>{response.duration.toFixed(0)}ms</span>
                    </div>
                  )}
                  {response.fetchTime !== undefined && (
                    <div className="flex gap-2">
                      <span className="text-muted-foreground min-w-[80px]">Fetch Time:</span>
                      <span>{response.fetchTime.toFixed(0)}ms</span>
                    </div>
                  )}
                  {response.resultCount !== undefined && (
                    <div className="flex gap-2">
                      <span className="text-muted-foreground min-w-[80px]">Results:</span>
                      <span>
                        {response.resultCount}
                        {response.totalRecords !== undefined && ` of ${response.totalRecords}`}
                      </span>
                    </div>
                  )}
                  {response.headers && Object.keys(response.headers).length > 0 && (
                    <div className="pt-2">
                      <span className="text-muted-foreground">Headers:</span>
                      <pre className="mt-1 p-2 bg-muted rounded text-xs overflow-x-auto">
                        {JSON.stringify(response.headers, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Error Information */}
          {error && (
            <Card className="border-destructive">
              <CardContent className="pt-4">
                <h4 className="text-sm font-semibold text-destructive mb-2">Error</h4>
                <pre className="text-xs font-mono p-2 bg-destructive/10 rounded overflow-x-auto">{error}</pre>
              </CardContent>
            </Card>
          )}
        </div>
      </details>
    </div>
  )
}
