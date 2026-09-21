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

  it("tells drafters to stay inside bound sources", () => {
    const visie = LEEFREGIO_SEED_NODES.find((node) => node.title.startsWith("Visie 4.2"))
    const wonen = LEEFREGIO_SEED_NODES.find((node) => node.title === "Wonen en samenleving")
    expect(visie?.instructions).toMatch(/gebonden/)
    expect(visie?.instructions).toMatch(/Verzin geen/)
    expect(wonen?.instructions).toMatch(/gebonden/)
  })
})
