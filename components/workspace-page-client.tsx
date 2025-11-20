"use client"

import dynamic from "next/dynamic"

const DocumentsList = dynamic(
  () => import("@/components/documents-list").then((mod) => ({ default: mod.DocumentsList })),
  { ssr: false },
)
const MyDocumentsList = dynamic(
  () => import("@/components/my-documents-list").then((mod) => ({ default: mod.MyDocumentsList })),
  { ssr: false },
)
const UploadDocumentDialog = dynamic(
  () => import("@/components/upload-document-dialog").then((mod) => ({ default: mod.UploadDocumentDialog })),
  { ssr: false },
)
const AddFromSourceDialog = dynamic(
  () => import("@/components/add-from-source-dialog").then((mod) => ({ default: mod.AddFromSourceDialog })),
  { ssr: false },
)
const WorkspaceEvidenceBoard = dynamic(
  () => import("@/components/workspace-evidence-board").then((mod) => ({ default: mod.WorkspaceEvidenceBoard })),
  { ssr: false },
)
const WorkspaceInheritedItems = dynamic(
  () => import("@/components/workspace-inherited-items").then((mod) => ({ default: mod.WorkspaceInheritedItems })),
  { ssr: false },
)
const WorkspaceNotesPanel = dynamic(
  () => import("@/components/workspace-notes-panel").then((mod) => ({ default: mod.WorkspaceNotesPanel })),
  { ssr: false },
)
const WorkspaceNotesCount = dynamic(
  () => import("@/components/workspace-notes-count").then((mod) => ({ default: mod.WorkspaceNotesCount })),
  { ssr: false },
)

export {
  DocumentsList,
  MyDocumentsList,
  UploadDocumentDialog,
  AddFromSourceDialog,
  WorkspaceEvidenceBoard,
  WorkspaceInheritedItems,
  WorkspaceNotesPanel,
  WorkspaceNotesCount,
}
