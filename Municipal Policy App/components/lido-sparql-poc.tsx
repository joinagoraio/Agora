"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ChevronDown, AlertCircle } from "lucide-react"

export function LiDOSparqlPOC() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>LiDO SPARQL Endpoint</CardTitle>
        <CardDescription>Query linked legal and regulatory data using SPARQL</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <div className="space-y-3">
              <p className="font-medium">SPARQL Endpoint Not Available</p>
              <p className="text-sm text-primary">
                The LiDO (Linked Data Overheid) dataset is only available as a downloadable dump file (tens of
                gigabytes), not as a live SPARQL endpoint. There is no public API to query this data directly.
              </p>
              <div className="text-sm space-y-2 text-primary">
                <p className="font-medium">Alternative options:</p>
                <ul className="list-disc list-inside ml-2 space-y-1">
                  <li>
                    <strong>CKAN Metadata POC</strong> - Search for datasets on data.overheid.nl
                  </li>
                  <li>
                    <strong>Overheid Search POC</strong> - Search official publications and documents
                  </li>
                  <li>
                    <strong>Official Publications POC</strong> - Access government publications directly
                  </li>
                  <li>
                    Download the LiDO dump from{" "}
                    <a
                      href="https://data.overheid.nl/en/dataset/linked-data-overheid"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:text-primary"
                    >
                      data.overheid.nl
                    </a>{" "}
                    for local processing
                  </li>
                </ul>
              </div>
            </div>
          </AlertDescription>
        </Alert>

        <div className="border-t pt-4">
          <details className="space-y-2 group">
            <summary className="text-sm font-medium cursor-pointer hover:text-primary flex items-center gap-2 list-none">
              <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
              About LiDO (Linked Data Overheid)
            </summary>
            <div className="text-xs text-muted-foreground space-y-2 pl-4">
              <p>
                LiDO (Linked Data Overheid) is a linked data knowledge base that aggregates Dutch legal, regulatory, and
                government content using semantic web technologies.
              </p>
              <ul className="list-disc list-inside space-y-1">
                <li>Contains laws, regulations, parliamentary documents, and judgments</li>
                <li>Uses RDF (Resource Description Framework) for semantic relationships</li>
                <li>Large dataset (tens of gigabytes when unpacked)</li>
                <li>Available as a monthly updated dump file, not as a live API</li>
                <li>Requires local setup to query with SPARQL</li>
              </ul>
              <p className="pt-2">
                While LiDO provides rich linked data, it requires downloading and setting up a local SPARQL endpoint
                (such as Apache Jena Fuseki or Virtuoso) to query the data. For immediate access to government data, use
                the other POCs in this application.
              </p>
            </div>
          </details>
        </div>
      </CardContent>
    </Card>
  )
}
