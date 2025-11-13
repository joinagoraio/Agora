import { getWorkspaceShareData } from "@/lib/actions/workspace-share"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Building2, Lock, FileText, ExternalLink } from "lucide-react"
import ReactMarkdown from "react-markdown"

export default async function WorkspaceSharePage({
  params,
}: {
  params: Promise<{ workspaceId: string; token: string }>
}) {
  const { workspaceId, token } = await params

  const { data, error } = await getWorkspaceShareData(workspaceId, token)

  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Lock className="mb-4 h-12 w-12 text-muted-foreground" />
            <h2 className="mb-2 text-xl font-bold">Access Denied</h2>
            <p className="text-center text-sm text-muted-foreground">
              {error || "This shared workspace link is invalid or has expired."}
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const { workspace, items, inheritedItems, parentSpaces } = data

  return (
    <div className="flex min-h-screen flex-col">
      <header className="bg-card">
        <div className="flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <Building2 className="h-6 w-6" />
            <div>
              <h1 className="text-xl font-bold">AGORA</h1>
              <p className="text-xs text-muted-foreground">Shared Workspace View</p>
            </div>
          </div>
          <Badge variant="secondary">Public View • Read-only</Badge>
        </div>
      </header>

      <main className="flex-1 bg-white">
        <div className="container mx-auto max-w-4xl py-8 px-4">
          <div className="mb-6">
            <h2 className="text-2xl font-semibold">{workspace.name}</h2>
            <p className="text-sm text-muted-foreground">
              {workspace.description || "Public workspace view"}
            </p>
            {parentSpaces.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {parentSpaces.map((space: any) => (
                  <Badge key={space.id} variant="outline">
                    {space.name} ({space.space_type})
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Evidence Items */}
          {items.length > 0 && (
            <div className="mb-8">
              <h3 className="mb-4 text-lg font-semibold">Evidence</h3>
              <div className="space-y-4">
                {items
                  .filter((item: any) => item.payload?.type === "evidence")
                  .map((item: any) => (
                    <Card key={item.id}>
                      <CardContent className="p-4">
                        <div className="mb-2 flex items-center justify-between">
                          <Badge variant="outline">{item.payload?.confidence || "medium"} confidence</Badge>
                          <span className="text-xs text-muted-foreground">
                            {new Date(item.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        <h4 className="mb-2 font-medium">{item.payload?.question}</h4>
                        <div className="prose prose-sm max-w-none">
                          <ReactMarkdown>{item.payload?.answer || ""}</ReactMarkdown>
                        </div>
                        {item.payload?.citations && item.payload.citations.length > 0 && (
                          <div className="mt-3 space-y-2 border-t pt-3">
                            <p className="text-xs font-medium">Sources:</p>
                            <div className="flex flex-wrap gap-2">
                              {item.payload.citations.map((citation: any, idx: number) => (
                                <a
                                  key={idx}
                                  href={citation.url || "#"}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1"
                                >
                                  <Badge variant="secondary" className="text-xs">
                                    <FileText className="mr-1 h-3 w-3" />
                                    {citation.title}
                                    {citation.url && <ExternalLink className="ml-1 h-3 w-3" />}
                                    <span className="ml-1 text-xs opacity-70">({citation.layer})</span>
                                  </Badge>
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
              </div>
            </div>
          )}

          {/* Inherited Items */}
          {inheritedItems.length > 0 && (
            <div className="mb-8">
              <h3 className="mb-4 text-lg font-semibold">Inherited from Parent Spaces</h3>
              <div className="space-y-4">
                {inheritedItems.map((item: any) => (
                  <Card key={item.id}>
                    <CardContent className="p-4">
                      <div className="mb-2 flex items-center justify-between">
                        <Badge variant="outline">{item.item_type}</Badge>
                        <Badge variant="secondary">{item.spaces?.space_type || "local"}</Badge>
                      </div>
                      <div className="prose prose-sm max-w-none">
                        {typeof item.payload === "string" ? (
                          <ReactMarkdown>{item.payload}</ReactMarkdown>
                        ) : (
                          <pre className="text-xs">{JSON.stringify(item.payload, null, 2)}</pre>
                        )}
                      </div>
                      {item.source_url && (
                        <div className="mt-2">
                          <a
                            href={item.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary hover:underline"
                          >
                            View source <ExternalLink className="ml-1 inline h-3 w-3" />
                          </a>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {items.length === 0 && inheritedItems.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">No public content available in this workspace</p>
              </CardContent>
            </Card>
          )}

          <div className="mt-8 rounded-lg border bg-muted/50 p-4 text-center">
            <p className="text-sm text-muted-foreground">
              This is a read-only public view. Confidential content is not shown. To access the full workspace,{" "}
              <a href="/" className="font-medium text-primary underline-offset-4 hover:underline">
                sign up for AGORA
              </a>
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}

