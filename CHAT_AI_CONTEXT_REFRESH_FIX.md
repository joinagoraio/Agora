# Chat AI Context Refresh Fix

## Problem

The chat interface's AI context section (showing documents, notes, and evidence) was refreshing excessively whenever workspace knowledge was updated. This caused the entire chat input section to re-render, creating a disruptive user experience where:

- The message input area would flicker/refresh
- User focus might be lost from the input field
- The entire section would show loading states unnecessarily

## Root Cause

The chat interface was listening to `documentUploaded` and `workspaceContextUpdated` events and responding by calling `loadContextItems()`, which:

1. Set ALL loading states to `true` (documents, notes, evidence)
2. Fetched ALL context data from the server (full reload)
3. Updated ALL state variables
4. Caused a complete re-render of the chat section

This was happening even when only a single item (like one note or one piece of evidence) was updated.

## Solution

Implemented **incremental updates** to the AI context instead of full reloads:

### 1. Created Granular Update Functions

Added four new focused update functions in `chat-interface.tsx`:

- `updateDocuments()` - Updates only the documents list
- `updateNotes()` - Updates only the notes list
- `updateEvidence()` - Updates only the evidence items
- `updateWorkspaceContext()` - Updates only workspace context/location

Each function:
- Fetches only the specific data it needs
- Updates only its specific state variables
- Does NOT set loading states (avoiding UI flicker)
- Handles errors gracefully

### 2. Enhanced Event Handling

Modified the event listeners to parse event details and route to specific update functions:

```typescript
const handleContextUpdate = (event: CustomEvent<{ 
  workspaceId?: string; 
  type?: string; 
  action?: string 
}>) => {
  // Parse event details
  const updateType = event.detail?.type
  
  // Route to specific update function based on what changed
  switch (updateType) {
    case "document":
      updateDocuments()
      break
    case "note":
      updateNotes()
      break
    case "evidence":
      updateEvidence()
      break
    case "workspace":
      updateWorkspaceContext()
      break
    default:
      // Fallback to full reload if type not specified
      loadContextItems()
  }
}
```

### 3. Added Missing Event Dispatchers

Added `workspaceContextUpdated` event dispatching in two components that were missing it:

#### workspace-overview.tsx
When workspace context/location is saved:
```typescript
window.dispatchEvent(
  new CustomEvent("workspaceContextUpdated", {
    detail: { workspaceId, type: "workspace", action: "updated" },
  }),
)
```

#### welcome-workspace-dialog.tsx
When initial workspace setup is completed:
```typescript
window.dispatchEvent(
  new CustomEvent("workspaceContextUpdated", {
    detail: { workspaceId: workspace.id, type: "workspace", action: "updated" },
  }),
)
```

## Event Types

The system now properly handles these event types:

| Event Type | Detail Type | Triggered When | Updates |
|------------|-------------|----------------|---------|
| `documentUploaded` | N/A | Document uploaded | Documents list |
| `workspaceContextUpdated` | `document` | Document deleted/archived | Documents list |
| `workspaceContextUpdated` | `note` | Note created/updated/deleted | Notes list |
| `workspaceContextUpdated` | `evidence` | Evidence AI context toggled | Evidence list |
| `workspaceContextUpdated` | `workspace` | Workspace context/location updated | Workspace metadata |

## Benefits

1. **Better UX**: Chat input section no longer flickers or refreshes unnecessarily
2. **Better Performance**: Only fetches and updates the specific data that changed
3. **Maintains Accuracy**: AI context still stays perfectly in sync with workspace knowledge
4. **Backward Compatible**: Falls back to full reload if event type is not specified
5. **Scalable**: Easy to add new context types in the future

## Files Modified

- `components/chat-interface.tsx` - Added granular update functions and enhanced event handling
- `components/workspace-overview.tsx` - Added event dispatching on workspace context save
- `components/welcome-workspace-dialog.tsx` - Added event dispatching on initial workspace setup

## Testing Recommendations

Test the following scenarios to verify the fix:

1. **Upload a document** - Only documents section should update, chat input should remain stable
2. **Add a note** - Only notes should update in AI context
3. **Toggle evidence AI context** - Only evidence should update
4. **Update workspace context/location** - Only workspace metadata should update
5. **Type in chat input while updates happen** - Input focus and content should be preserved
6. **Switch between tabs/windows** - Full refresh on focus still works (existing behavior)

## Future Enhancements

Consider these potential improvements:

1. **Optimistic updates**: Update UI immediately before server confirmation
2. **Real-time sync**: Use Supabase real-time subscriptions instead of events
3. **Debouncing**: Batch multiple rapid updates into single refresh
4. **Visual indicators**: Show subtle badges when context updates (without full refresh)

