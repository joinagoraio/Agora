import { describe, expect, it } from "vitest"
import { formatPolicyGraphMatrix } from "@/lib/programme/policy-graph"

describe("policy graph matrix", () => {
  it("lists contribution paths and flags measures with none", () => {
    const rows = formatPolicyGraphMatrix({
      nodes: [
        { id: "m1", node_type: "measure", label: "Station pilots", measure_id: "meas-1" },
        { id: "m2", node_type: "measure", label: "Orphan road", measure_id: "meas-2" },
        { id: "a1", node_type: "ambition", label: "Housing near nodes" },
        { id: "p1", node_type: "provincial_interest", label: "14" },
      ],
      edges: [
        { from_node_id: "m1", to_node_id: "a1", relation: "contributes_to" },
        { from_node_id: "m1", to_node_id: "p1", relation: "contributes_to" },
        { from_node_id: "m2", to_node_id: "a1", relation: "duplicates" },
      ],
    })
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      measureId: "meas-1",
      hasPath: true,
    })
    expect(rows[0]?.anchors.map((a) => a.label)).toEqual(["Housing near nodes", "14"])
    expect(rows[1]?.hasPath).toBe(false)
  })

  it("treats missing nodes or edges as an empty graph", () => {
    expect(formatPolicyGraphMatrix({ nodes: undefined as never, edges: undefined as never })).toEqual([])
  })
})
