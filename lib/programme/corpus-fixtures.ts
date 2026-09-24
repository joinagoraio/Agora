import type { DocumentRole } from "@/lib/programme/domain"

export const CORPUS_FIXTURES: Array<{ title: string; role: DocumentRole; content: string }> = [
  {
    title: "Environmental vision — housing near nodes (fixture)",
    role: "environmental_vision",
    content:
      "<h1>Environmental vision</h1><p>The province concentrates new housing near stations and mobility nodes. Ambition: Housing near nodes. Provincial interest 14 (housing) and 20 (urbanisation) apply.</p><p>Quiet landscapes stay free of large-scale sprawl. Station-area housing must improve liveability and remain aligned with this vision.</p>",
  },
  {
    title: "Existing housing programme — station pilots (fixture)",
    role: "existing_policy",
    content:
      "<h1>Housing programme 2024</h1><p>Continue two station-area housing pilots with provincial co-funding. Allocate budget 2026–2030. Success: two pilots contracted by 2028. Cite this programme when proposing measures that densify near stations.</p>",
  },
  {
    title: "Environmental effects report — station densification (fixture)",
    role: "environmental_effects_report",
    content:
      "<h1>Environmental effects report</h1><p>Theme: liveability near stations. Densification near nodes is assessed as a positive effect when it reduces car kilometres. Theme: landscape quiet. Sprawl outside nodes is a negative deviation from this effects report.</p>",
  },
]
