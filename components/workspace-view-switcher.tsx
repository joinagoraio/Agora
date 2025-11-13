"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { MoreVertical, Settings, Plug } from "lucide-react"

interface WorkspaceViewSwitcherProps {
  workspaceId: string
}

export function WorkspaceViewSwitcher({ workspaceId }: WorkspaceViewSwitcherProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon">
          <MoreVertical className="h-5 w-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link href={`/workspaces/${workspaceId}/sources`}>
            <Plug className="mr-2 h-4 w-4" />
            Sources
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`/workspaces/${workspaceId}/settings`}>
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
