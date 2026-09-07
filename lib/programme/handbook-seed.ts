import type { OutlineFieldSpec } from "@/lib/programme/domain"

export const HANDBOOK_TEMPLATE_NAME = "Provincial environmental programme (handbook)"

export type HandbookSeedNode = {
  title: string
  purpose: string
  instructions: string
  required: boolean
  sortOrder: number
  fieldSpecs: OutlineFieldSpec[]
  qualityRules: string
  outputForm: string
  relationHints: string
}

export const HANDBOOK_SEED_NODES: HandbookSeedNode[] = [
  {
    title: "Introduction and legal framework",
    purpose: "Frame the programme part, legal basis, and reading guide.",
    instructions:
      "State the statutory basis, the relation to the environmental vision, and what this programme part decides. Do not invent legal citations.",
    required: true,
    sortOrder: 1,
    fieldSpecs: [
      { key: "legal_basis", label: "Legal basis", required: true },
      { key: "scope", label: "Geographic and temporal scope", required: true },
    ],
    qualityRules: "Cite only bound handbook and vision documents.",
    outputForm: "Prose with short numbered scope bullets.",
    relationHints: "Sources: handbook + vision. Downstream: all chapters.",
  },
  {
    title: "Vision and provincial interests",
    purpose: "Anchor ambitions and required provincial interests.",
    instructions:
      "Map programme focus to vision ambitions and named provincial interests. Flag missing required interests.",
    required: true,
    sortOrder: 2,
    fieldSpecs: [
      { key: "ambitions", label: "Vision ambitions", required: true },
      { key: "interests", label: "Provincial interests", required: true },
    ],
    qualityRules: "Every interest must be named as in the vision, not paraphrased inventively.",
    outputForm: "Short prose plus a two-column ambition/interest list.",
    relationHints: "Sources: vision. Downstream: challenges, goals, measures.",
  },
  {
    title: "Challenges and goals",
    purpose: "Translate vision into opgaven and SMART goals.",
    instructions:
      "List challenges (opgaven) and goals that follow from the vision. Goals must be testable. Link each to an interest.",
    required: true,
    sortOrder: 3,
    fieldSpecs: [
      { key: "challenges", label: "Challenges", required: true },
      { key: "goals", label: "Goals", required: true },
    ],
    qualityRules: "No goal without an owner role or indicator.",
    outputForm: "Numbered challenges; goals as a table-ready list.",
    relationHints: "Sources: vision + existing policy. Downstream: measures.",
  },
  {
    title: "Housing and living environment",
    purpose: "Programme part for housing, liveability, and spatial quality.",
    instructions:
      "Place housing measures here. Ground claims in the housing programme and vision. Require location or typology.",
    required: true,
    sortOrder: 4,
    fieldSpecs: [
      { key: "housing_focus", label: "Housing focus areas", required: true },
    ],
    qualityRules: "Do not invent housing targets not present in bound sources.",
    outputForm: "Narrative plus placed measures.",
    relationHints: "Sources: housing programme + vision. Measures attach to this node.",
  },
  {
    title: "Mobility, nature, water and climate",
    purpose: "Cross-cutting environment themes that measures must respect.",
    instructions:
      "Summarise constraints from vision and effects report. Note where measures may conflict with nature or climate goals.",
    required: true,
    sortOrder: 5,
    fieldSpecs: [{ key: "constraints", label: "Binding constraints", required: true }],
    qualityRules: "Effects-report deviations must be flagged, not hidden.",
    outputForm: "Constraint list with citations.",
    relationHints: "Sources: vision + effects report. Downstream: effects chapter.",
  },
  {
    title: "Measures programme",
    purpose: "Registry narrative: concrete measures with SMART fields.",
    instructions:
      "Compose from the measures registry attached to outline nodes. Do not invent measures that are not in the registry.",
    required: true,
    sortOrder: 6,
    fieldSpecs: [{ key: "measure_count", label: "Expected measure count", required: false }],
    qualityRules: "Every measure needs citations and a specific action.",
    outputForm: "Grouped by outline node; appendix-ready.",
    relationHints: "Sources: analysis + registry. Graph: measure → goal → ambition.",
  },
  {
    title: "Environmental effects alignment",
    purpose: "Positive/negative/neutral effects and justified deviations.",
    instructions:
      "For each measure, state effects direction versus the bound effects report. Unjustified deviations stay open.",
    required: true,
    sortOrder: 7,
    fieldSpecs: [{ key: "deviations", label: "Open deviations", required: false }],
    qualityRules: "Deviation without justification is incomplete.",
    outputForm: "Table of measure × direction × justification.",
    relationHints: "Sources: effects report + measures. Feeds quality control and approval.",
  },
  {
    title: "Implementation, monitoring and governance",
    purpose: "Roles, timeline, monitoring, and review.",
    instructions:
      "Assign owner roles, timelines, and indicators from approved measures. Optional implementation rows may be less SMART than measures.",
    required: false,
    sortOrder: 8,
    fieldSpecs: [
      { key: "owners", label: "Owner roles", required: true },
      { key: "monitoring", label: "Monitoring cycle", required: false },
    ],
    qualityRules: "Do not invent budgets not in sources.",
    outputForm: "Implementation table.",
    relationHints: "Sources: measures + handbook. Optional chapter.",
  },
]

export const HANDBOOK_TEMPLATE_META = {
  qualityRules:
    "Cite bound sources only. Required chapters must be present before stakeholder export. Measures of type measure must be specific, cited, and placed on an outline node.",
  outputForm:
    "Provincial programme narrative: numbered chapters matching this template, measures appendix, citation footnotes.",
}
