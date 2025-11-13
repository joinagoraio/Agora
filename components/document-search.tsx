"use client"

import type React from "react"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Search, FileText, ExternalLink, Loader2, Filter, X } from "lucide-react"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"

interface DocumentSearchProps {
  workspaceId: string
}

export function DocumentSearch({ workspaceId }: DocumentSearchProps) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<any[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [filters, setFilters] = useState<{
    domain?: string
    municipality?: string
    year?: string
    classification?: string
  }>({})

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!query.trim()) return

    setIsSearching(true)
    setHasSearched(true)

    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, query, filters }),
      })

      const data = await response.json()
      setResults(data.results || [])
    } catch (error) {
      console.error("[v0] Search error:", error)
      setResults([])
    } finally {
      setIsSearching(false)
    }
  }

  const clearFilters = () => {
    setFilters({})
  }

  const hasActiveFilters = Object.values(filters).some((v) => v && v.trim() !== "")

  return (
    <div className="space-y-6">
      <form onSubmit={handleSearch} className="space-y-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search documents..."
              className="pl-10"
            />
          </div>
          <Button type="submit" disabled={isSearching || !query.trim()}>
            {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
          </Button>
        </div>

        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="filters" className="border-none">
            <AccordionTrigger className="py-2 text-sm font-medium text-muted-foreground hover:no-underline">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4" />
                <span>Filters</span>
                {hasActiveFilters && (
                  <Badge variant="secondary" className="ml-2">
                    Active
                  </Badge>
                )}
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-2">
                  <Label htmlFor="domain">Domain</Label>
                  <Input
                    id="domain"
                    value={filters.domain || ""}
                    onChange={(e) => setFilters({ ...filters, domain: e.target.value })}
                    placeholder="Filter by domain"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="municipality">Municipality</Label>
                  <Input
                    id="municipality"
                    value={filters.municipality || ""}
                    onChange={(e) => setFilters({ ...filters, municipality: e.target.value })}
                    placeholder="Filter by municipality"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="year">Year</Label>
                  <Input
                    id="year"
                    type="number"
                    value={filters.year || ""}
                    onChange={(e) => setFilters({ ...filters, year: e.target.value })}
                    placeholder="Filter by year"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="classification">Classification</Label>
                  <Select
                    value={filters.classification || ""}
                    onValueChange={(value) =>
                      setFilters({ ...filters, classification: value || undefined })
                    }
                  >
                    <SelectTrigger id="classification">
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">All</SelectItem>
                      <SelectItem value="public">Public</SelectItem>
                      <SelectItem value="internal">Internal</SelectItem>
                      <SelectItem value="confidential">Confidential</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {hasActiveFilters && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  className="mt-4"
                >
                  <X className="mr-2 h-4 w-4" />
                  Clear Filters
                </Button>
              )}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </form>

      {hasSearched && (
        <div className="space-y-4">
          {isSearching ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : results.length > 0 ? (
            <>
              <p className="text-sm text-muted-foreground">
                Found {results.length} result{results.length !== 1 ? "s" : ""}
              </p>
              {results.map((doc) => (
                <Card key={doc.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <FileText className="h-5 w-5 text-primary" />
                        <div>
                          <CardTitle className="text-lg">{doc.title}</CardTitle>
                          <div className="mt-1 flex flex-wrap gap-2">
                            {doc.classification && (
                              <Badge variant="outline">{doc.classification}</Badge>
                            )}
                            {doc.domain && <Badge variant="secondary">{doc.domain}</Badge>}
                            {doc.municipality && (
                              <Badge variant="secondary">{doc.municipality}</Badge>
                            )}
                            {doc.publication_date && (
                              <Badge variant="secondary">
                                {new Date(doc.publication_date).getFullYear()}
                              </Badge>
                            )}
                          </div>
                          {doc.external_url && (
                            <CardDescription className="mt-1">
                              <a
                                href={doc.external_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 hover:underline"
                              >
                                View source
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            </CardDescription>
                          )}
                        </div>
                      </div>
                      <Badge variant={doc.status === "ready" ? "default" : "secondary"}>
                        {doc.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="line-clamp-3 text-sm text-muted-foreground">
                      {doc.content?.substring(0, 300)}...
                    </p>
                    {doc.synced_at && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Last synced: {new Date(doc.synced_at).toLocaleString()}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Search className="mb-4 h-12 w-12 text-muted-foreground" />
                <h3 className="mb-2 text-lg font-semibold">No results found</h3>
                <p className="text-center text-sm text-muted-foreground">
                  Try different keywords or check if documents are synced
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
