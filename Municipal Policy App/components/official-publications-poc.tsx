"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Loader2, Search, FileText, ExternalLink, ChevronDown } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { DebugPanel } from "@/components/debug-panel"

interface Publication {
  identifier: string
  title: string
  type: string
  publicationDate?: string
  publisher?: string
  subject?: string
  description?: string
  url?: string
}

interface APIMetadata {
  duration?: number
  fetchTime?: number
  endpoint?: string
  query?: Record<string, string>
}

export function OfficialPublicationsPOC() {
  const [query, setQuery] = useState("")
  const [publicationType, setPublicationType] = useState<string>("all")
  const [resultsLimit, setResultsLimit] = useState("10") // Changed default results limit from "20" to "10"
  const [loading, setLoading] = useState(false)
  const [publications, setPublications] = useState<Publication[]>([])
  const [error, setError] = useState<string | null>(null)
  const [metadata, setMetadata] = useState<APIMetadata | null>(null)
  const [requestTime, setRequestTime] = useState<string | null>(null)

  const handleSearch = async () => {
    if (!query.trim()) {
      setError("Please enter a search query")
      return
    }

    setLoading(true)
    setError(null)
    setPublications([])
    setRequestTime(new Date().toISOString())

    try {
      const params = new URLSearchParams({
        query: query.trim(),
        maxRecords: resultsLimit,
        ...(publicationType !== "all" && { type: publicationType }),
      })

      const response = await fetch(`/api/official-publications?${params}`)
      const data = await response.json()

      setMetadata({
        duration: data.metadata?.duration,
        fetchTime: data.metadata?.fetchTime,
        endpoint: data.metadata?.endpoint,
        query: data.metadata?.query,
      })

      if (!response.ok) {
        throw new Error(data.error || "Search failed")
      }

      setPublications(data.publications || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setLoading(false)
    }
  }

  const handleClear = () => {
    setQuery("")
    setPublicationType("all")
    setResultsLimit("10") // Changed default results limit from "20" to "10"
    setPublications([])
    setError(null)
    setMetadata(null)
    setRequestTime(null)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Officiële Bekendmakingen API</CardTitle>
        <CardDescription>Access official municipal publications and announcements</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pub-query">Search Query</Label>
            <Input
              id="pub-query"
              placeholder="e.g., gemeentelijke verordening, raadsbesluit"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="publication-type">Publication Type</Label>
            <Select value={publicationType} onValueChange={setPublicationType}>
              <SelectTrigger id="publication-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="gmb">Gemeenteblad (Municipal Gazette)</SelectItem>
                <SelectItem value="prb">Provinciaal Blad (Provincial Gazette)</SelectItem>
                <SelectItem value="wsb">Waterschapsblad (Water Board Gazette)</SelectItem>
                <SelectItem value="bgr">Besluit Algemene Strekking (General Decision)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="pub-results-limit">Results Limit</Label>
            <Select value={resultsLimit} onValueChange={setResultsLimit}>
              <SelectTrigger id="pub-results-limit">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10 publications</SelectItem>
                <SelectItem value="20">20 publications</SelectItem>
                <SelectItem value="50">50 publications</SelectItem>
                <SelectItem value="100">100 publications</SelectItem>
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
                  Search Publications
                </>
              )}
            </Button>
            <Button onClick={handleClear} disabled={!query && publications.length === 0} variant="outline">
              Clear
            </Button>
          </div>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {publications.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Publications ({publications.length})</h3>
            <div className="space-y-3">
              {publications.map((pub, index) => (
                <Card key={index}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <Badge variant="secondary">{pub.type}</Badge>
                        </div>
                        <CardTitle className="text-base">{pub.title}</CardTitle>
                        {pub.publisher && <CardDescription className="mt-1">{pub.publisher}</CardDescription>}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {pub.description && <p className="text-sm text-muted-foreground">{pub.description}</p>}

                    {pub.subject && (
                      <div className="text-sm">
                        <span className="font-medium">Subject: </span>
                        <span className="text-muted-foreground">{pub.subject}</span>
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-2 border-t">
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>ID: {pub.identifier}</span>
                        {pub.publicationDate && <span>Published: {pub.publicationDate}</span>}
                      </div>
                      {pub.url && (
                        <a
                          href={pub.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-sm text-primary hover:underline"
                        >
                          View document
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {!loading && !error && publications.length === 0 && query && (
          <div className="text-center py-8 text-muted-foreground">
            No publications found. Try a different search query or publication type.
          </div>
        )}

        <DebugPanel
          request={
            requestTime
              ? {
                  endpoint: `/api/official-publications`,
                  method: "GET",
                  params: {
                    query,
                    ...(publicationType !== "all" && { type: publicationType }),
                    maxRecords: resultsLimit,
                  },
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
                  resultCount: publications.length,
                }
              : undefined
          }
          error={error}
        />

        <div className="border-t pt-4">
          <details className="space-y-2 group">
            <summary className="text-sm font-medium cursor-pointer hover:text-primary flex items-center gap-2 list-none">
              <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
              About Official Publications API
            </summary>
            <div className="text-xs text-muted-foreground space-y-2 pl-4">
              <p>
                The Official Publications API (Officiële Bekendmakingen) provides access to formal government
                announcements and publications from Dutch municipalities, provinces, and water boards.
              </p>
              <ul className="list-disc list-inside space-y-1">
                <li>Search municipal gazettes (Gemeenteblad), provincial gazettes, and water board publications</li>
                <li>Access official decisions and general regulations</li>
                <li>Filter by publication type and organization</li>
                <li>Direct links to official documents on overheid.nl</li>
              </ul>
              <p className="pt-2">
                These publications are legally binding announcements that must be formally published. This API provides
                programmatic access to the same content that appears in official government gazettes.
              </p>
            </div>
          </details>
        </div>
      </CardContent>
    </Card>
  )
}
