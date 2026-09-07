import { Extension, type Editor } from "@tiptap/core"
import type { Node as ProseMirrorNode } from "@tiptap/pm/model"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view"
import { createProgrammePageBreakRow, programmePaginationBreakTarget } from "@/lib/programme/page-break-row"

export type ProgrammePageBreakSpec = {
  pos: number
  extra: number
  marginTop?: number
}

const pageBreakKey = new PluginKey<DecorationSet>("programmePageBreaks")
const editors = new Set<Editor>()

export function registerProgrammePaginationEditor(editor: Editor) {
  editors.add(editor)
  return () => {
    editors.delete(editor)
  }
}

function isTableRowNode(node: ProseMirrorNode) {
  const role = (node.type.spec as { tableRole?: string }).tableRole
  return role === "row" || node.type.name === "tableRow" || node.type.name === "table_row"
}

function decorationsFor(doc: Editor["state"]["doc"], extras: ProgrammePageBreakSpec[]) {
  const decos: Decoration[] = []
  for (const spec of extras) {
    if (spec.extra <= 0.5) continue
    const node = doc.nodeAt(spec.pos)
    if (!node) continue
    if (isTableRowNode(node)) {
      decos.push(
        Decoration.widget(
          spec.pos,
          () => createProgrammePageBreakRow(spec.extra, node.childCount),
          { side: -1, key: `programme-page-break-${spec.pos}`, ignoreSelection: true },
        ),
      )
      continue
    }
    const marginTop = spec.marginTop ?? spec.extra
    decos.push(
      Decoration.node(spec.pos, spec.pos + node.nodeSize, {
        style: `margin-top: ${marginTop}px !important`,
        "data-programme-page-extra": String(Math.round(spec.extra)),
      }),
    )
  }
  return DecorationSet.create(doc, decos)
}

export const ProgrammePageBreaks = Extension.create({
  name: "programmePageBreaks",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: pageBreakKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, set, _oldState, newState) {
            const extras = tr.getMeta(pageBreakKey) as ProgrammePageBreakSpec[] | undefined
            if (extras) return decorationsFor(newState.doc, extras)
            return set.map(tr.mapping, tr.doc)
          },
        },
        props: {
          decorations(state) {
            return pageBreakKey.getState(state)
          },
        },
      }),
    ]
  },
})

function nodeDomMatches(dom: Node | null | undefined, element: HTMLElement) {
  if (!(dom instanceof HTMLElement)) return false
  if (dom === element) return true
  if (element.tagName === "TABLE" && dom.classList.contains("tableWrapper") && dom.contains(element)) return true
  if (element.classList.contains("tableWrapper") && dom.tagName === "TABLE" && element.contains(dom)) return true
  return false
}

function nodePosFromElement(view: EditorView, element: HTMLElement) {
  if (!element.isConnected || !view.dom.contains(element)) return null
  const candidates = [element]
  if (element.tagName === "TABLE") {
    const wrapper = element.parentElement
    if (wrapper?.classList.contains("tableWrapper")) candidates.push(wrapper)
  }
  if (element.classList.contains("tableWrapper")) {
    const table = element.querySelector(":scope > table")
    if (table instanceof HTMLElement) candidates.push(table)
  }
  for (const candidate of candidates) {
    try {
      const pos = view.posAtDOM(candidate, 0)
      const $pos = view.state.doc.resolve(pos)
      for (let depth = $pos.depth; depth > 0; depth -= 1) {
        const before = $pos.before(depth)
        if (nodeDomMatches(view.nodeDOM(before), candidate) || nodeDomMatches(view.nodeDOM(before), element)) {
          return before
        }
      }
      if (element.parentElement === view.dom && $pos.depth > 0) return $pos.before($pos.depth)
    } catch {
      continue
    }
  }
  return null
}

function dispatchBreaks(editor: Editor, extras: ProgrammePageBreakSpec[]) {
  if (editor.isDestroyed) return
  const current = pageBreakKey.getState(editor.state)
  const next = decorationsFor(editor.state.doc, extras)
  if (current?.eq(next)) return
  const { tr } = editor.state
  editor.view.dispatch(tr.setMeta(pageBreakKey, extras).setMeta("addToHistory", false))
}

export function programmePaginationEditorsComposing() {
  for (const editor of editors) {
    if (!editor.isDestroyed && editor.view.composing) return true
  }
  return false
}

export function clearProgrammeEditorPageBreaks() {
  for (const editor of editors) dispatchBreaks(editor, [])
}

function specForUnit(view: EditorView, unit: HTMLElement, extra: number): ProgrammePageBreakSpec | null {
  if (extra <= 0.5) return null
  const target = programmePaginationBreakTarget(unit)
  const pos = nodePosFromElement(view, target) ?? nodePosFromElement(view, unit)
  if (pos == null) return null
  const node = view.state.doc.nodeAt(pos)
  if (!node) return null
  if (isTableRowNode(node)) return { pos, extra }
  const currentExtra = Number.parseFloat(target.dataset.programmePageExtra || "") || 0
  const computed = Number.parseFloat(getComputedStyle(target).marginTop) || 0
  return { pos, extra, marginTop: Math.max(0, computed - currentExtra) + extra }
}

export function applyProgrammeEditorPageBreaks(units: HTMLElement[], extras: number[]) {
  const handled = new Set<HTMLElement>()
  const byEditor = new Map<Editor, ProgrammePageBreakSpec[]>()
  for (const editor of editors) byEditor.set(editor, [])

  for (let index = 0; index < units.length; index += 1) {
    const unit = units[index]
    const extra = extras[index] ?? 0
    if (!unit) continue
    let match: Editor | undefined
    for (const editor of editors) {
      if (editor.isDestroyed) continue
      if (editor.view.dom === unit || editor.view.dom.contains(unit)) {
        match = editor
        break
      }
    }
    if (!match) continue
    handled.add(unit)
    const spec = specForUnit(match.view, unit, extra)
    if (spec && extra > 0.5) byEditor.get(match)?.push(spec)
  }

  for (const [editor, specs] of byEditor) dispatchBreaks(editor, specs)
  return handled
}
