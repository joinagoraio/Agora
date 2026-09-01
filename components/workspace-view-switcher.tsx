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
import { useI18n } from "@/lib/i18n/use-i18n"
import { IconTooltip } from "@/components/icon-tooltip"

interface WorkspaceViewSwitcherProps {
  workspaceId: string
}

export function WorkspaceViewSwitcher({ workspaceId }: WorkspaceViewSwitcherProps) {
  const { t } = useI18n()
  return (
    <DropdownMenu>
      <IconTooltip label={t("common.tooltips.moreActions")}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={t("common.tooltips.moreActions")}>
            <MoreVertical className="h-5 w-5" />
          </Button>
        </DropdownMenuTrigger>
      </IconTooltip>
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
