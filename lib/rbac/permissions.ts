// Support both old and new role systems for backward compatibility
type LegacyRole = "owner" | "admin" | "member" | "viewer"
type NewRole = "tenant_admin" | "org_manager" | "project_owner" | "analyst" | "contributor" | "viewer" | "external"
export type Role = LegacyRole | NewRole

type Permission =
  | "space:delete"
  | "space:update"
  | "space:invite"
  | "workspace:create"
  | "workspace:update"
  | "workspace:delete"
  | "workspace:share"
  | "source:create"
  | "source:update"
  | "source:delete"
  | "space_item:publish"
  | "space_item:update"
  | "workspace_item:create"
  | "workspace_item:update"
  | "evidence:save"
  | "conversation:create"
  | "conversation:view"
  | "conversation:share"
  | "external:view"

// Map old roles to new roles for permission checking
function normalizeRole(role: Role): NewRole {
  const roleMap: Record<LegacyRole, NewRole> = {
    owner: "tenant_admin",
    admin: "org_manager",
    member: "contributor",
    viewer: "viewer",
  }
  return roleMap[role as LegacyRole] || (role as NewRole)
}

const rolePermissions: Record<NewRole, Permission[]> = {
  tenant_admin: [
    "space:delete",
    "space:update",
    "space:invite",
    "workspace:create",
    "workspace:update",
    "workspace:delete",
    "workspace:share",
    "source:create",
    "source:update",
    "source:delete",
    "space_item:publish",
    "space_item:update",
    "workspace_item:create",
    "workspace_item:update",
    "evidence:save",
    "conversation:create",
    "conversation:view",
    "conversation:share",
  ],
  org_manager: [
    "space:update",
    "space:invite",
    "workspace:create",
    "workspace:update",
    "workspace:delete",
    "workspace:share",
    "source:create",
    "source:update",
    "source:delete",
    "space_item:publish",
    "space_item:update",
    "workspace_item:create",
    "workspace_item:update",
    "evidence:save",
    "conversation:create",
    "conversation:view",
    "conversation:share",
  ],
  project_owner: [
    "workspace:create",
    "workspace:update",
    "workspace:delete",
    "workspace:share",
    "source:create",
    "source:update",
    "source:delete",
    "workspace_item:create",
    "workspace_item:update",
    "evidence:save",
    "conversation:create",
    "conversation:view",
    "conversation:share",
  ],
  analyst: [
    "workspace_item:create",
    "workspace_item:update",
    "evidence:save",
    "conversation:create",
    "conversation:view",
    "conversation:share",
  ],
  contributor: [
    "workspace_item:create",
    "workspace_item:update",
    "evidence:save",
    "conversation:create",
    "conversation:view",
    "conversation:share",
  ],
  viewer: ["conversation:view"],
  external: ["external:view"],
}

// Backward compatibility: map old roles
const legacyRolePermissions: Record<LegacyRole, Permission[]> = {
  owner: rolePermissions.tenant_admin,
  admin: rolePermissions.org_manager,
  member: rolePermissions.contributor,
  viewer: rolePermissions.viewer,
}

export function hasPermission(role: Role, permission: Permission): boolean {
  const normalizedRole = normalizeRole(role)
  return rolePermissions[normalizedRole]?.includes(permission) || false
}

export function canManageSpace(role: Role): boolean {
  return hasPermission(role, "space:update")
}

export function canDeleteSpace(role: Role): boolean {
  return hasPermission(role, "space:delete")
}

export function canInviteMembers(role: Role): boolean {
  return hasPermission(role, "space:invite")
}

export function canManageWorkspaces(role: Role): boolean {
  return hasPermission(role, "workspace:create")
}

export function canManageSources(role: Role): boolean {
  return hasPermission(role, "source:create")
}

export function canPublishSpaceItems(role: Role): boolean {
  return hasPermission(role, "space_item:publish")
}

export function canSaveEvidence(role: Role): boolean {
  return hasPermission(role, "evidence:save")
}

export function canShareWorkspace(role: Role): boolean {
  return hasPermission(role, "workspace:share")
}

export function canViewExternal(role: Role): boolean {
  return hasPermission(role, "external:view")
}
