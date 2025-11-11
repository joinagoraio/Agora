"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Loader2, Search, FileText, ChevronDown } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { DebugPanel } from "@/components/debug-panel"

interface SRURecord {
  identifier: string
  title: string
  creator?: string
  type?: string
  modified?: string
  description?: string
  spatial?: string
  subject?: string
}

interface APIError {
  error: string
  message?: string
  status?: number
  serviceDown?: boolean
}

interface APIMetadata {
  duration?: number
  fetchTime?: number
  endpoint?: string
  query?: Record<string, string>
}

export function SRUWebservicePOC() {
  const [query, setQuery] = useState("")
  const [collection, setCollection] = useState<string>("cvdr")
  const [location, setLocation] = useState("")
  const [resultsLimit, setResultsLimit] = useState("10")
  const [loading, setLoading] = useState(false)
  const [records, setRecords] = useState<SRURecord[]>([])
  const [totalRecords, setTotalRecords] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [serviceDown, setServiceDown] = useState(false)
  const [metadata, setMetadata] = useState<APIMetadata | null>(null)
  const [requestTime, setRequestTime] = useState<string | null>(null)
  const [hasSearched, setHasSearched] = useState(false)

  const collections = [
    { value: "cvdr", label: "Lokale Regelingen (CVDR)", description: "Local regulations" },
    { value: "bm", label: "Lokale Bekendmakingen", description: "Local announcements" },
    { value: "vg", label: "Lokale Vergunningen", description: "Local permits" },
    { value: "oo", label: "Overheidsorganisaties", description: "Government organizations" },
    { value: "sc", label: "Producten en Diensten", description: "Products and services" },
    { value: "lnk", label: "Overheid.nl", description: "Location-based collections" },
  ]

  const handleSearch = async () => {
    if (!query.trim()) {
      setError("Please enter a search query")
      return
    }

    setLoading(true)
    setError(null)
    setRecords([])
    setServiceDown(false)
    setRequestTime(new Date().toISOString())
    setHasSearched(true)

    try {
      const params = new URLSearchParams({
        query: query.trim(),
        collection,
        maxRecords: resultsLimit,
        ...(location.trim() && { location: location.trim() }),
      })

      const response = await fetch(`/api/sru-webservice?${params}`)
      const data = await response.json()

      setMetadata({
        duration: data.metadata?.duration,
        fetchTime: data.metadata?.fetchTime,
        endpoint: data.metadata?.endpoint,
        query: data.metadata?.query,
      })

      if (!response.ok) {
        if ((data as APIError).serviceDown) {
          setServiceDown(true)
          setError((data as APIError).message || "Service temporarily unavailable")
        } else {
          setError((data as APIError).error || "Search failed")
        }
        return
      }

      setRecords(data.records || [])
      setTotalRecords(data.totalRecords || 0)
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setLoading(false)
    }
  }

  const handleClear = () => {
    setQuery("")
    setLocation("")
    setCollection("cvdr")
    setResultsLimit("10")
    setRecords([])
    setTotalRecords(0)
    setError(null)
    setServiceDown(false)
    setHasSearched(false)
    setMetadata(null)
    setRequestTime(null)
  }

  const selectedCollection = collections.find((c) => c.value === collection)

  return (
    <Card>
      <CardHeader>
        <CardTitle>SRU Webservice (Comprehensive Search)</CardTitle>
        <CardDescription>
          Search across all overheid.nl collections using the official SRU (Search & Retrieve via URL) protocol
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="collection">Collection</Label>
            <Select value={collection} onValueChange={setCollection}>
              <SelectTrigger id="collection">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {collections.map((col) => (
                  <SelectItem key={col.value} value={col.value}>
                    <div className="flex flex-col items-start">
                      <span>{col.label}</span>
                      <span className="text-xs text-muted-foreground">{col.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedCollection && <p className="text-xs text-muted-foreground">{selectedCollection.description}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="sru-query">Search Query (CQL)</Label>
            <Input
              id="sru-query"
              placeholder="e.g., bestemmingsplan, verordening, vergunning"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
            <p className="text-xs text-muted-foreground">
              Supports CQL operators: AND, OR, NOT, wildcards (*), exact phrases (adj)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sru-location">Location (Optional)</Label>
            <Input
              id="sru-location"
              placeholder="e.g., Amsterdam, Utrecht, Rotterdam"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
            <p className="text-xs text-muted-foreground">Filter results by municipality or province</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sru-results-limit">Results Limit</Label>
            <Select value={resultsLimit} onValueChange={setResultsLimit}>
              <SelectTrigger id="sru-results-limit">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10 records</SelectItem>
                <SelectItem value="20">20 records</SelectItem>
                <SelectItem value="50">50 records</SelectItem>
                <SelectItem value="100">100 records</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2">
            <Button onClick={handleSearch} disabled={loading} className="flex-1">
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Searching...
                </>
              ) : (
                <>
                  <Search className="mr-2 h-4 w-4" />
                  Search via SRU
                </>
              )}
            </Button>
            <Button onClick={handleClear} disabled={!hasSearched && !query && !location} variant="outline">
              Clear
            </Button>
          </div>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>
              {serviceDown ? (
                <div className="space-y-2">
                  <p className="font-medium">⚠️ Service Temporarily Unavailable</p>
                  <p className="text-sm">{error}</p>
                  <p className="text-xs">
                    The overheid.nl SRU service is experiencing technical difficulties. This is not an issue with our
                    application. Please try again in a few minutes.
                  </p>
                </div>
              ) : (
                error
              )}
            </AlertDescription>
          </Alert>
        )}

        {records.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">
                Results ({records.length} of {totalRecords})
              </h3>
              <Badge variant="outline">{selectedCollection?.label}</Badge>
            </div>
            <div className="space-y-3">
              {records.map((record, index) => (
                <Card key={index}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start gap-3">
                      <FileText className="h-5 w-5 text-muted-foreground mt-0.5" />
                      <div className="flex-1">
                        <CardTitle className="text-base">{record.title}</CardTitle>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {record.creator && <Badge variant="secondary">{record.creator}</Badge>}
                          {record.type && <Badge variant="outline">{record.type}</Badge>}
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {record.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">{record.description}</p>
                    )}

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {record.spatial && (
                        <div>
                          <span className="font-medium">Location: </span>
                          <span className="text-muted-foreground">{record.spatial}</span>
                        </div>
                      )}
                      {record.subject && (
                        <div>
                          <span className="font-medium">Subject: </span>
                          <span className="text-muted-foreground">{record.subject}</span>
                        </div>
                      )}
                      {record.modified && (
                        <div>
                          <span className="font-medium">Modified: </span>
                          <span className="text-muted-foreground">
                            {new Date(record.modified).toLocaleDateString()}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="pt-2 border-t">
                      <p className="text-xs text-muted-foreground">ID: {record.identifier}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {!loading && !error && records.length === 0 && hasSearched && (
          <div className="text-center py-8 text-muted-foreground">
            No results found. Try a different search query or collection.
          </div>
        )}

        {!loading && !error && records.length === 0 && !hasSearched && (
          <div className="text-center py-8 text-muted-foreground">
            Please enter a search query and click "Search via SRU".
          </div>
        )}

        <DebugPanel
          request={
            requestTime
              ? {
                  endpoint: `/api/sru-webservice`,
                  method: "GET",
                  params: {
                    query,
                    collection,
                    maxRecords: resultsLimit,
                    ...(location && { location }),
                  },
                  timestamp: requestTime,
                }
              : undefined
          }
          response={
            metadata
              ? {
                  status: error ? (serviceDown ? 503 : 500) : 200,
                  statusText: error ? (serviceDown ? "Service Unavailable" : "Error") : "OK",
                  duration: metadata.duration,
                  fetchTime: metadata.fetchTime,
                  resultCount: records.length,
                  totalRecords: totalRecords,
                }
              : undefined
          }
          error={error}
        />

        <div className="border-t pt-4">
          <details className="space-y-2 group">
            <summary className="text-sm font-medium cursor-pointer hover:text-primary flex items-center gap-2 list-none">
              <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
              About SRU Webservice
            </summary>
            <div className="text-xs text-muted-foreground space-y-2 pl-4">
              <p>
                The SRU (Search & Retrieve via URL) webservice is the official API for querying overheid.nl data. It
                supports:
              </p>
              <ul className="list-disc list-inside space-y-1">
                <li>CQL (Contextual Query Language) for complex queries</li>
                <li>Boolean operators (AND, OR, NOT)</li>
                <li>Wildcards and exact phrase matching</li>
                <li>Field-specific searches (title, creator, type, etc.)</li>
                <li>Geographic filtering by postcode or municipality</li>
                <li>Sorting and pagination</li>
              </ul>
              <p className="pt-2">
                This POC demonstrates the core SRU functionality. The full API supports faceted search, SPARQL
                enrichment, and advanced filtering options.
              </p>
            </div>
          </details>
        </div>
      </CardContent>
    </Card>
  )
}
