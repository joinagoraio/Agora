export type HtmlToPdfResult =
  | { ok: true; pdf: Buffer }
  | { ok: false; reason: string }

export async function renderPrintHtmlToPdf(html: string): Promise<HtmlToPdfResult> {
  try {
    const playwright = await import("playwright")
    const browser = await playwright.chromium.launch({ headless: true })
    try {
      const page = await browser.newPage()
      await page.setContent(html, { waitUntil: "load", timeout: 30_000 })
      const pdf = await page.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: "18mm", right: "16mm", bottom: "18mm", left: "16mm" },
      })
      return { ok: true, pdf: Buffer.isBuffer(pdf) ? pdf : Buffer.from(pdf) }
    } finally {
      await browser.close()
    }
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "Chromium PDF renderer unavailable",
    }
  }
}
