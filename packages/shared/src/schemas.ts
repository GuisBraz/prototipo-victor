import { z } from "zod";
import { memberStatusSchema, roleSchema } from "./roles.js";

/** Versão do schema persistido (ver docs/DATA_MODEL.md, seção Compatibilidade). */
export const SCHEMA_VERSION = 1;

/** Código de projeto: letras, números, hífen, underscore e ponto; 2–40 caracteres. */
export const PROJECT_CODE_REGEX = /^[A-Za-z0-9][A-Za-z0-9._-]{1,39}$/;

const trimmed = (min: number, max: number) =>
  z.string().trim().min(min).max(max);

// ---------- Entradas das callables (validadas no servidor) ----------

export const createOrganizationInputSchema = z.object({
  name: trimmed(2, 120),
});
export type CreateOrganizationInput = z.infer<typeof createOrganizationInputSchema>;

export const createProjectInputSchema = z.object({
  organizationId: trimmed(1, 128),
  code: z.string().trim().regex(PROJECT_CODE_REGEX, "Código inválido"),
  name: trimmed(2, 160),
  description: z.string().trim().max(2000).default(""),
});
export type CreateProjectInput = z.infer<typeof createProjectInputSchema>;

// ---------- Documentos persistidos (forma lida pelo cliente) ----------

export const organizationSchema = z.object({
  name: z.string(),
  status: z.enum(["active", "suspended"]),
  schemaVersion: z.number().int(),
});
export type Organization = z.infer<typeof organizationSchema>;

export const memberSchema = z.object({
  userId: z.string(),
  organizationId: z.string(),
  role: roleSchema,
  status: memberStatusSchema,
  schemaVersion: z.number().int(),
});
export type Member = z.infer<typeof memberSchema>;

export const PROJECT_STATUSES = ["active", "archived"] as const;
export const projectStatusSchema = z.enum(PROJECT_STATUSES);

export const projectSchema = z.object({
  organizationId: z.string(),
  code: z.string(),
  name: z.string(),
  description: z.string(),
  status: projectStatusSchema,
  ownerId: z.string(),
  schemaVersion: z.number().int(),
});
export type Project = z.infer<typeof projectSchema>;

// ---------- Caminhos do Firestore (única fonte de verdade) ----------

export const paths = {
  organization: (orgId: string) => `organizations/${orgId}`,
  members: (orgId: string) => `organizations/${orgId}/members`,
  member: (orgId: string, uid: string) => `organizations/${orgId}/members/${uid}`,
  projects: (orgId: string) => `organizations/${orgId}/projects`,
  project: (orgId: string, projectId: string) =>
    `organizations/${orgId}/projects/${projectId}`,
  /** Documento-índice que garante unicidade de `code` por organização. */
  projectCodeIndex: (orgId: string, code: string) =>
    `organizations/${orgId}/projectCodes/${code.toLowerCase()}`,
  auditEvents: (orgId: string) => `organizations/${orgId}/auditEvents`,
  user: (uid: string) => `users/${uid}`,
  /** Espelho de leitura das organizações do usuário (escrito só pelo servidor). */
  userMemberships: (uid: string) => `users/${uid}/memberships`,
  userMembership: (uid: string, orgId: string) => `users/${uid}/memberships/${orgId}`,

  // Fase 2: documentos, uploads e jobs (subcoleções do projeto)
  documents: (orgId: string, projectId: string) =>
    `organizations/${orgId}/projects/${projectId}/documents`,
  document: (orgId: string, projectId: string, documentId: string) =>
    `organizations/${orgId}/projects/${projectId}/documents/${documentId}`,
  uploads: (orgId: string, projectId: string) =>
    `organizations/${orgId}/projects/${projectId}/uploads`,
  upload: (orgId: string, projectId: string, uploadId: string) =>
    `organizations/${orgId}/projects/${projectId}/uploads/${uploadId}`,
  jobs: (orgId: string, projectId: string) => `organizations/${orgId}/projects/${projectId}/jobs`,
  job: (orgId: string, projectId: string, jobId: string) =>
    `organizations/${orgId}/projects/${projectId}/jobs/${jobId}`,
  /** Resultado da leitura por IA + correções da conferência (id = id do documento). */
  extractions: (orgId: string, projectId: string) =>
    `organizations/${orgId}/projects/${projectId}/extractions`,
  extraction: (orgId: string, projectId: string, documentId: string) =>
    `organizations/${orgId}/projects/${projectId}/extractions/${documentId}`,
  /** Índice de unicidade (projectId, contentHash): uso interno do servidor. */
  documentHash: (orgId: string, projectId: string, hash: string) =>
    `organizations/${orgId}/projects/${projectId}/documentHashes/${hash}`,
} as const;

/** Caminhos no Storage. Sempre gerados pelo servidor; nunca derivados de nome de arquivo. */
export const storagePaths = {
  incoming: (orgId: string, projectId: string, uploadId: string) =>
    `organizations/${orgId}/projects/${projectId}/incoming/${uploadId}`,
  document: (orgId: string, projectId: string, documentId: string) =>
    `organizations/${orgId}/projects/${projectId}/documents/${documentId}.pdf`,
} as const;

/** Espelho de `members/{uid}` em `users/{uid}/memberships/{orgId}`, usado para listar organizações no cliente. */
export const userMembershipSchema = z.object({
  organizationId: z.string(),
  organizationName: z.string(),
  role: roleSchema,
  status: memberStatusSchema,
  schemaVersion: z.number().int(),
});
export type UserMembership = z.infer<typeof userMembershipSchema>;
