import { z } from "zod";

/** Papéis em ordem crescente de privilégio. */
export const ROLES = ["viewer", "reviewer", "approver", "admin"] as const;
export const roleSchema = z.enum(ROLES);
export type Role = z.infer<typeof roleSchema>;

export const MEMBER_STATUSES = ["active", "invited", "disabled"] as const;
export const memberStatusSchema = z.enum(MEMBER_STATUSES);
export type MemberStatus = z.infer<typeof memberStatusSchema>;

/** Retorna true se `role` tem pelo menos o privilégio de `minimum`. */
export function hasAtLeastRole(role: Role, minimum: Role): boolean {
  return ROLES.indexOf(role) >= ROLES.indexOf(minimum);
}
