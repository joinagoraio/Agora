"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Loader2, Search, ChevronDown } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DebugPanel } from "@/components/debug-panel"

interface SearchResult {
  title: string
  identifier: string
  type: string
  date?: string
  description?: string
  url?: string
}

interface APIMetadata {
  duration?: number
  fetchTime?: number
  endpoint?: string
  query?: Record<string, string>
  totalRecords?: number
}

export function OverheidSearchPOC() {
  const [query, setQuery] = useState("")
  const [location, setLocation] = useState("")
  const [resultsLimit, setResultsLimit] = useState("10")
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<SearchResult[]>([])
  const [error, setError] = useState<string | null>(null)
  const [metadata, setMetadata] = useState<APIMetadata | null>(null)
  const [requestTime, setRequestTime] = useState<string | null>(null)
  const [hasSearched, setHasSearched] = useState(false)

  const handleSearch = async () => {
    if (!query.trim()) {
      setError("Please enter a search query")
      return
    }

    setLoading(true)
    setError(null)
    setResults([])
    setRequestTime(new Date().toISOString())
    setHasSearched(true)

    try {
      const params = new URLSearchParams({
        query: query.trim(),
        maxRecords: resultsLimit,
        ...(location.trim() && { location: location.trim() }),
      })

      const response = await fetch(`/api/overheid-search?${params}`)
      const data = await response.json()

      setMetadata({
        duration: data.metadata?.duration,
        fetchTime: data.metadata?.fetchTime,
        endpoint: data.metadata?.endpoint,
        query: data.metadata?.query,
        totalRecords: data.metadata?.totalRecords,
      })

      if (!response.ok) {
        throw new Error(data.error || "Search failed")
      }

      setResults(data.results || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setLoading(false)
    }
  }

  const handleClear = () => {
    setQuery("")
    setLocation("")
    setResultsLimit("10")
    setResults([])
    setError(null)
    setHasSearched(false)
    setMetadata(null)
    setRequestTime(null)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Overheid.nl Search API</CardTitle>
        <CardDescription>
          Search local regulations, permits, and announcements using the SRU/XML interface
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="query">Search Query</Label>
            <Input
              id="query"
              placeholder="e.g., bestemmingsplan, bouwvergunning"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="location">Location (Optional)</Label>
            <Input
              id="location"
              placeholder="e.g., Amsterdam, Rotterdam"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="results-limit">Results Limit</Label>
            <Select value={resultsLimit} onValueChange={setResultsLimit}>
              <SelectTrigger id="results-limit">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10 results</SelectItem>
                <SelectItem value="20">20 results</SelectItem>
                <SelectItem value="50">50 results</SelectItem>
                <SelectItem value="100">100 results</SelectItem>
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
                  Search
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
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {results.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">
                {metadata?.totalRecords
                  ? `Showing ${results.length} of ${metadata.totalRecords} results`
                  : `Results (${results.length})`}
              </h3>
              {metadata?.totalRecords && metadata.totalRecords > results.length && (
                <p className="text-sm text-muted-foreground">Displaying first {results.length} results</p>
              )}
            </div>
            <div className="space-y-3">
              {results.map((result, index) => (
                <Card key={index}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <CardTitle className="text-base">{result.title}</CardTitle>
                        <CardDescription className="mt-1">
                          {result.type}
                          {result.date && ` • ${result.date}`}
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  {(result.description || result.identifier || result.url) && (
                    <CardContent className="pt-0 space-y-2">
                      {result.description && <p className="text-sm text-muted-foreground">{result.description}</p>}
                      {result.identifier && <p className="text-xs text-muted-foreground">ID: {result.identifier}</p>}
                      {result.url && (
                        <a
                          href={result.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-primary hover:underline"
                        >
                          View document →
                        </a>
                      )}
                    </CardContent>
                  )}
                </Card>
              ))}
            </div>
          </div>
        )}

        {!loading && !error && results.length === 0 && hasSearched && (
          <div className="text-center py-8 text-muted-foreground">No results found. Try a different search query.</div>
        )}

        <DebugPanel
          request={
            requestTime
              ? {
                  endpoint: `/api/overheid-search`,
                  method: "GET",
                  params: { query, ...(location && { location }), maxRecords: resultsLimit },
                  timestamp: requestTime,
                }
              : undefined
          }
          response={
            metadata
              ? {
                  status: error ? 500 : 200,
                  statusText: error ? "Error" : "OK",
                  duration: metadata.duration,
                  fetchTime: metadata.fetchTime,
                  resultCount: results.length,
                }
              : undefined
          }
          error={error}
        />

        <div className="border-t pt-4">
          <details className="space-y-2 group">
            <summary className="text-sm font-medium cursor-pointer hover:text-primary flex items-center gap-2 list-none">
              <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
              About Overheid.nl Search API
            </summary>
            <div className="text-xs text-muted-foreground space-y-2 pl-4">
              <p>
                The Overheid.nl Search API uses the SRU (Search & Retrieve via URL) protocol to search across local
                regulations, permits, and announcements from Dutch municipalities, provinces, and water boards.
              </p>
              <ul className="list-disc list-inside space-y-1">
                <li>Search local regulations (CVDR), announcements, and permits</li>
                <li>Filter by location (municipality, province)</li>
                <li>XML-based responses following SRU standards</li>
                <li>Real-time access to government data</li>
              </ul>
              <p className="pt-2">
                This POC demonstrates basic search functionality. The full API supports complex queries, geographic
                filtering, and advanced metadata extraction.
              </p>
            </div>
          </details>
        </div>
      </CardContent>
    </Card>
  )
}
