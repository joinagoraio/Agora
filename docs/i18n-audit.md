# i18n Audit – Remaining English Strings

The following surfaces still contain hard‑coded English copy and must be moved into `lib/i18n/messages/{en,nl}.ts`. Paths reference the main entry file; many components pull in sub‑components with additional strings.

## Workspace Sources & Ingestion
- `components/manage-sources-dialog.tsx`
  - Dialog title/description, button labels (“Add Source”, “Manage Sources”), helper text, validation errors, Google token notices.
  - Source type metadata (`SOURCE_TYPE_DEFINITIONS`).
  - Empty states (“No sources yet…”, “Loading sources…”).
- `components/source-card.tsx`
  - Status chips, dropdown actions (“Test Connection”, “Delete”), confirmation dialogs, toast/error copy.
- `components/add-from-source-dialog.tsx`
  - Trigger (“Add from Source”), dialog headings, form labels (“Select Source”, “Classification”), empty placeholders, alert descriptions, toast/error messages.
- `components/add-overheid-documents-dialog.tsx`
  - Entire search UX (filters, placeholders, success/error toasts).
- `components/google-drive-search.tsx`, `components/overheid-search.tsx`
  - Field labels, pill text, placeholders, error banners.
- `components/upload-document-dialog.tsx`
  - Trigger/button text (“Upload Documents”, “Browse”), instructions (“Supported formats…”), error toasts, classification labels, progress status (“Uploading…”).
- `components/create-workspace-document-dialog.tsx`, `components/create-workspace-dialog.tsx`, `components/create-space-dialog.tsx`
  - Form headings, labels, helper descriptions, success/error toasts.

## Workspace Evidence & Notes
- `components/workspace-evidence-board.tsx`
  - Section headers (“Evidence Board”), buttons (“Add Evidence”, “Link Source”), comment placeholders, toast/error copy.
- `components/workspace-notes-panel.tsx`
  - Dialogs for creating/editing notes, toggle labels (“Include in AI context”), empty states.
- `components/workspace-comments.tsx`, `components/workspace-notes.tsx`
  - Timeline labels (“Just now”), delete confirmations, validation errors.

## Document Viewers
- `components/document-viewer-client.tsx`, `components/multi-format-viewer.tsx`, `components/pdf-viewer.tsx`, `components/markdown-viewer.tsx`
  - Toolbar buttons (“Download PDF”, “Zoom in”), sidebar labels (“Highlights”, “Sources”), empty states (“No highlights yet”), error banners.
- `app/workspaces/[workspaceId]/documents/[documentId]/page.tsx`
  - Breadcrumb text, action buttons (“Open in new tab”), metadata headings (“Document details”).

## Chat & Conversation Tools
- `components/chat-interface.tsx`
  - Composer placeholder, “Regenerate Response”, “Stop Generating”, follow‑up suggestion labels, token/latency stats, error banners.
- `components/chat-sidebar.tsx`
  - Some strings already localized, but conversation list empty states, tooltips, dialog copy should move to dictionaries for consistency.
- `components/chat-toggle-button.tsx`
  - SR text localized; ensure tooltip/trigger text (if added) also use `t()`.

## Dashboard & Landing Gaps
- `app/dashboard/page.tsx`
  - Space/Workspace cards (“No spaces yet”, “My Workspaces”), empty descriptions for direct workspace section.
- `components/landing-header.tsx`, `app/page.tsx`
  - Most hero copy localized, but footer links (“Documentation”, “Support”) should reference dictionary entries.

## Auth & Profile
- `app/auth/*` (login/signup/reset) pages include English headings/instructions/buttons.
- `app/profile/page.tsx` mostly localized, but fallback strings (“User”, “—”) should live in dictionaries.

## Miscellaneous Components
- `components/space-documents-panel.tsx`, `components/documents-list.tsx`, `components/my-documents-list.tsx`
  - Section headers (“Uploaded Documents”), button text (“Show archived”), inline filters.
- `components/space-setup-wizard.tsx`, `components/space-settings.tsx`, `components/workspace-settings.tsx`
  - Stepper titles, helper copy, success toasts.
- `components/notifications-toast.tsx`, `components/error-boundary.tsx`
  - Error descriptions (“Something went wrong”), recovery buttons.
- `components/welcome-user-dialog.tsx`, `components/welcome-workspace-wrapper.tsx`
  - Dialog text, CTA buttons.

## Server Actions & API Responses
- `lib/actions/**/*`, `app/api/**/*`
  - Many return English strings (e.g., `"Failed to refresh sources"`, `"Invalid or expired access token"`). These should either be localized via dictionary lookup or replaced with language-neutral identifiers consumed by the UI.

## Next Steps
1. Mirror each item above into `lib/i18n/messages/en.ts`/`nl.ts`.
2. Update server components with `getServerTranslator`.
3. Update client components with `useI18n`.
4. Normalize toast/error handling so language comes from the shared dictionaries.

