export type PolicyGraphNode = {
  id: string
  node_type: string
  label: string
  measure_id?: string | null
}

export type PolicyGraphEdge = {
  from_node_id: string
  to_node_id: string
  relation: string
}

export type PolicyGraphRow = {
  measureId: string | null
  measureLabel: string
  anchors: Array<{ label: string; nodeType: string; relation: string }>
  hasPath: boolean
}

export function formatPolicyGraphMatrix(input: {
  nodes: PolicyGraphNode[]
  edges: PolicyGraphEdge[]
}): PolicyGraphRow[] {
  const nodes = Array.isArray(input.nodes) ? input.nodes : []
  const edges = Array.isArray(input.edges) ? input.edges : []
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const measures = nodes.filter((node) => node.node_type === "measure")
  return measures.map((measure) => {
    const anchors = edges
      .filter((edge) => edge.from_node_id === measure.id && edge.relation === "contributes_to")
      .map((edge) => byId.get(edge.to_node_id))
      .filter((node): node is PolicyGraphNode => Boolean(node))
      .filter((node) => node.node_type === "ambition" || node.node_type === "goal" || node.node_type === "provincial_interest")
      .map((node) => ({ label: node.label, nodeType: node.node_type, relation: "contributes_to" }))
    return {
      measureId: measure.measure_id ?? null,
      measureLabel: measure.label,
      anchors,
      hasPath: anchors.length > 0,
    }
  })
}
