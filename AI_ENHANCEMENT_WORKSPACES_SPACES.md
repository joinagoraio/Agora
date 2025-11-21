# AI Enhancement for Workspaces & Spaces

## Overview

Both **Workspaces** and **Spaces** now have AI-enhanced text fields that help improve the clarity and quality of descriptions.

## Field Structure

### Workspaces
| Field | Length | AI-Enhanced | Purpose |
|-------|--------|-------------|---------|
| **Summary** | 1-2 sentences | ✅ Yes | Brief overview of workspace purpose |
| **Description** | 4-6 sentences | ✅ Yes | Detailed workspace description |
| Context | Variable | ❌ No | Additional AI search context |
| Location | Short | ❌ No | Physical/geographic location |

### Spaces
| Field | Length | AI-Enhanced | Purpose |
|-------|--------|-------------|---------|
| **Summary** | 1-2 sentences | ✅ Yes | Mission statement |
| **Description** | 4-6 sentences | ✅ Yes | Detailed space description |
| Type | Enum | ❌ No | Space type (national, regional, etc.) |
| Jurisdiction | JSON | ❌ No | Jurisdiction information |

## AI Enhancement Functions

### For Workspaces
**Function:** `enhanceWorkspaceText(text, options)`

**Usage:**
```typescript
// Enhance summary (brief)
const result = await enhanceWorkspaceText(userText, {
  field: "summary",
  workspaceName: "Urban Planning Workspace"
})

// Enhance description (detailed)
const result = await enhanceWorkspaceText(userText, {
  field: "description",
  summary: "Brief summary from above" // Optional context
})
```

### For Spaces
**Function:** `enhanceScopeText(text, options)`

**Usage:**
```typescript
// Enhance mission statement
const result = await enhanceScopeText(userText, {
  field: "summary",
  spaceName: "Municipal Policy Space"
})

// Enhance description
const result = await enhanceScopeText(userText, {
  field: "description",
  missionStatement: "Mission from above" // Optional context
})
```

## AI Prompts

### Summary/Mission Statement (1-2 sentences)
The AI is instructed to:
- Be very brief and concise
- Capture core purpose and mandate
- Stay faithful to original meaning
- Use neutral, professional language
- Be suitable as a high-level summary

**Max tokens:** 120

### Description (4-6 sentences)
The AI is instructed to:
- Be longer than summary but still concise
- Expand with specific details
- Stay faithful to original meaning
- Use neutral, professional language
- Provide enough detail for understanding
- Not be overly verbose

**Max tokens:** 500

## Database Schema

### Workspaces Table
```sql
ALTER TABLE public.workspaces
ADD COLUMN IF NOT EXISTS summary TEXT,
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS context TEXT,
ADD COLUMN IF NOT EXISTS location TEXT;

COMMENT ON COLUMN workspaces.summary IS 'Brief 1-2 sentence summary (AI-enhanced)';
COMMENT ON COLUMN workspaces.description IS 'Detailed 4-6 sentence description (AI-enhanced)';
COMMENT ON COLUMN workspaces.context IS 'Additional AI search context';
COMMENT ON COLUMN workspaces.location IS 'Workspace location';
```

### Spaces Table
```sql
-- Summary is stored in metadata.summary
-- Description is stored in metadata.description OR description column
```

## UI Implementation

### Workspace Overview Component
Should include:
- Input field for **Summary** with AI enhance button
- Textarea for **Description** with AI enhance button
- Input field for Context
- Input field for Location

### Space Settings Component
Should include:
- Input field for **Mission Statement/Summary** with AI enhance button
- Textarea for **Description** with AI enhance button
- Other space fields (type, jurisdiction, etc.)

## API Endpoints

The AI enhancement is handled server-side through server actions:

- `enhanceWorkspaceText()` - For workspace fields
- `enhanceScopeText()` - For space fields

Both require:
- ✅ Authentication
- ✅ OpenAI API key configured
- ✅ Non-empty input text

## Benefits

### For Users
- ✅ **Clarity**: AI improves text clarity and professionalism
- ✅ **Consistency**: Similar tone across all workspaces/spaces
- ✅ **Time-saving**: Quick improvements without manual rewriting
- ✅ **Guidance**: AI helps structure thoughts appropriately

### For AI Assistant
- ✅ **Better context**: Clear, concise descriptions help AI understand workspace scope
- ✅ **Improved search**: Well-written summaries improve document search relevance
- ✅ **Accurate responses**: Detailed descriptions help AI provide accurate answers

## Migration Required

To enable these features, run:

```bash
scripts/add_missing_columns_workspaces_spaces.sql
```

This adds:
- ✅ `summary` column to workspaces
- ✅ `description` column verification
- ✅ `context` and `location` columns
- ✅ All necessary space columns

## Implementation Checklist

- ✅ Add `enhanceWorkspaceText()` function
- ✅ Update `updateWorkspace()` to accept `summary`
- ✅ Add `summary` column to database
- ⏳ Update UI to show summary field
- ⏳ Add AI enhance button to workspace summary
- ⏳ Add AI enhance button to workspace description
- ⏳ Test AI enhancement with different text inputs

## Example Flow

1. **User enters summary text:**
   ```
   "This workspace tracks urban development projects"
   ```

2. **User clicks "AI Enhance"**

3. **AI returns improved text:**
   ```
   "Urban Development Projects workspace tracks and coordinates planning initiatives for city infrastructure improvements and community development."
   ```

4. **User can:**
   - Accept the AI suggestion
   - Edit it further
   - Discard and keep original

## Notes

- AI enhancement uses GPT-4o-mini for cost efficiency
- Temperature set to 0.7 for balanced creativity/consistency
- Original user text is always preserved until they accept AI suggestion
- AI context includes workspace/space name when available
- For descriptions, summary/mission statement is included as context

## Future Enhancements

Potential improvements:
- 🔮 Multiple AI suggestion options
- 🔮 Tone selection (formal, casual, technical)
- 🔮 Length customization
- 🔮 Multilingual support
- 🔮 Save AI enhancement history

---

**Status:** ✅ Backend implemented, ⏳ Awaiting UI integration

