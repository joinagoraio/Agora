# Space Member Permissions Update

## Overview
Updated the space and workspace permission system to provide members with full access to all workspace features while restricting Settings access to owners and admins only. Viewers now have read-only access throughout the application.

## New Features

### Role Management for Space Admins
- ✅ **Admins can change member roles** directly from Space Settings
- ✅ **Dropdown selector** next to each member (except owner and yourself)
- ✅ **Confirmation modal** with role descriptions before changing roles
- ✅ **Cannot change owner's role** (protected)
- ✅ **Cannot change your own role** (prevents accidental self-demotion)

## Permission Structure

### Space Roles

#### Owner
- Full access to everything including Settings
- Can delete spaces
- Can manage members and invitations

#### Admin
- Full access except space deletion
- Can access Settings
- Can manage members and invitations
- Can create/edit/delete workspaces and documents

#### Member (NEW PERMISSIONS)
- **Full access to all workspace features** (same as Admin)
- Can create workspaces
- **Can see workspace edit/settings dropdown** (full workspace management)
- Can upload/edit/delete workspace documents
- Can manage sources in workspaces
- **Cannot see vertical ellipsis (⋮) menu for spaces** (no space editing/settings)
- Cannot manage space members or invitations

#### Viewer
- Read-only access throughout
- Cannot see "New workspace" button
- Cannot see "Upload document" button
- Cannot see vertical ellipsis (⋮) menus for spaces, workspaces, or documents
- Cannot see edit/settings dropdowns anywhere
- Can only view content

## Files Modified

### 1. Permission System (`lib/rbac/permissions.ts`)
- Updated `contributor` role (maps to `member`) to have full workspace permissions
- Added new function `canAccessSettings()` to restrict Settings access to owner/admin only

### 2. Database Functions (`scripts/update_member_permissions.sql`)
- Updated `is_workspace_member()` to check for 'member' role (not just 'admin')
- Members now have full workspace access at database level
- Note: This script needs to be run on the database

### 3. Space Page (`app/spaces/[spaceId]/page.tsx`)
- Added separate `canManage` and `canAccessSettings` checks
- `canManage`: owner, admin, or member
- `canAccessSettings`: owner or admin only
- Passes both props to SpacePageClient

### 4. Space Page Client (`components/space-page-client.tsx`)
- Accepts new `canAccessSettings` prop
- Vertical ellipsis (⋮) menu now only shown if `canAccessSettings` is true
- Only owner/admin can see the space edit and settings menu

### 5. Space Documents Panel (`components/space-documents-panel.tsx`)
- Added `canUpload` and `canManage` props (default: true)
- Upload document button shown only if `canUpload`
- Document action menu (download/delete) shown only if `canManage`

### 6. Space Workspace List (`components/space-workspace-list.tsx`)
- Already uses `canCreate` prop correctly
- "New workspace" button shown only if `canCreate`

### 7. Workspace Access Utility (`lib/utils/workspace-access.ts`)
- Updated to include 'member' role in workspace access check
- Members now have full workspace access

### 8. Workspace Page (`app/workspaces/[workspaceId]/page.tsx`)
- Fetches user's space role
- Calculates `canManage` based on space role (owner/admin/member)
- Passes `canManage` to DocumentsList and MyDocumentsList
- Conditionally shows "New Document" button based on `canManage`
- **Displays user's role badge** next to the user menu (like in space pages)

### 9. Documents List (`components/documents-list.tsx`)
- Added `canManage` prop (default: true)
- All action buttons (Upload, Add Source, Manage Sources) shown only if `canManage`
- Document dropdown menu (download/archive/delete) shown only if `canManage`
- Empty state message changes based on `canManage`

### 10. My Documents List (`components/my-documents-list.tsx`)
- Added `canManage` prop (default: true)
- Document dropdown menu (edit/delete) shown only if `canManage`
- Empty state shows different message for viewers ("No documents have been shared with you yet")
- "Create your first document" button hidden for viewers
- Header description changes based on role

### 11. Workspace Overview (`components/workspace-overview.tsx`)
- Added `canManage` prop (default: true)
- Workspace edit and settings dropdown shown only if `canManage`
- Members can see this dropdown (full workspace access)

### 12. Workspace Notes Panel (`components/workspace-notes-panel.tsx`)
- Added `canManage` prop (default: true)
- "Add Note" button hidden for viewers
- Draft note card not rendered for viewers
- Empty state shows different message for viewers ("No notes have been created yet")
- Description changes based on role
- Note owners can still edit/delete their own notes (unchanged)

