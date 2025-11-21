"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { acceptWorkspaceInvitation } from "@/lib/actions/workspace-invitation"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Mail, FolderKanban, Calendar, Loader2, AlertCircle, CheckCircle2 } from "lucide-react"
import Image from "next/image"

interface WorkspaceInvitePageClientProps {
  token: string
  invitation: any
  user: any
  error: any
}

export default function WorkspaceInvitePageClient({
  token,
  invitation,
  user,
  error: fetchError,
}: WorkspaceInvitePageClientProps) {
  const [email, setEmail] = useState(invitation?.email || "")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [fullName, setFullName] = useState("")
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signup")
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isAccepting, setIsAccepting] = useState(false)
  const router = useRouter()

  // If invitation is invalid or expired
  if (fetchError || !invitation) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 bg-white">
        <div className="w-full max-w-md space-y-6">
          <div className="flex flex-col items-center">
            <Image src="/logo.svg" alt="AGORA Logo" width={120} height={120} className="mb-6" />
          </div>
          <Card className="w-full">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-destructive mb-4">
                <AlertCircle className="h-5 w-5" />
                <h3 className="font-semibold">Invalid Invitation</h3>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                This invitation link is invalid, has expired, or has already been used.
              </p>
              <Button asChild className="w-full">
                <a href="/">Go to Home</a>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  // Check if expired or already used
  const isExpired = new Date(invitation.expires_at) < new Date()
  const isAlreadyUsed = invitation.status !== "pending"

  if (isExpired || isAlreadyUsed) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 bg-white">
        <div className="w-full max-w-md space-y-6">
          <div className="flex flex-col items-center">
            <Image src="/logo.svg" alt="AGORA Logo" width={120} height={120} className="mb-6" />
          </div>
          <Card className="w-full">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-destructive mb-4">
                <AlertCircle className="h-5 w-5" />
                <h3 className="font-semibold">
                  {isExpired ? "Invitation Expired" : "Invitation Already Used"}
                </h3>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                {isExpired
                  ? "This invitation has expired. Please ask the workspace admin to send a new invitation."
                  : "This invitation has already been accepted."}
              </p>
              <Button asChild className="w-full">
                <a href="/">Go to Home</a>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  // If user is already logged in, check email match first
  useEffect(() => {
    if (user && !isAccepting) {
      checkEmailAndAccept()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  const checkEmailAndAccept = async () => {
    setIsAccepting(true)
    const supabase = createClient()

    // Get user's profile email
    const { data: profile } = await supabase.from("profiles").select("email").eq("id", user.id).single()

    if (profile?.email?.toLowerCase().trim() !== invitation.email?.toLowerCase().trim()) {
      setError(
        "This invitation was sent to a different email address. Please sign out and sign in with the invited email.",
      )
      setIsAccepting(false)
      return
    }

    // Accept invitation
    try {
      const result = await acceptWorkspaceInvitation(token)

      if (result.error) {
        setError(result.error)
        setIsAccepting(false)
        return
      }

      // Redirect to workspace
      router.push(`/workspaces/${result.workspaceId}`)
    } catch (err: any) {
      setError(err.message || "Failed to accept invitation")
      setIsAccepting(false)
    }
  }

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.refresh()
  }

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    // Validate passwords match for signup
    if (authMode === "signup" && password !== confirmPassword) {
      setError("Passwords do not match")
      setIsLoading(false)
      return
    }

    const supabase = createClient()

    try {
      if (authMode === "signup") {
        // Sign up new user
        const { error: signupError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
            },
          },
        })

        if (signupError) throw signupError

        // After signup, refresh to trigger auto-accept
        router.refresh()
      } else {
        // Sign in existing user
        const { error: signinError } = await supabase.auth.signInWithPassword({
          email,
          password,
        })

        if (signinError) throw signinError

        // After signin, refresh to trigger auto-accept
        router.refresh()
      }
    } catch (err: any) {
      setError(err.message || "Authentication failed")
      setIsLoading(false)
    }
  }

  // If user is logged in, show accepting state or error
  if (user) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 bg-white">
        <div className="w-full max-w-md space-y-6">
          <div className="flex flex-col items-center">
            <Image src="/logo.svg" alt="AGORA Logo" width={120} height={120} className="mb-6" />
          </div>
          <Card className="w-full">
            {!error ? (
              <CardContent className="pt-6 text-center space-y-4">
                <div className="flex justify-center">
                  <CheckCircle2 className="h-12 w-12 text-green-600 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold mb-2">Accepting Invitation...</h3>
                  <p className="text-sm text-muted-foreground">
                    Please wait while we add you to the workspace.
                  </p>
                </div>
                <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
              </CardContent>
            ) : (
              <CardContent className="pt-6 space-y-4">
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
                <div className="flex gap-2">
                  <Button onClick={handleSignOut} variant="outline" className="flex-1">
                    Sign Out & Try Again
                  </Button>
                  <Button onClick={() => router.push("/dashboard")} variant="secondary" className="flex-1">
                    Go to Dashboard
                  </Button>
                </div>
              </CardContent>
            )}
          </Card>
        </div>
      </div>
    )
  }

  // Get workspace name
  const workspaceName = Array.isArray(invitation.workspaces)
    ? invitation.workspaces[0]?.name
    : invitation.workspaces?.name

  // Show invitation details and auth form
  return (
    <div className="flex min-h-screen items-center justify-center p-6 bg-white">
      <div className="w-full max-w-md space-y-6">
        {/* Logo and Title Section */}
        <div className="flex flex-col items-center space-y-4">
          <Image src="/logo.svg" alt="AGORA Logo" width={120} height={120} className="mb-6" />
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-bold">You&apos;re Invited!</h1>
            <p className="text-muted-foreground">You&apos;ve been invited to join a workspace on Agora</p>
          </div>
        </div>

        {/* Card with Invitation Details and Auth */}
        <Card>
          <CardContent className="pt-6 space-y-6">
            {/* Invitation Details */}
            <div className="space-y-3 p-4 bg-muted rounded-lg">
              <div className="flex items-center gap-2 text-sm">
                <FolderKanban className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">Workspace:</span>
                <span>{workspaceName || "Unknown Workspace"}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">Invited email:</span>
                <span>{invitation.email}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Badge variant="secondary" className="capitalize">
                  {invitation.role} role
                </Badge>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4" />
                <span>Expires: {new Date(invitation.expires_at).toLocaleDateString()}</span>
              </div>
            </div>

            {/* Auth Form */}
            <div className="space-y-4">
              <div className="flex gap-2">
                <Button
                  variant={authMode === "signup" ? "default" : "outline"}
                  onClick={() => setAuthMode("signup")}
                  className="flex-1"
                >
                  Create Account
                </Button>
                <Button
                  variant={authMode === "signin" ? "default" : "outline"}
                  onClick={() => setAuthMode("signin")}
                  className="flex-1"
                >
                  Sign In
                </Button>
              </div>

              <form onSubmit={handleAuth} className="space-y-4">
                {authMode === "signup" && (
                  <div className="space-y-2">
                    <Label htmlFor="fullName">Full Name</Label>
                    <Input
                      id="fullName"
                      type="text"
                      placeholder="John Doe"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    value={email}
                    readOnly
                    disabled
                    className="bg-muted cursor-not-allowed"
                  />
                  <p className="text-xs text-muted-foreground">This invitation is for this email address</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  {authMode === "signup" && (
                    <p className="text-xs text-muted-foreground">Must be at least 6 characters</p>
                  )}
                </div>

                {authMode === "signup" && (
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirm Password</Label>
                    <Input
                      id="confirmPassword"
                      type="password"
                      placeholder="Re-enter your password"
                      required
                      minLength={6}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className={confirmPassword && password !== confirmPassword ? "border-destructive" : ""}
                    />
                    {confirmPassword && password !== confirmPassword && (
                      <p className="text-xs text-destructive">Passwords do not match</p>
                    )}
                  </div>
                )}

                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {authMode === "signup" ? "Creating account..." : "Signing in..."}
                    </>
                  ) : (
                    `${authMode === "signup" ? "Create Account" : "Sign In"} & Accept Invitation`
                  )}
                </Button>
              </form>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
