"use client"

import { useI18n } from "@/lib/i18n/use-i18n"
import { formatPolicyGraphMatrix, type PolicyGraphEdge, type PolicyGraphNode } from "@/lib/programme/policy-graph"

type Props = {
  nodes: PolicyGraphNode[]
  edges: PolicyGraphEdge[]
}

export function ProgrammePolicyGraph({ nodes, edges }: Props) {
  const { t } = useI18n()
  const rows = formatPolicyGraphMatrix({ nodes, edges })

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">{t("workspace.programme.graphTitle")}</h3>
      <p className="text-xs text-muted-foreground">{t("workspace.programme.graphHint")}</p>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("workspace.programme.graphEmpty")}</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {rows.map((row) => (
            <li key={row.measureId || row.measureLabel} className="rounded-md border p-2">
              <span className={row.hasPath ? "" : "text-destructive"}>
                {row.measureLabel}
                {row.hasPath
                  ? ` → ${row.anchors.map((a) => `${a.label} (${a.nodeType})`).join(", ")}`
                  : ` · ${t("workspace.programme.graphNoPath")}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
