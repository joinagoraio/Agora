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
        printBackground: true,
        displayHeaderFooter: false,
        preferCSSPageSize: true,
        margin: { top: "0", right: "0", bottom: "0", left: "0" },
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
