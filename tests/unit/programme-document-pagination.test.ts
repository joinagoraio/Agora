import {
  applyProgrammePageExtras,
  collectProgrammePaginationUnits,
  naturalPaginationOffsets,
  programmeA4SheetTops,
  programmePagePushOffsets,
  programmePaginationChapterMeta,
  programmePaginationIsChapterTitle,
  programmePaginationKeepWithNext,
} from "@/lib/programme/document-pagination"

describe("programme A4 pagination", () => {
  it("keeps short content on one page", () => {
    expect(
      programmePagePushOffsets(
        [
          { offsetTop: 0, height: 40 },
          { offsetTop: 48, height: 40 },
        ],
        200,
        40,
      ),
    ).toEqual({ extras: [0, 0], pageCount: 1, lastUsed: 88 })
  })

  it("pushes a block that would overflow onto the next page", () => {
    expect(
      programmePagePushOffsets(
        [
          { offsetTop: 0, height: 100 },
          { offsetTop: 100, height: 100 },
        ],
        150,
        40,
      ),
    ).toEqual({ extras: [0, 90], pageCount: 2, lastUsed: 100 })
  })

  it("stacks A4 sheets with a gap between them", () => {
    expect(programmeA4SheetTops(1, 297, 24)).toEqual([0])
    expect(programmeA4SheetTops(3, 100, 20)).toEqual([0, 120, 240])
  })

  it("paginates the finest block units, not their wrappers", () => {
    document.body.innerHTML = `
      <article data-chapter-id="one">
        <div class="title">Title</div>
        <div class="preview">
          <p data-block-id="a">One</p>
          <p data-block-id="b">Two</p>
        </div>
      </article>
    `
    expect(collectProgrammePaginationUnits(document.body).map((el) => el.outerHTML)).toEqual([
      '<div class="title">Title</div>',
      '<p data-block-id="a">One</p>',
      '<p data-block-id="b">Two</p>',
    ])
  })

  it("paginates table rows instead of cells or the whole table", () => {
    document.body.innerHTML = `
      <article data-chapter-id="one">
        <div class="title">Title</div>
        <div class="preview">
          <p data-block-id="a">Lead</p>
          <table data-table-borders="all">
            <tbody>
              <tr><th data-block-id="h">Head</th></tr>
              <tr><td><p data-block-id="c">Cell</p></td></tr>
            </tbody>
          </table>
        </div>
      </article>
    `
    expect(collectProgrammePaginationUnits(document.body).map((el) => el.tagName)).toEqual([
      "DIV",
      "P",
      "TR",
      "TR",
    ])
  })

  it("uses rows inside a table wrapper, not the wrapper", () => {
    document.body.innerHTML = `
      <article data-chapter-id="one">
        <div class="title">Title</div>
        <div class="editor">
          <div class="tiptap ProseMirror">
            <h2>Goals</h2>
            <div class="tableWrapper">
              <table>
                <tbody>
                  <tr><th>Head</th></tr>
                  <tr><td>Cell</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </article>
    `
    expect(collectProgrammePaginationUnits(document.body).map((el) => el.tagName)).toEqual([
      "DIV",
      "H2",
      "TR",
      "TR",
    ])
  })

  it("keeps a heading with the first table row so later rows can fill the page", () => {
    expect(
      programmePagePushOffsets(
        [
          { offsetTop: 0, height: 500 },
          { offsetTop: 500, height: 28, keepWithNext: true },
          { offsetTop: 528, height: 36 },
          { offsetTop: 564, height: 78 },
        ],
        600,
        40,
      ),
    ).toEqual({ extras: [0, 0, 0, 76], pageCount: 2, lastUsed: 78 })
  })

  it("inserts a spacer row before a table row that needs a page extra", () => {
    document.body.innerHTML = `
      <article data-chapter-id="one">
        <div class="title">Title</div>
        <div class="preview">
          <p data-block-id="a">Lead</p>
          <table>
            <tbody>
              <tr><th>Head</th></tr>
              <tr><td>Cell</td></tr>
            </tbody>
          </table>
        </div>
      </article>
    `
    const units = collectProgrammePaginationUnits(document.body)
    applyProgrammePageExtras(units, [0, 0, 0, 80])
    const rows = [...document.querySelectorAll("table tr")]
    expect(rows.map((row) => row.hasAttribute("data-programme-page-break-row"))).toEqual([
      false,
      true,
      false,
    ])
    expect(rows[1]?.querySelector("td")?.style.height).toBe("80px")
    expect(units[2]?.tagName).toBe("TR")
    expect(document.querySelector("table")?.dataset.programmePageExtra).toBeUndefined()
  })

  it("moves the whole table when the first row needs a page extra", () => {
    document.body.innerHTML = `
      <article data-chapter-id="one">
        <div class="title">Title</div>
        <div class="preview">
          <p data-block-id="a">Lead</p>
          <table>
            <tbody>
              <tr><th>Head</th></tr>
              <tr><td>Cell</td></tr>
            </tbody>
          </table>
        </div>
      </article>
    `
    const units = collectProgrammePaginationUnits(document.body)
    applyProgrammePageExtras(units, [0, 0, 80, 0])
    expect(document.querySelector("table")?.dataset.programmePageExtra).toBe("80")
    expect(document.querySelector("[data-programme-page-break-row]")).toBeNull()
  })

  it("paginates ProseMirror block children, not the editor wrapper", () => {
    document.body.innerHTML = `
      <article data-chapter-id="one">
        <div class="title"><h2>Title</h2></div>
        <div class="editor">
          <div class="tiptap ProseMirror">
            <h2>Section</h2>
            <p>Body</p>
          </div>
        </div>
      </article>
    `
    const units = collectProgrammePaginationUnits(document.body)
    expect(units.map((el) => el.tagName + (el.className ? `.${el.className}` : ""))).toEqual([
      "DIV.title",
      "H2",
      "P",
    ])
    expect(units.map((el) => programmePaginationKeepWithNext(el))).toEqual([true, true, false])
    expect(units.map((el) => programmePaginationIsChapterTitle(el))).toEqual([true, false, false])
    expect(programmePaginationChapterMeta(units[0]!)).toEqual({ chapterId: "one", chapterTitle: "Title" })
  })

  it("moves a heading to the next page when its following block would overflow", () => {
    expect(
      programmePagePushOffsets(
        [
          { offsetTop: 0, height: 120 },
          { offsetTop: 120, height: 24, keepWithNext: true },
          { offsetTop: 144, height: 40 },
        ],
        150,
        40,
      ),
    ).toEqual({ extras: [0, 70, 0], pageCount: 2, lastUsed: 64 })
  })

  it("keeps a heading at the start of a page when the following block is taller than a page", () => {
    expect(
      programmePagePushOffsets(
        [
          { offsetTop: 0, height: 24, keepWithNext: true },
          { offsetTop: 24, height: 200 },
        ],
        150,
        40,
      ),
    ).toEqual({ extras: [0, 166], pageCount: 3, lastUsed: 50 })
  })

  it("counts extra pages when a unit is taller than the page", () => {
    expect(programmePagePushOffsets([{ offsetTop: 0, height: 200 }], 150, 40)).toEqual({
      extras: [0],
      pageCount: 2,
      lastUsed: 50,
    })
  })

  it("subtracts already-applied page extras before measuring the next pass", () => {
    expect(naturalPaginationOffsets([0, 40, 180], [0, 0, 80])).toEqual([0, 40, 100])
    expect(naturalPaginationOffsets([10, 50], [0, 0])).toEqual([10, 50])
  })
})
