import { redirect } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { WorkspaceChatWrapper } from "@/components/workspace-chat-wrapper"
import { MyDocumentEditor } from "@/components/my-document-editor"
import { Button } from "@/components/ui/button"
import { UserMenu } from "@/components/user-menu"
import { ArrowLeft } from "lucide-react"
import { getServerTranslator } from "@/lib/i18n/server"

interface WorkspaceDocumentEditorPageProps {
  params: Promise<{
    workspaceId: string
    documentId: string
  }>
}

export default async function WorkspaceDocumentEditorPage({ params }: WorkspaceDocumentEditorPageProps) {
  const { workspaceId, documentId } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  const { data: document, error: documentError } = await supabase
    .from("documents")
    .select("id, title, content, classification, metadata, updated_at, sources(type)")
    .eq("id", documentId)
    .eq("workspace_id", workspaceId)
    .single()

  const sourceRelation = document?.sources as
    | { type?: string | null }
    | { type?: string | null }[]
    | null
    | undefined
  const sourceType = Array.isArray(sourceRelation) ? sourceRelation[0]?.type : sourceRelation?.type

  if (documentError || !document || sourceType !== "workspace_generated") {
    redirect(`/workspaces/${workspaceId}`)
  }

  const { data: workspace, error: workspaceError } = await supabase
    .from("workspaces")
    .select("name")
    .eq("id", workspaceId)
    .single()

  if (workspaceError || !workspace) {
    redirect(`/workspaces/${workspaceId}`)
  }

  const metadata = (document.metadata as Record<string, any> | null) ?? null
  const instructions = (metadata?.instructions as string | undefined) ?? ""
  const isWorkup = metadata?.origin === "programme_interest_workup"
  const backHref = isWorkup ? `/workspaces/${workspaceId}/programme?view=document&section=interests` : `/workspaces/${workspaceId}`
  const { data: sourceRows } = await supabase
    .from("documents")
    .select("id, title, metadata")
    .eq("workspace_id", workspaceId)
    .neq("id", documentId)
    .neq("status", "deleted")
  const citationSources = (sourceRows || []).map((row) => ({
    id: row.id as string,
    title: (row.title as string) || "",
    documentRole: ((row.metadata as Record<string, unknown> | null)?.documentRole as string | undefined) ?? null,
  }))
  const lastEditedAt = (metadata?.lastEditedAt as string | undefined) ?? (document.updated_at as string | undefined)
  const { t } = await getServerTranslator()

  return (
    <WorkspaceChatWrapper workspaceId={workspaceId} workspaceName={workspace.name}>
      <div className="flex min-h-screen flex-col">
        <header className="bg-card">
          <div className="flex h-16 items-center justify-between px-4">
            <div className="flex items-center gap-4">
              <Button variant="ghost" asChild>
                <Link href={backHref}>
                  <ArrowLeft className="mr-2 h-3 w-3" />
                  <span className="text-xs font-normal">
                    {t("workspace.navigation.backToWorkspace", undefined, { name: workspace.name })}
                  </span>
                </Link>
              </Button>
            </div>
            <UserMenu />
          </div>
        </header>

        <main className="flex-1 bg-white">
          <div className="container mx-auto py-8 px-8">
            <MyDocumentEditor
              workspaceId={workspaceId}
              documentId={documentId}
              initialTitle={document.title}
              initialContent={document.content || ""}
              classification={(document.classification as "public" | "internal" | "confidential" | null) ?? null}
              initialInstructions={instructions}
              lastEditedAt={lastEditedAt ?? null}
              citationSources={citationSources}
            />
          </div>
        </main>
      </div>
    </WorkspaceChatWrapper>
  )
}
