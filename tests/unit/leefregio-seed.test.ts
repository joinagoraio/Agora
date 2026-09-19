import { describe, expect, it } from "vitest"
import { LEEFREGIO_SEED_NODES, LEEFREGIO_TEMPLATE_NAME } from "@/lib/programme/leefregio-seed"

describe("Sterke Leefregio's template seed", () => {
  it("ships the casus chapter set", () => {
    expect(LEEFREGIO_TEMPLATE_NAME).toContain("Sterke Leefregio")
    const titles = LEEFREGIO_SEED_NODES.map((node) => node.title)
    expect(titles).toContain("Visie 4.2 Sterke Leefregio's")
    expect(titles).toContain("Wonen en samenleving")
    expect(titles).toContain("Mobiliteit")
    expect(titles).toContain("Volkshuisvestingsprogramma")
    expect(titles).toContain("Afstemming omgevingseffectrapport")
    expect(titles).not.toContain("Introduction and legal framework")
  })
})
