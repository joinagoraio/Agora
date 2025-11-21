import { createClient } from "@/lib/supabase/server"
import InvitePageClient from "./invite-page-client"

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Get invitation details (RLS policy allows public viewing by token)
  const { data: invitation, error } = await supabase
    .from("invitations")
    .select(`
      id, 
      email, 
      role, 
      expires_at, 
      accepted_at, 
      space_id,
      spaces (
        id,
        name
      )
    `)
    .eq("token", token)
    .single()
  
  // If invitation exists but space info is missing (due to RLS), fetch it separately
  if (invitation && !invitation.spaces) {
    const { data: spaceData } = await supabase
      .from("spaces")
      .select("id, name")
      .eq("id", invitation.space_id)
      .single()
    
    if (spaceData) {
      invitation.spaces = spaceData
    }
  }

  // Log for debugging (remove in production)
  if (error) {
    console.error("[Invite] Error fetching invitation:", error)
  } else {
    console.log("[Invite] Invitation found:", { 
      id: invitation?.id, 
      email: invitation?.email, 
      spaceName: invitation?.spaces?.name,
      hasSpace: !!invitation?.spaces 
    })
  }

  return <InvitePageClient token={token} invitation={invitation} user={user} error={error} />
}
