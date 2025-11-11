"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Loader2, Search, ExternalLink, ChevronDown } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DebugPanel } from "@/components/debug-panel"

interface CKANDataset {
  id: string
  name: string
  title: string
  notes?: string
  organization?: {
    name: string
    title: string
  }
  tags?: Array<{ name: string }>
  resources?: Array<{
    id: string
    name: string
    format: string
    url: string
  }>
  metadata_created?: string
  metadata_modified?: string
}

interface APIMetadata {
  duration?: number
  fetchTime?: number
  endpoint?: string
  query?: Record<string, string>
}

export function CKANMetadataPOC() {
  const [query, setQuery] = useState("")
  const [organization, setOrganization] = useState("")
  const [resultsLimit, setResultsLimit] = useState("10") // Changed default results limit from "100" to "10"
  const [loading, setLoading] = useState(false)
  const [datasets, setDatasets] = useState<CKANDataset[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [metadata, setMetadata] = useState<APIMetadata | null>(null)
  const [requestTime, setRequestTime] = useState<string | null>(null)
  const [expandedResources, setExpandedResources] = useState<Set<string>>(new Set())
  const [expandedDescriptions, setExpandedDescriptions] = useState<Set<string>>(new Set())

  const handleSearch = async () => {
    if (!query.trim()) {
      setError("Please enter a search query")
      return
    }

    setLoading(true)
    setError(null)
    setDatasets([])
    setRequestTime(new Date().toISOString())

    try {
      const params = new URLSearchParams({
        query: query.trim(),
        rows: resultsLimit,
        ...(organization.trim() && { organization: organization.trim() }),
      })

      const response = await fetch(`/api/ckan-search?${params}`)
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

      setDatasets(data.datasets || [])
      setTotalCount(data.count || 0)
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setLoading(false)
    }
  }

  const handleClear = () => {
    setQuery("")
    setOrganization("")
    setResultsLimit("10") // Changed default results limit from "100" to "10"
    setDatasets([])
    setTotalCount(0)
    setError(null)
    setMetadata(null)
    setRequestTime(null)
    setExpandedResources(new Set())
    setExpandedDescriptions(new Set())
  }

  const toggleResourceExpansion = (datasetId: string) => {
    setExpandedResources((prev) => {
      const next = new Set(prev)
      if (next.has(datasetId)) {
        next.delete(datasetId)
      } else {
        next.add(datasetId)
      }
      return next
    })
  }

  const toggleDescriptionExpansion = (datasetId: string) => {
    setExpandedDescriptions((prev) => {
      const next = new Set(prev)
      if (next.has(datasetId)) {
        next.delete(datasetId)
      } else {
        next.add(datasetId)
      }
      return next
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>data.overheid.nl CKAN API</CardTitle>
        <CardDescription>Discover municipal datasets and their metadata using the CKAN action API</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ckan-query">Search Query</Label>
            <Input
              id="ckan-query"
              placeholder="e.g., gemeente, bestemmingsplan, vergunning"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="organization">Organization (Optional)</Label>
            <Input
              id="organization"
              placeholder="e.g., gemeente-amsterdam"
              value={organization}
              onChange={(e) => setOrganization(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ckan-results-limit">Results Limit</Label>
            <Select value={resultsLimit} onValueChange={setResultsLimit}>
              <SelectTrigger id="ckan-results-limit">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10 datasets</SelectItem>
                <SelectItem value="20">20 datasets</SelectItem>
                <SelectItem value="50">50 datasets</SelectItem>
                <SelectItem value="100">100 datasets</SelectItem>
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
                  Search Datasets
                </>
              )}
            </Button>
            <Button onClick={handleClear} disabled={!query && !organization && datasets.length === 0} variant="outline">
              Clear
            </Button>
          </div>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {datasets.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">
              Datasets ({datasets.length} of {totalCount})
            </h3>
            <div className="space-y-4">
              {datasets.map((dataset) => {
                const isDescriptionLong = dataset.notes && dataset.notes.length > 400
                const hasMoreResources = dataset.resources && dataset.resources.length > 3

                return (
                  <Card key={dataset.id}>
                    <CardHeader className="pb-0">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <CardTitle className="text-base">{dataset.title}</CardTitle>
                          {dataset.organization && (
                            <CardDescription className="mt-1">{dataset.organization.title}</CardDescription>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {dataset.notes && (
                        <div className="space-y-1">
                          <p
                            className={`text-sm text-muted-foreground ${
                              expandedDescriptions.has(dataset.id) ? "" : "line-clamp-3"
                            }`}
                          >
                            {dataset.notes}
                          </p>
                          {isDescriptionLong && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleDescriptionExpansion(dataset.id)}
                              className="h-auto p-0 text-xs text-primary hover:underline"
                            >
                              {expandedDescriptions.has(dataset.id) ? "Show less" : "Show more"}
                            </Button>
                          )}
                        </div>
                      )}

                      {dataset.tags && dataset.tags.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {dataset.tags.slice(0, 5).map((tag) => (
                            <Badge key={tag.name} variant="secondary">
                              {tag.name}
                            </Badge>
                          ))}
                        </div>
                      )}

                      {dataset.resources && dataset.resources.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-sm font-medium">Resources ({dataset.resources.length})</p>
                          <div className="space-y-1">
                            {(expandedResources.has(dataset.id)
                              ? dataset.resources
                              : dataset.resources.slice(0, 3)
                            ).map((resource) => (
                              <div key={resource.id} className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground truncate flex-1">{resource.name}</span>
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline">{resource.format}</Badge>
                                  <a
                                    href={resource.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-primary hover:underline"
                                  >
                                    <ExternalLink className="h-4 w-4" />
                                  </a>
                                </div>
                              </div>
                            ))}
                          </div>
                          {hasMoreResources && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleResourceExpansion(dataset.id)}
                              className="w-full text-xs"
                            >
                              {expandedResources.has(dataset.id)
                                ? "Show less"
                                : `Show ${dataset.resources.length - 3} more`}
                            </Button>
                          )}
                        </div>
                      )}

                      <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2 border-t">
                        <span>ID: {dataset.name}</span>
                        {dataset.metadata_modified && (
                          <span>Updated: {new Date(dataset.metadata_modified).toLocaleDateString()}</span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </div>
        )}

        {!loading && !error && datasets.length === 0 && query && (
          <div className="text-center py-8 text-muted-foreground">No datasets found. Try a different search query.</div>
        )}

        <DebugPanel
          request={
            requestTime
              ? {
                  endpoint: `/api/ckan-search`,
                  method: "GET",
                  params: { query, ...(organization && { organization }), rows: resultsLimit },
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
                  resultCount: datasets.length,
                  totalRecords: totalCount,
                }
              : undefined
          }
          error={error}
        />

        <div className="border-t pt-4">
          <details className="space-y-2 group">
            <summary className="text-sm font-medium cursor-pointer hover:text-primary flex items-center gap-2 list-none">
              <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
              About CKAN Metadata API
            </summary>
            <div className="text-xs text-muted-foreground space-y-2 pl-4">
              <p>
                The CKAN (Comprehensive Knowledge Archive Network) API provides access to the metadata catalog of
                data.overheid.nl, the Dutch national government data portal.
              </p>
              <ul className="list-disc list-inside space-y-1">
                <li>Discover datasets from government organizations</li>
                <li>Access metadata conforming to DCAT-AP-NL standards</li>
                <li>Filter by organization, tags, and keywords</li>
                <li>Retrieve resource URLs for actual data downloads</li>
              </ul>
              <p className="pt-2">
                This is a metadata registry - it provides information about datasets and links to where data is stored,
                but doesn't host the data itself. Use the resource URLs to access actual policy documents and data
                files.
              </p>
            </div>
          </details>
        </div>
      </CardContent>
    </Card>
  )
}
