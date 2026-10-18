import { SCHEMA_VERSION, hasAtLeastRole, type Role } from "@mecabom/shared";

/**
 * Lógica de domínio pura (sem Firebase): construção dos documentos e regras de
 * autorização. Testável sem emulador.
 */

export interface OrganizationBootstrap {
  organization: { name: string; status: "active"; createdBy: string; schemaVersion: number };
  member: {
    userId: string;
    organizationId: string;
    role: "admin";
    status: "active";
    schemaVersion: number;
  };
  userMembership: {
    organizationId: string;
    organizationName: string;
    role: "admin";
    status: "active";
    schemaVersion: number;
  };
}

/** Documentos criados quando um usuário cria uma organização (ele vira administrador). */
export function buildOrganizationBootstrap(
  uid: string,
  organizationId: string,
  name: string,
): OrganizationBootstrap {
  return {
    organization: { name, status: "active", createdBy: uid, schemaVersion: SCHEMA_VERSION },
    member: {
      userId: uid,
      organizationId,
      role: "admin",
      status: "active",
      schemaVersion: SCHEMA_VERSION,
    },
    userMembership: {
      organizationId,
      organizationName: name,
      role: "admin",
      status: "active",
      schemaVersion: SCHEMA_VERSION,
    },
  };
}

export interface ProjectInput {
  organizationId: string;
  code: string;
  name: string;
  description: string;
}

export function buildProject(input: ProjectInput, ownerId: string) {
  return {
    organizationId: input.organizationId,
    code: input.code,
    name: input.name,
    description: input.description,
    status: "active" as const,
    ownerId,
    schemaVersion: SCHEMA_VERSION,
  };
}

export interface MemberLike {
  role: Role;
  status: string;
}

export type AuthorizationResult =
  | { ok: true; role: Role }
  | { ok: false; reason: "not_a_member" | "inactive_member" | "insufficient_role" };

/** Decide se um membro pode executar uma operação que exige `minimum`. */
export function authorize(member: MemberLike | null, minimum: Role): AuthorizationResult {
  if (!member) return { ok: false, reason: "not_a_member" };
  if (member.status !== "active") return { ok: false, reason: "inactive_member" };
  if (!hasAtLeastRole(member.role, minimum)) return { ok: false, reason: "insufficient_role" };
  return { ok: true, role: member.role };
}

export interface AuditEventInput {
  organizationId: string;
  projectId?: string;
  actorId: string;
  action: string;
  subject: { type: string; id: string };
  after?: Record<string, unknown>;
  requestId?: string;
}

/** Evento de auditoria. Não inclui segredos nem conteúdo desnecessário. */
export function buildAuditEvent(input: AuditEventInput) {
  return {
    organizationId: input.organizationId,
    ...(input.projectId ? { projectId: input.projectId } : {}),
    actorId: input.actorId,
    action: input.action,
    subject: input.subject,
    ...(input.after ? { after: input.after } : {}),
    ...(input.requestId ? { requestId: input.requestId } : {}),
    schemaVersion: SCHEMA_VERSION,
  };
}
