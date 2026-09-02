import { Extension } from "@tiptap/core"
import { Plugin, PluginKey } from "@tiptap/pm/state"

export const BLOCK_ID_ATTR = "data-block-id"
const BLOCK_TYPES = ["paragraph", "heading", "blockquote"] as const

export function createBlockId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID()
  return `b-${Math.random().toString(36).slice(2, 12)}`
}

export function stableBlockId(text: string, index: number) {
  const source = `${index}:${text.replace(/\s+/g, " ").trim()}`
  let hash = 0
  for (let i = 0; i < source.length; i += 1) hash = (hash * 31 + source.charCodeAt(i)) | 0
  return `b${(hash >>> 0).toString(16)}`
}

export function ensureBlockIdsInHtml(html: string): string {
  if (!html?.trim() || typeof window === "undefined") return html
  const doc = window.document.implementation.createHTMLDocument("")
  doc.body.innerHTML = html
  doc.body.querySelectorAll("p, h1, h2, h3, blockquote").forEach((el, index) => {
    if (!el.getAttribute(BLOCK_ID_ATTR)) {
      el.setAttribute(BLOCK_ID_ATTR, stableBlockId(el.textContent || "", index))
    }
  })
  return doc.body.innerHTML
}

export function quoteFromBlock(root: ParentNode | null, blockId: string, max = 140) {
  if (!root) return ""
  const el = root.querySelector(`[${BLOCK_ID_ATTR}="${CSS.escape(blockId)}"]`)
  const text = el?.textContent?.replace(/\s+/g, " ").trim() || ""
  if (text.length <= max) return text
  return `${text.slice(0, max).trim()}…`
}

export const BlockId = Extension.create({
  name: "blockId",
  addGlobalAttributes() {
    return [
      {
        types: [...BLOCK_TYPES],
        attributes: {
          blockId: {
            default: null,
            parseHTML: (element) => element.getAttribute(BLOCK_ID_ATTR),
            renderHTML: (attributes) =>
              attributes.blockId ? { [BLOCK_ID_ATTR]: attributes.blockId } : {},
          },
        },
      },
    ]
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("blockId"),
        appendTransaction(transactions, _oldState, newState) {
          if (!transactions.some((tr) => tr.docChanged)) return null
          let tr = newState.tr
          let modified = false
          newState.doc.descendants((node, pos) => {
            if (!node.isBlock) return
            if (!(BLOCK_TYPES as readonly string[]).includes(node.type.name)) return
            if (node.attrs.blockId) return
            tr = tr.setNodeMarkup(pos, undefined, { ...node.attrs, blockId: createBlockId() })
            modified = true
          })
          return modified ? tr : null
        },
      }),
    ]
  },
})
