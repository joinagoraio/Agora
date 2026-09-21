"use client"

import { useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Loader2, Search, CheckCircle2, ExternalLink, Plus, AlertCircle } from "lucide-react"
import { DocumentFileTypeIcon } from "@/components/document-file-type-icon"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { DebugPanel } from "@/components/debug-panel"

// Common interfaces
interface SearchResult {
  title: string
  identifier: string
  type: string
  date?: string
  description?: string
  url?: string
}

interface OverheidSearchProps {
  onDocumentsSelected?: (documents: SearchResult[]) => void
  showSelection?: boolean
  initialLocation?: string
  initialQuery?: string
}

// Overheid Search Component
function OverheidSearchTab({ onDocumentsSelected, showSelection = true, initialLocation, initialQuery }: OverheidSearchProps) {
  const [query, setQuery] = useState(initialQuery || "")
  const [location, setLocation] = useState(initialLocation || "")
  const [resultsLimit, setResultsLimit] = useState("10")
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<SearchResult[]>([])
  const [selectedResults, setSelectedResults] = useState<Set<number>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [hasSearched, setHasSearched] = useState(false)
  const [requestTime, setRequestTime] = useState<string | null>(null)
  const [metadata, setMetadata] = useState<{
    duration?: number
    fetchTime?: number
    endpoint?: string
    query?: string
    totalRecords?: number
  } | null>(null)

  const handleSearch = async () => {
    if (!query.trim()) {
      setError("Please enter a search query")
      return
    }

    setLoading(true)
    setError(null)
    setResults([])
    setSelectedResults(new Set())
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

  const toggleResultSelection = (index: number) => {
    if (!showSelection) return
    
    const newSelected = new Set(selectedResults)
    if (newSelected.has(index)) {
      newSelected.delete(index)
    } else {
      newSelected.add(index)
    }
    setSelectedResults(newSelected)
  }

  const handleAddSelected = () => {
    if (onDocumentsSelected && selectedResults.size > 0) {
      const documentsToAdd = Array.from(selectedResults).map((index) => results[index])
      onDocumentsSelected(documentsToAdd)
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="query">Search Query</Label>
          <Input
            id="query"
            placeholder="e.g., bestemmingsplan, bouwvergunning"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !loading && handleSearch()}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="location">Location (Optional)</Label>
          <Input
            id="location"
            placeholder="e.g., Amsterdam, Rotterdam"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !loading && handleSearch()}
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
          <Button onClick={handleSearch} disabled={loading || !query.trim()} className="flex-1">
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
          <Button
            onClick={() => {
              setQuery("")
              setLocation("")
              setResults([])
              setSelectedResults(new Set())
              setError(null)
              setHasSearched(false)
              setRequestTime(null)
              setMetadata(null)
            }}
            disabled={!hasSearched && !query && !location}
            variant="outline"
          >
            Clear
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!loading && results.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">
              {metadata?.totalRecords !== undefined
                ? `Showing ${results.length} of ${metadata.totalRecords} results`
                : `Results (${results.length})`}
              {showSelection && selectedResults.size > 0 && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  - {selectedResults.size} selected
                </span>
              )}
            </h3>
            {showSelection && selectedResults.size > 0 && onDocumentsSelected && (
              <Button onClick={handleAddSelected} size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Add Selected ({selectedResults.size})
              </Button>
            )}
          </div>
          <div className="space-y-3 max-h-[500px] overflow-y-auto">
            {results.map((result, index) => {
              const isSelected = showSelection && selectedResults.has(index)
              return (
                <Card
                  key={`${result.identifier}-${index}`}
                  className={`transition-all ${
                    showSelection ? "cursor-pointer hover:shadow-md" : ""
                  }`}
                  onClick={() => showSelection && toggleResultSelection(index)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start gap-4">
                      <DocumentFileTypeIcon
                        document={{ mimeType: result.type, fileName: result.url, title: result.title }}
                        className="mt-0.5"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          {showSelection && isSelected && <CheckCircle2 className="h-5 w-5 text-green-600" />}
                          {result.type && result.type.toLowerCase() !== "pdf" && <Badge variant="secondary">{result.type}</Badge>}
                          {result.date && <span className="text-xs text-muted-foreground">{result.date}</span>}
                        </div>
                        <CardTitle className="text-base">{result.title}</CardTitle>
                        {result.identifier && (
                          <CardDescription className="mt-1">ID: {result.identifier}</CardDescription>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  {(result.description || result.url) && (
                    <CardContent className="pt-0 space-y-2">
                      {result.description && <p className="text-sm text-muted-foreground">{result.description}</p>}
                      {result.url && (
                        <a
                          href={result.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-primary hover:underline inline-flex items-center gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          View document
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </CardContent>
                  )}
                </Card>
              )
            })}
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
                totalRecords: metadata.totalRecords,
              }
            : undefined
        }
        error={error}
      />
    </div>
  )
}

// CKAN Metadata Component
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

function CKANMetadataTab({ onDocumentsSelected, showSelection = true }: OverheidSearchProps) {
  const [query, setQuery] = useState("")
  const [organization, setOrganization] = useState("")
  const [resultsLimit, setResultsLimit] = useState("10")
  const [loading, setLoading] = useState(false)
  const [datasets, setDatasets] = useState<CKANDataset[]>([])
  const [selectedResults, setSelectedResults] = useState<Set<number>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [hasSearched, setHasSearched] = useState(false)
  const [requestTime, setRequestTime] = useState<string | null>(null)
  const [metadata, setMetadata] = useState<{
    duration?: number
    fetchTime?: number
    endpoint?: string
    query?: string
    totalRecords?: number
  } | null>(null)

  const handleSearch = async () => {
    if (!query.trim()) {
      setError("Please enter a search query")
      return
    }

    setLoading(true)
    setError(null)
    setDatasets([])
    setSelectedResults(new Set())
    setRequestTime(new Date().toISOString())
    setHasSearched(true)

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
        totalRecords: data.metadata?.totalRecords || data.count,
      })

      if (!response.ok) {
        throw new Error(data.error || "Search failed")
      }

      setDatasets(data.datasets || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setLoading(false)
    }
  }

  const toggleResultSelection = (index: number) => {
    if (!showSelection) return
    
    const newSelected = new Set(selectedResults)
    if (newSelected.has(index)) {
      newSelected.delete(index)
    } else {
      newSelected.add(index)
    }
    setSelectedResults(newSelected)
  }

  const handleAddSelected = () => {
    if (onDocumentsSelected && selectedResults.size > 0) {
      const documentsToAdd = Array.from(selectedResults).map((index) => {
        const dataset = datasets[index]
        return {
          title: dataset.title,
          identifier: dataset.id || dataset.name,
          type: dataset.organization?.title || "Dataset",
          description: dataset.notes,
          url: dataset.resources?.[0]?.url,
        }
      })
      onDocumentsSelected(documentsToAdd)
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="ckan-query">Search Query</Label>
          <Input
            id="ckan-query"
            placeholder="e.g., gemeente, bestemmingsplan, vergunning"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !loading && handleSearch()}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="organization">Organization (Optional)</Label>
          <Input
            id="organization"
            placeholder="e.g., gemeente-amsterdam"
            value={organization}
            onChange={(e) => setOrganization(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !loading && handleSearch()}
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
          <Button onClick={handleSearch} disabled={loading || !query.trim()} className="flex-1">
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
          <Button
            onClick={() => {
              setQuery("")
              setOrganization("")
              setDatasets([])
              setSelectedResults(new Set())
              setError(null)
              setHasSearched(false)
              setRequestTime(null)
              setMetadata(null)
            }}
            disabled={!hasSearched && !query && !organization}
            variant="outline"
          >
            Clear
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!loading && datasets.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">
              {metadata?.totalRecords !== undefined
                ? `Showing ${datasets.length} of ${metadata.totalRecords} datasets`
                : `Datasets (${datasets.length})`}
              {showSelection && selectedResults.size > 0 && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  - {selectedResults.size} selected
                </span>
              )}
            </h3>
            {showSelection && selectedResults.size > 0 && onDocumentsSelected && (
              <Button onClick={handleAddSelected} size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Add Selected ({selectedResults.size})
              </Button>
            )}
          </div>
          <div className="space-y-3 max-h-[500px] overflow-y-auto">
            {datasets.map((dataset, index) => {
              const isSelected = showSelection && selectedResults.has(index)
              return (
                <Card
                  key={dataset.id}
                  className={`transition-all ${
                    showSelection ? "cursor-pointer hover:shadow-md" : ""
                  }`}
                  onClick={() => showSelection && toggleResultSelection(index)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          {showSelection && isSelected && <CheckCircle2 className="h-5 w-5 text-green-600" />}
                          {dataset.organization && (
                            <Badge variant="secondary">{dataset.organization.title}</Badge>
                          )}
                        </div>
                        <CardTitle className="text-base">{dataset.title}</CardTitle>
                        {dataset.notes && (
                          <CardDescription className="mt-1 line-clamp-2">{dataset.notes}</CardDescription>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  {dataset.resources && dataset.resources.length > 0 && (
                    <CardContent className="pt-0">
                      <div className="text-sm text-muted-foreground mb-2">
                        {dataset.resources.length} resource(s) available
                      </div>
                      {dataset.resources[0]?.url && (
                        <a
                          href={dataset.resources[0].url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-primary hover:underline inline-flex items-center gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          View dataset
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </CardContent>
                  )}
                </Card>
              )
            })}
          </div>
        </div>
      )}

      {!loading && !error && datasets.length === 0 && hasSearched && (
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
              }
            : undefined
        }
        error={error}
      />
    </div>
  )
}

// SRU Webservice Component
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

function SRUWebserviceTab({ onDocumentsSelected, showSelection = true }: OverheidSearchProps) {
  const [query, setQuery] = useState("")
  const [collection, setCollection] = useState<string>("cvdr")
  const [location, setLocation] = useState("")
  const [resultsLimit, setResultsLimit] = useState("10")
  const [loading, setLoading] = useState(false)
  const [records, setRecords] = useState<SRURecord[]>([])
  const [selectedResults, setSelectedResults] = useState<Set<number>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [hasSearched, setHasSearched] = useState(false)
  const [requestTime, setRequestTime] = useState<string | null>(null)
  const [metadata, setMetadata] = useState<{
    duration?: number
    fetchTime?: number
    endpoint?: string
    query?: string
    totalRecords?: number
  } | null>(null)

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
    setSelectedResults(new Set())
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
        totalRecords: data.metadata?.totalRecords || data.totalRecords,
      })

      if (!response.ok) {
        throw new Error(data.error || "Search failed")
      }

      setRecords(data.records || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setLoading(false)
    }
  }

  const toggleResultSelection = (index: number) => {
    if (!showSelection) return
    
    const newSelected = new Set(selectedResults)
    if (newSelected.has(index)) {
      newSelected.delete(index)
    } else {
      newSelected.add(index)
    }
    setSelectedResults(newSelected)
  }

  const handleAddSelected = () => {
    if (onDocumentsSelected && selectedResults.size > 0) {
      const documentsToAdd = Array.from(selectedResults).map((index) => {
        const record = records[index]
        return {
          title: record.title,
          identifier: record.identifier,
          type: record.type || "Document",
          date: record.modified,
          description: record.description,
        }
      })
      onDocumentsSelected(documentsToAdd)
    }
  }

  return (
    <div className="space-y-6">
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
        </div>

        <div className="space-y-2">
          <Label htmlFor="sru-query">Search Query</Label>
          <Input
            id="sru-query"
            placeholder="e.g., bestemmingsplan, verordening"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !loading && handleSearch()}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="sru-location">Location (Optional)</Label>
          <Input
            id="sru-location"
            placeholder="e.g., Amsterdam, Utrecht"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !loading && handleSearch()}
          />
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
          <Button onClick={handleSearch} disabled={loading || !query.trim()} className="flex-1">
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
          <Button
            onClick={() => {
              setQuery("")
              setLocation("")
              setRecords([])
              setSelectedResults(new Set())
              setError(null)
              setHasSearched(false)
              setRequestTime(null)
              setMetadata(null)
            }}
            disabled={!hasSearched && !query && !location}
            variant="outline"
          >
            Clear
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!loading && records.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">
              {metadata?.totalRecords !== undefined
                ? `Showing ${records.length} of ${metadata.totalRecords} results`
                : `Results (${records.length})`}
              {showSelection && selectedResults.size > 0 && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  - {selectedResults.size} selected
                </span>
              )}
            </h3>
            {showSelection && selectedResults.size > 0 && onDocumentsSelected && (
              <Button onClick={handleAddSelected} size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Add Selected ({selectedResults.size})
              </Button>
            )}
          </div>
          <div className="space-y-3 max-h-[500px] overflow-y-auto">
            {records.map((record, index) => {
              const isSelected = showSelection && selectedResults.has(index)
              return (
                <Card
                  key={`${record.identifier}-${index}`}
                  className={`transition-all ${
                    showSelection ? "cursor-pointer hover:shadow-md" : ""
                  }`}
                  onClick={() => showSelection && toggleResultSelection(index)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start gap-3">
                      <DocumentFileTypeIcon
                        document={{ mimeType: record.type, fileName: record.identifier, title: record.title }}
                        className="mt-0.5"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          {showSelection && isSelected && <CheckCircle2 className="h-5 w-5 text-green-600" />}
                          {record.creator && <Badge variant="secondary">{record.creator}</Badge>}
                          {record.type && record.type.toLowerCase() !== "pdf" && <Badge variant="outline">{record.type}</Badge>}
                        </div>
                        <CardTitle className="text-base">{record.title}</CardTitle>
                      </div>
                    </div>
                  </CardHeader>
                  {(record.description || record.spatial || record.subject) && (
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
                      </div>
                      <div className="pt-2 border-t">
                        <p className="text-xs text-muted-foreground">ID: {record.identifier}</p>
                      </div>
                    </CardContent>
                  )}
                </Card>
              )
            })}
          </div>
        </div>
      )}

      {!loading && !error && records.length === 0 && hasSearched && (
        <div className="text-center py-8 text-muted-foreground">
          No results found. Try a different search query or collection.
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
                status: error ? 500 : 200,
                statusText: error ? "Error" : "OK",
                duration: metadata.duration,
                fetchTime: metadata.fetchTime,
                resultCount: records.length,
              }
            : undefined
        }
        error={error}
      />
    </div>
  )
}

