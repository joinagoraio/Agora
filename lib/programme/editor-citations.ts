import { Extension } from "@tiptap/core"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"
import type { Node as ProseMirrorNode } from "@tiptap/pm/model"
import {
  findProgrammeCitationMarkers,
  programmeCitationAnchorHtml,
  type ProgrammeCitationSource,
} from "@/lib/programme/citation-display"

export type ProgrammeCitationLookup = {
  current: {
    workspaceId?: string | null
    sources: ProgrammeCitationSource[]
  }
}

function textblockPlain(node: ProseMirrorNode, pos: number) {
  const positions: number[] = []
  let text = ""
  node.descendants((child, childPos) => {
    if (!child.isText || !child.text) return
    const start = pos + 1 + childPos
    for (let offset = 0; offset < child.text.length; offset += 1) positions.push(start + offset)
    text += child.text
  })
  return { text, positions }
}

function citationDecorations(doc: ProseMirrorNode, lookup: ProgrammeCitationLookup["current"]) {
  const decorations: Decoration[] = []
  let index = 0
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return
    const { text, positions } = textblockPlain(node, pos)
    for (const hit of findProgrammeCitationMarkers(text)) {
      const from = positions[hit.start]
      const last = positions[hit.end - 1]
      if (from == null || last == null) continue
      index += 1
      const to = last + 1
      const html = programmeCitationAnchorHtml(hit.citation, lookup.sources, index, lookup.workspaceId)
      decorations.push(Decoration.inline(from, to, { class: "programme-citation-marker" }))
      decorations.push(
        Decoration.widget(
          from,
          () => {
            const host = document.createElement("span")
            host.innerHTML = html
            return host.firstElementChild || host
          },
          { side: -1, ignoreSelection: true, stopEvent: () => true, key: `programme-citation-${from}` },
        ),
      )
    }
    return false
  })
  return DecorationSet.create(doc, decorations)
}

export function programmeCitationExtension(lookup: ProgrammeCitationLookup) {
  return Extension.create({
    name: "programmeCitations",
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: new PluginKey("programmeCitations"),
          props: {
            decorations(state) {
              return citationDecorations(state.doc, lookup.current)
            },
          },
        }),
      ]
    },
  })
}
