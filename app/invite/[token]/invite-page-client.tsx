"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { acceptInvitation } from "@/lib/actions/invitation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Mail, Users, Calendar, Loader2, AlertCircle } from "lucide-react"
import Image from "next/image"

interface InvitePageClientProps {
  token: string
  invitation: any
  user: any
  error: any
}

export default function InvitePageClient({ token, invitation, user, error: fetchError }: InvitePageClientProps) {
  const [email, setEmail] = useState(invitation?.email || "")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [fullName, setFullName] = useState("")
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signup")
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isAccepting, setIsAccepting] = useState(false)
  const [awaitingVerification, setAwaitingVerification] = useState(false)
  const router = useRouter()

  // If invitation is invalid or expired
  if (fetchError || !invitation) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 bg-white">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              <CardTitle>Invalid Invitation</CardTitle>
            </div>
            <CardDescription>
              This invitation link is invalid, has expired, or has already been used.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <a href="/">Go to Home</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Check if expired or already used
  const isExpired = new Date(invitation.expires_at) < new Date()
  const isAlreadyUsed = invitation.accepted_at !== null

  if (isExpired || isAlreadyUsed) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 bg-white">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              <CardTitle>{isExpired ? "Invitation Expired" : "Invitation Already Used"}</CardTitle>
            </div>
            <CardDescription>
              {isExpired 
                ? "This invitation has expired. Please ask the space admin to send a new invitation."
                : "This invitation has already been accepted."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <a href="/">Go to Home</a>
            </Button>
          </CardContent>
        </Card>
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
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", user.id)
      .single()

    console.log('[Invite] User profile:', { email: profile?.email, userId: user.id })
    console.log('[Invite] Invitation email:', invitation.email)

    if (profileError) {
      console.error('[Invite] Error fetching profile:', profileError)
      setError('Error fetching your profile. Please try again.')
      setIsAccepting(false)
      return
    }

    // Check if email matches invitation (case-insensitive, trim whitespace)
    const profileEmail = profile?.email?.toLowerCase().trim()
    const inviteEmail = invitation.email?.toLowerCase().trim()
    
    if (profileEmail !== inviteEmail) {
      console.log('[Invite] Email mismatch:', { profileEmail, inviteEmail })
      setError(`This invitation was sent to ${invitation.email}. You are signed in as ${profile?.email}. Please sign out and try again with the correct account.`)
      setIsAccepting(false)
      return
    }

    console.log('[Invite] Emails match, accepting invitation...')
    
    // Email matches, proceed with acceptance
    handleAcceptInvitation()
  }

  const handleAcceptInvitation = async () => {
    const result = await acceptInvitation(token)

    console.log('[Invite] Acceptance result:', result)

    if (result.error) {
      console.error('[Invite] Acceptance error:', result.error)
      setError(result.error)
      setIsAccepting(false)
    } else if (result.spaceId) {
      console.log('[Invite] Success! Redirecting to space:', result.spaceId)
      // Success! Redirect to the space
      router.push(`/spaces/${result.spaceId}`)
    } else {
      console.error('[Invite] Unexpected result format:', result)
      setError('Unexpected error during acceptance. Please refresh and try again.')
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

    // For signup, validate password confirmation
    if (authMode === "signup" && password !== confirmPassword) {
      setError("Passwords do not match. Please check and try again.")
      setIsLoading(false)
      return
    }

    const supabase = createClient()

    try {
      if (authMode === "signup") {
        // Sign up new user
        const { data: signupData, error: signupError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/invite/${token}`,
            data: {
              full_name: fullName,
            },
          },
        })

        if (signupError) throw signupError

        // Check if email confirmation is required
        if (signupData?.user && !signupData?.session) {
          // Email verification is required - show success state
          setAwaitingVerification(true)
          setIsLoading(false)
          return
        }

        // After signup with immediate session, refresh to trigger auto-accept
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

  const handleGoogleAuth = async () => {
    setIsLoading(true)
    setError(null)

    const supabase = createClient()

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(`/invite/${token}`)}`,
          queryParams: {
            access_type: "offline",
            prompt: "consent",
            scope: "openid email profile https://www.googleapis.com/auth/drive.readonly",
          },
        },
      })

      if (error) throw error
    } catch (err: any) {
      setError(err.message || "Google authentication failed")
      setIsLoading(false)
    }
  }

  // If user is logged in, show accepting state or error
  if (user) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 bg-white">
        <Card className="w-full max-w-md">
          {!error ? (
            <>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <CardTitle>Accepting Invitation...</CardTitle>
                </div>
                <CardDescription>
                  Please wait while we add you to <strong>{invitation.spaces?.name || "the space"}</strong>
                </CardDescription>
              </CardHeader>
            </>
          ) : (
            <>
              <CardHeader>
                <div className="flex items-center gap-2 text-destructive">
                  <AlertCircle className="h-5 w-5" />
                  <CardTitle>Email Mismatch</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
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
            </>
          )}
        </Card>
      </div>
    )
  }

  // Show email verification pending state
  if (awaitingVerification) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 bg-white">
        <div className="w-full max-w-md space-y-6">
          <div className="flex flex-col items-center space-y-4">
            <Image 
              src="/logo.svg" 
              alt="AGORA Logo" 
              width={120} 
              height={120} 
              className="mb-6" 
            />
            <div className="text-center space-y-2">
              <h1 className="text-2xl font-bold">Check Your Email</h1>
              <p className="text-muted-foreground">
                We've sent a verification link to <strong>{email}</strong>
              </p>
            </div>
          </div>

          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="rounded-lg bg-primary/10 p-4 text-sm">
                <h3 className="font-semibold mb-2">Next Steps:</h3>
                <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
                  <li>Check your email inbox for a message from Agora</li>
                  <li>Click the verification link in the email</li>
                  <li>You'll be brought back here and automatically added to the space</li>
                </ol>
              </div>

              <div className="text-center text-sm text-muted-foreground">
                <p>Didn't receive the email? Check your spam folder or contact support.</p>
              </div>

              <Button 
                onClick={() => setAwaitingVerification(false)} 
                variant="outline" 
                className="w-full"
              >
                Back to Sign In
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  // Show invitation details and auth form
  return (
    <div className="flex min-h-screen items-center justify-center p-6 bg-white">
      <div className="w-full max-w-md space-y-6">
        {/* Logo and Title Section */}
        <div className="flex flex-col items-center space-y-4">
          <Image 
            src="/logo.svg" 
            alt="AGORA Logo" 
            width={120} 
            height={120} 
            className="mb-6" 
          />
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-bold">You&apos;re Invited!</h1>
            <p className="text-muted-foreground">
              You&apos;ve been invited to join a space on Agora
            </p>
          </div>
        </div>

        {/* Card with Invitation Details and Auth */}
        <Card>
          <CardContent className="pt-6 space-y-6">
          {/* Invitation Details */}
          <div className="space-y-3 p-4 bg-muted rounded-lg">
            <div className="flex items-center gap-2 text-sm">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">Space:</span>
              <span>{invitation.spaces?.name || "Unknown Space"}</span>
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
                <p className="text-xs text-muted-foreground">
                  This invitation is for this email address
                </p>
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
                    <p className="text-xs text-destructive">
                      Passwords do not match
                    </p>
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

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">Or continue with</span>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={handleGoogleAuth}
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                    <path
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      fill="#4285F4"
                    />
                    <path
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      fill="#34A853"
                    />
                    <path
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      fill="#FBBC05"
                    />
                    <path
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      fill="#EA4335"
                    />
                  </svg>
                  Continue with Google
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
      </div>
    </div>
  )
}

