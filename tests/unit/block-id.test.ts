import { ensureBlockIdsInHtml } from "@/lib/programme/block-id"

describe("ensureBlockIdsInHtml", () => {
  it("wraps loose chapter text so it can be commented on", () => {
    const html = ensureBlockIdsInHtml("<h1>Visie</h1>Veranker de gebonden omgevingsvisie.")
    const doc = document.implementation.createHTMLDocument("")
    doc.body.innerHTML = html
    const paragraph = doc.body.querySelector("p")
    expect(paragraph?.textContent).toBe("Veranker de gebonden omgevingsvisie.")
    expect(paragraph?.getAttribute("data-block-id")).toBeTruthy()
    expect(doc.body.querySelector("h1")?.getAttribute("data-block-id")).toBeTruthy()
  })
})
