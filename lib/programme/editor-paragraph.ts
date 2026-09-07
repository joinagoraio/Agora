import { Extension } from "@tiptap/core"
import type { Node as ProseMirrorNode } from "@tiptap/pm/model"
import type { Transaction } from "@tiptap/pm/state"
import {
  parseProgrammeLineHeight,
  parseProgrammeSpaceAfter,
  PROGRAMME_LINE_HEIGHT_ATTR,
  PROGRAMME_SPACE_AFTER_ATTR,
  type ProgrammeLineHeight,
  type ProgrammeSpaceAfter,
} from "@/lib/programme/paragraph-style"

const SPACING_TYPES = new Set(["paragraph", "heading", "blockquote"])

type SpacingPatch = {
  lineHeight?: ProgrammeLineHeight | null
  spaceAfter?: ProgrammeSpaceAfter | null
}

function applySpacing(tr: Transaction, from: number, to: number, patch: SpacingPatch) {
  const updates: Array<{ pos: number; attrs: Record<string, unknown> }> = []
  tr.doc.nodesBetween(from, to, (node: ProseMirrorNode, pos: number) => {
    if (!SPACING_TYPES.has(node.type.name)) return
    const next = { ...node.attrs }
    if ("lineHeight" in patch) next.lineHeight = patch.lineHeight ?? null
    if ("spaceAfter" in patch) next.spaceAfter = patch.spaceAfter ?? null
    if (next.lineHeight === node.attrs.lineHeight && next.spaceAfter === node.attrs.spaceAfter) return
    updates.push({ pos, attrs: next })
  })
  for (const update of updates) {
    tr.setNodeMarkup(update.pos, undefined, update.attrs)
  }
  if (updates.length > 0) return true
  const $from = tr.selection.$from
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth)
    if (!SPACING_TYPES.has(node.type.name)) continue
    const next = { ...node.attrs }
    if ("lineHeight" in patch) next.lineHeight = patch.lineHeight ?? null
    if ("spaceAfter" in patch) next.spaceAfter = patch.spaceAfter ?? null
    tr.setNodeMarkup($from.before(depth), undefined, next)
    return true
  }
  return false
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    programmeParagraphSpacing: {
      setProgrammeLineHeight: (value: ProgrammeLineHeight | null) => ReturnType
      setProgrammeSpaceAfter: (value: ProgrammeSpaceAfter | null) => ReturnType
    }
  }
}

export const ProgrammeParagraphSpacing = Extension.create({
  name: "programmeParagraphSpacing",
  addGlobalAttributes() {
    return [
      {
        types: ["paragraph", "heading", "blockquote"],
        attributes: {
          lineHeight: {
            default: null,
            parseHTML: (element) =>
              parseProgrammeLineHeight(element.getAttribute(PROGRAMME_LINE_HEIGHT_ATTR) || element.style.lineHeight),
            renderHTML: (attributes) =>
              attributes.lineHeight ? { [PROGRAMME_LINE_HEIGHT_ATTR]: attributes.lineHeight } : {},
          },
          spaceAfter: {
            default: null,
            parseHTML: (element) =>
              parseProgrammeSpaceAfter(
                element.getAttribute(PROGRAMME_SPACE_AFTER_ATTR) || element.style.marginBottom,
              ),
            renderHTML: (attributes) =>
              attributes.spaceAfter ? { [PROGRAMME_SPACE_AFTER_ATTR]: attributes.spaceAfter } : {},
          },
        },
      },
    ]
  },
  addCommands() {
    return {
      setProgrammeLineHeight:
        (value) =>
        ({ tr, state, dispatch }) => {
          const next = applySpacing(tr, state.selection.from, state.selection.to, { lineHeight: value })
          if (next && dispatch) dispatch(tr)
          return next
        },
      setProgrammeSpaceAfter:
        (value) =>
        ({ tr, state, dispatch }) => {
          const next = applySpacing(tr, state.selection.from, state.selection.to, { spaceAfter: value })
          if (next && dispatch) dispatch(tr)
          return next
        },
    }
  },
})