### 13. Chat Interface (`components/chat-interface.tsx`)
- Added `canManage` prop (default: true)
- "Save as evidence" button hidden for viewers
- Viewers can view chat conversations but cannot save messages as evidence
- Evidence save functionality completely disabled for viewers

### 14. Chat Sidebar (`components/chat-sidebar.tsx`)
- Added `canManage` prop (default: true)
- Passes `canManage` to ChatInterface component

### 15. Workspace Chat Wrapper (`components/workspace-chat-wrapper.tsx`)
- Added `canManage` prop (default: true)
- Passes `canManage` through to ChatSidebar and ChatInterface

### 20. Space Settings Component (`components/space-settings.tsx`)
- **Added role change functionality** ✅
- Admins can change member roles using a dropdown next to each member
- Confirmation dialog shows before role changes with role descriptions
- Cannot change owner's role (protected)
- Cannot change your own role (prevents self-demotion)
- Shows helpful description of each role's permissions in confirmation dialog

### 21. Space Actions (`lib/actions/space.ts`)
- **Added `updateSpaceMemberRole` function** ✅
- Checks if user is owner/admin before allowing role changes
- Prevents changing owner's role
- Validates permissions before updating
- Revalidates settings page after role change

### 16. Workspace Page (`app/workspaces/[workspaceId]/page.tsx`)
- Updated to pass `canManage` to WorkspaceChatWrapper
- All chat-related functionality respects viewer restrictions

### 17. Chat Page (`app/workspaces/[workspaceId]/chat/page.tsx`)
- Fetches user's space role
- Calculates `canManage` based on space role
- Passes `canManage` to ChatInterface
- Displays user's role badge next to user menu

### 18. Workspace Settings (`app/workspaces/[workspaceId]/settings/page.tsx`)
- Updated access check to allow space **members** (in addition to owner/admin)
- Members can now access workspace Settings pages
- This gives members full workspace management capabilities

### 19. Space Settings (`app/spaces/[spaceId]/settings/page.tsx`)
- Already has correct access check (owner/admin only)
- No changes needed

## Testing Checklist

### As a Member
- [x] Can create workspaces in a space
- [x] **Cannot** see the vertical ellipsis (⋮) menu for spaces
- [x] **Can** see the vertical ellipsis (⋮) menu for workspaces (Edit & Settings)
- [x] Can see their role badge in workspace pages
- [x] Can create documents in workspaces
- [x] Can upload documents to workspaces
- [x] Can manage sources in workspaces
- [x] Can archive/delete documents in workspaces
- [x] Can see the vertical ellipsis (⋮) menu for workspace documents

### As a Viewer
- [x] **Cannot** see vertical ellipsis (⋮) for spaces
- [x] **Cannot** see vertical ellipsis (⋮) for workspaces
- [x] **Cannot** see "New workspace" button
- [x] **Cannot** see "Upload document" button
- [x] **Cannot** see "Create your first document" button in My Documents
- [x] **Cannot** see "Add Note" button in workspace notes
- [x] **Cannot** see "Save as evidence" button in chat
- [x] **Cannot** see vertical ellipsis (⋮) for documents
- [x] **Cannot** see any action buttons or dropdowns
- [x] See appropriate messages:
  - "No documents have been shared with you yet"
  - "No notes have been created yet"
  - "View team notes and context for this workspace"
- [x] Can view all content (spaces, workspaces, documents, notes)
- [x] Can view but not edit/delete (except own notes if they created any before becoming a viewer)

## Database Migration Required

Run the following migration script on your database:

```bash
# Using Supabase CLI (if available)
psql -h <your-db-host> -U <your-db-user> -d <your-db-name> -f scripts/update_member_permissions.sql

# Or apply via Supabase dashboard SQL editor
```

The migration updates the RLS functions to recognize members as having full workspace access.

## Backward Compatibility

All changes maintain backward compatibility:
- Default values for new props are `true`, maintaining current behavior
- Existing code without role checks continues to work
- Database changes enhance access without breaking existing functionality

## Security Notes

1. **Settings Access**: Settings pages (both space and workspace level) remain protected at the page level with access checks that redirect unauthorized users.

2. **Database Level**: RLS policies need to be updated using the migration script to fully enforce member permissions at the database level.

3. **UI Consistency**: All UI elements respect the permission checks to prevent confusion and attempted unauthorized actions.

4. **API Protection**: Server-side API routes should also respect these role checks (not modified in this update, verify separately).

