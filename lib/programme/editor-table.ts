import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table"
import {
  parseProgrammeTableBorders,
  PROGRAMME_TABLE_BORDERS_ATTR,
} from "@/lib/programme/table-style"

export const ProgrammeTable = Table.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      borders: {
        default: "all",
        parseHTML: (element) => parseProgrammeTableBorders(element.getAttribute(PROGRAMME_TABLE_BORDERS_ATTR)),
        renderHTML: (attributes) => ({
          [PROGRAMME_TABLE_BORDERS_ATTR]: parseProgrammeTableBorders(attributes.borders),
        }),
      },
    }
  },
}).configure({
  resizable: false,
})

export const programmeTableExtensions = [ProgrammeTable, TableRow, TableHeader, TableCell]
