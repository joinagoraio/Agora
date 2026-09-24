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
    <section className="overflow-hidden rounded-lg border bg-background">
      <div className="border-b bg-muted px-4 py-3">
        <h3 className="text-sm font-semibold">{t("workspace.programme.graphTitle")}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{t("workspace.programme.graphHint")}</p>
      </div>
      <div className="px-4 py-3">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("workspace.programme.graphEmpty")}</p>
        ) : (
          <ul className="divide-y text-sm">
            {rows.map((row) => (
              <li key={row.measureId || row.measureLabel} className="py-2">
                <span className={row.hasPath ? "" : "text-destructive"}>
                  {row.measureLabel}
                  {row.hasPath
                    ? ` → ${row.anchors.map((a) => `${a.label} (${t(`workspace.programme.graphNode.${a.nodeType}`, a.nodeType)})`).join(", ")}`
                    : ` · ${t("workspace.programme.graphNoPath")}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