// Official Publications Component
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

function OfficialPublicationsTab({ onDocumentsSelected, showSelection = true }: OverheidSearchProps) {
  const [query, setQuery] = useState("")
  const [publicationType, setPublicationType] = useState<string>("all")
  const [resultsLimit, setResultsLimit] = useState("10")
  const [loading, setLoading] = useState(false)
  const [publications, setPublications] = useState<Publication[]>([])
  const [selectedResults, setSelectedResults] = useState<Set<number>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [hasSearched, setHasSearched] = useState(false)
  const [requestTime, setRequestTime] = useState<string | null>(null)
  const [metadata, setMetadata] = useState<{
    duration?: number
    fetchTime?: number
    endpoint?: string
    query?: string
    totalRecords?: number
  } | null>(null)

  const handleSearch = async () => {
    if (!query.trim()) {
      setError("Please enter a search query")
      return
    }

    setLoading(true)
    setError(null)
    setPublications([])
    setSelectedResults(new Set())
    setRequestTime(new Date().toISOString())
    setHasSearched(true)

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
        totalRecords: data.metadata?.totalRecords,
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

  const toggleResultSelection = (index: number) => {
    if (!showSelection) return
    
    const newSelected = new Set(selectedResults)
    if (newSelected.has(index)) {
      newSelected.delete(index)
    } else {
      newSelected.add(index)
    }
    setSelectedResults(newSelected)
  }

  const handleAddSelected = () => {
    if (onDocumentsSelected && selectedResults.size > 0) {
      const documentsToAdd = Array.from(selectedResults).map((index) => {
        const pub = publications[index]
        return {
          title: pub.title,
          identifier: pub.identifier,
          type: pub.type,
          date: pub.publicationDate,
          description: pub.description,
          url: pub.url,
        }
      })
      onDocumentsSelected(documentsToAdd)
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="pub-query">Search Query</Label>
          <Input
            id="pub-query"
            placeholder="e.g., gemeentelijke verordening, raadsbesluit"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !loading && handleSearch()}
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
          <Button onClick={handleSearch} disabled={loading || !query.trim()} className="flex-1">
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
          <Button
            onClick={() => {
              setQuery("")
              setPublicationType("all")
              setPublications([])
              setSelectedResults(new Set())
              setError(null)
              setHasSearched(false)
              setRequestTime(null)
              setMetadata(null)
            }}
            disabled={!hasSearched && !query}
            variant="outline"
          >
            Clear
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!loading && publications.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">
              {metadata?.totalRecords !== undefined
                ? `Showing ${publications.length} of ${metadata.totalRecords} publications`
                : `Publications (${publications.length})`}
              {showSelection && selectedResults.size > 0 && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  - {selectedResults.size} selected
                </span>
              )}
            </h3>
            {showSelection && selectedResults.size > 0 && onDocumentsSelected && (
              <Button onClick={handleAddSelected} size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Add Selected ({selectedResults.size})
              </Button>
            )}
          </div>
          <div className="space-y-3 max-h-[500px] overflow-y-auto">
            {publications.map((pub, index) => {
              const isSelected = showSelection && selectedResults.has(index)
              return (
                <Card
                  key={`${pub.identifier}-${index}`}
                  className={`transition-all ${
                    showSelection ? "cursor-pointer hover:shadow-md" : ""
                  }`}
                  onClick={() => showSelection && toggleResultSelection(index)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start gap-4">
                      <DocumentFileTypeIcon
                        document={{ mimeType: pub.type, fileName: pub.url, title: pub.title }}
                        className="mt-0.5"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          {showSelection && isSelected && <CheckCircle2 className="h-5 w-5 text-green-600" />}
                          {pub.type && pub.type.toLowerCase() !== "pdf" && <Badge variant="secondary">{pub.type}</Badge>}
                        </div>
                        <CardTitle className="text-base">{pub.title}</CardTitle>
                        {pub.publisher && <CardDescription className="mt-1">{pub.publisher}</CardDescription>}
                      </div>
                    </div>
                  </CardHeader>
                  {(pub.description || pub.subject || pub.url) && (
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
                            onClick={(e) => e.stopPropagation()}
                          >
                            View document
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    </CardContent>
                  )}
                </Card>
              )
            })}
          </div>
        </div>
      )}

      {!loading && !error && publications.length === 0 && hasSearched && (
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
    </div>
  )
}

// LiDO SPARQL Component (Placeholder)
function LiDOSparqlTab() {
  return (
    <Alert>
      <AlertCircle className="h-4 w-4" />
      <AlertDescription>
        <div className="space-y-3">
          <p className="font-medium">SPARQL Endpoint Not Available</p>
          <p className="text-sm">
            The LiDO (Linked Data Overheid) dataset is only available as a downloadable dump file (tens of gigabytes),
            not as a live SPARQL endpoint. There is no public API to query this data directly.
          </p>
          <div className="text-sm space-y-2">
            <p className="font-medium">Alternative options:</p>
            <ul className="list-disc list-inside ml-2 space-y-1">
              <li>
                <strong>CKAN Metadata</strong> - Search for datasets on data.overheid.nl
              </li>
              <li>
                <strong>Overheid Search</strong> - Search official publications and documents
              </li>
              <li>
                <strong>Official Publications</strong> - Access government publications directly
              </li>
            </ul>
          </div>
        </div>
      </AlertDescription>
    </Alert>
  )
}

// Main Unified Component with Tabs
export function OverheidSearch({ onDocumentsSelected, showSelection = true, initialLocation, initialQuery }: OverheidSearchProps) {
  return (
    <Tabs defaultValue="overheid-search" className="w-full">
      <TabsList className="flex w-full flex-wrap gap-2 mb-6">
        <TabsTrigger value="overheid-search">Overheid Search</TabsTrigger>
        <TabsTrigger value="ckan-metadata">CKAN Metadata</TabsTrigger>
        <TabsTrigger value="official-publications">Official Publications</TabsTrigger>
        <TabsTrigger value="sru-webservice">SRU Webservice</TabsTrigger>
        <TabsTrigger value="lido-sparql">LiDO SPARQL</TabsTrigger>
      </TabsList>

      <TabsContent value="overheid-search">
        <OverheidSearchTab onDocumentsSelected={onDocumentsSelected} showSelection={showSelection} initialLocation={initialLocation} initialQuery={initialQuery} />
      </TabsContent>

      <TabsContent value="ckan-metadata">
        <CKANMetadataTab onDocumentsSelected={onDocumentsSelected} showSelection={showSelection} />
      </TabsContent>

      <TabsContent value="official-publications">
        <OfficialPublicationsTab onDocumentsSelected={onDocumentsSelected} showSelection={showSelection} />
      </TabsContent>

      <TabsContent value="sru-webservice">
        <SRUWebserviceTab onDocumentsSelected={onDocumentsSelected} showSelection={showSelection} />
      </TabsContent>

      <TabsContent value="lido-sparql">
        <LiDOSparqlTab />
      </TabsContent>
    </Tabs>
  )
}
