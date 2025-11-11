type Role = "owner" | "admin" | "member" | "viewer"

type Permission =
  | "space:delete"
  | "space:update"
  | "space:invite"
  | "workspace:create"
  | "workspace:update"
  | "workspace:delete"
  | "connector:create"
  | "connector:update"
  | "connector:delete"
  | "conversation:create"
  | "conversation:view"
  | "conversation:share"

const rolePermissions: Record<Role, Permission[]> = {
  owner: [
    "space:delete",
    "space:update",
    "space:invite",
    "workspace:create",
    "workspace:update",
    "workspace:delete",
    "connector:create",
    "connector:update",
    "connector:delete",
    "conversation:create",
    "conversation:view",
    "conversation:share",
  ],
  admin: [
    "space:update",
    "space:invite",
    "workspace:create",
    "workspace:update",
    "workspace:delete",
    "connector:create",
    "connector:update",
    "connector:delete",
    "conversation:create",
    "conversation:view",
    "conversation:share",
  ],
  member: [
    "workspace:create",
    "connector:create",
    "connector:update",
    "conversation:create",
    "conversation:view",
    "conversation:share",
  ],
  viewer: ["conversation:view"],
}

export function hasPermission(role: Role, permission: Permission): boolean {
  return rolePermissions[role]?.includes(permission) || false
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

export function canManageConnectors(role: Role): boolean {
  return hasPermission(role, "connector:create")
}
