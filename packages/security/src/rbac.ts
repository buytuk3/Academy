/**
 * @workspace/security — rbac.ts
 * Platform-wide RBAC (D-03 step 3: Authorization). Detached from any Engine.
 * Future roles (parent, org, district…) extend ROLES without redesign.
 */
export const ROLES = ["admin", "principal", "teacher", "student", "parent"] as const;
export type Role = (typeof ROLES)[number];

export function isRole(v: string | undefined): v is Role {
  return !!v && (ROLES as readonly string[]).includes(v);
}

/** Empty allowed list = any authenticated role (matches legacy authorize()). */
export function hasRole(
  userRole: Role | string | undefined,
  allowed: readonly Role[],
): boolean {
  if (!userRole) return false;
  if (allowed.length === 0) return true;
  return (allowed as readonly string[]).includes(userRole);
}

export interface Requester {
  role?: string;
}

export function canAccess(requester: Requester, ...allowed: Role[]): boolean {
  return hasRole(requester.role as Role | undefined, allowed);
}
