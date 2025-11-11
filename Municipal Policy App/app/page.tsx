import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { OverheidSearchPOC } from "@/components/overheid-search-poc"
import { CKANMetadataPOC } from "@/components/ckan-metadata-poc"
import { LiDOSparqlPOC } from "@/components/lido-sparql-poc"
import { OfficialPublicationsPOC } from "@/components/official-publications-poc"
import { SRUWebservicePOC } from "@/components/sru-webservice-poc"

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Municipal Policy Search</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Access Dutch municipal policies and regulations for compliance
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8">
        <Tabs defaultValue="overheid-search" className="w-full">
          <TabsList className="grid w-full grid-cols-5 mb-8">
            <TabsTrigger value="overheid-search">Overheid Search</TabsTrigger>
            <TabsTrigger value="ckan-metadata">CKAN Metadata</TabsTrigger>
            <TabsTrigger value="official-publications">Official Publications</TabsTrigger>
            <TabsTrigger value="sru-webservice">SRU Webservice</TabsTrigger>
            <TabsTrigger value="lido-sparql">LiDO SPARQL</TabsTrigger>
          </TabsList>

          <TabsContent value="overheid-search">
            <OverheidSearchPOC />
          </TabsContent>

          <TabsContent value="ckan-metadata">
            <CKANMetadataPOC />
          </TabsContent>

          <TabsContent value="official-publications">
            <OfficialPublicationsPOC />
          </TabsContent>

          <TabsContent value="sru-webservice">
            <SRUWebservicePOC />
          </TabsContent>

          <TabsContent value="lido-sparql">
            <LiDOSparqlPOC />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}
