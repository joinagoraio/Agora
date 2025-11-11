"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { createSharedLink, getConversationSharedLinks, deleteSharedLink } from "@/lib/actions/sharing"
import { Share2, Copy, Check, Trash2, ExternalLink } from "lucide-react"

interface ShareConversationDialogProps {
  conversationId: string
}

export function ShareConversationDialog({ conversationId }: ShareConversationDialogProps) {
  const [open, setOpen] = useState(false)
  const [expiryDays, setExpiryDays] = useState<string>("7")
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [existingLinks, setExistingLinks] = useState<any[]>([])

  useEffect(() => {
    if (open) {
      loadExistingLinks()
    }
  }, [open])

  const loadExistingLinks = async () => {
    const { data } = await getConversationSharedLinks(conversationId)
    setExistingLinks(data || [])
  }

  const handleCreateLink = async () => {
    setIsCreating(true)
    const days = expiryDays === "never" ? undefined : Number.parseInt(expiryDays)
    const result = await createSharedLink(conversationId, days)

    if (result.shareUrl) {
      setShareUrl(result.shareUrl)
      loadExistingLinks()
    }
    setIsCreating(false)
  }

  const handleCopy = async (url: string) => {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDelete = async (linkId: string) => {
    await deleteSharedLink(linkId)
    loadExistingLinks()
    if (shareUrl) setShareUrl(null)
  }

  const getShareUrl = (token: string) => {
    return `${window.location.origin}/shared/${token}`
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Share2 className="mr-2 h-4 w-4" />
          Share
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Share Conversation</DialogTitle>
          <DialogDescription>Create a public link to share this conversation with anyone</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {!shareUrl ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="expiry">Link Expiration</Label>
                <Select value={expiryDays} onValueChange={setExpiryDays}>
                  <SelectTrigger id="expiry">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 day</SelectItem>
                    <SelectItem value="7">7 days</SelectItem>
                    <SelectItem value="30">30 days</SelectItem>
                    <SelectItem value="never">Never expires</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleCreateLink} disabled={isCreating} className="w-full">
                {isCreating ? "Creating..." : "Create Share Link"}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Share Link</Label>
                <div className="flex gap-2">
                  <Input value={shareUrl} readOnly className="flex-1" />
                  <Button size="icon" variant="outline" onClick={() => handleCopy(shareUrl)}>
                    {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                  </Button>
                  <Button size="icon" variant="outline" asChild>
                    <a href={shareUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Anyone with this link can view the conversation</p>
              </div>
              <Button variant="outline" onClick={() => setShareUrl(null)} className="w-full">
                Create Another Link
              </Button>
            </div>
          )}

          {existingLinks.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-sm font-medium">Existing Share Links</h4>
              <div className="space-y-2">
                {existingLinks.map((link) => (
                  <div key={link.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <code className="text-xs">{link.token.substring(0, 16)}...</code>
                        {link.expires_at ? (
                          new Date(link.expires_at) > new Date() ? (
                            <Badge variant="secondary">Expires {new Date(link.expires_at).toLocaleDateString()}</Badge>
                          ) : (
                            <Badge variant="destructive">Expired</Badge>
                          )
                        ) : (
                          <Badge>Never expires</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Created {new Date(link.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="icon" variant="ghost" onClick={() => handleCopy(getShareUrl(link.token))}>
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => handleDelete(link.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
