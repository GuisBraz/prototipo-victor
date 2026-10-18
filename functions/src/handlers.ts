import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import {
  createOrganizationInputSchema,
  createProjectInputSchema,
  paths,
} from "@mecabom/shared";
import { MAX_ORGANIZATIONS_PER_USER, MAX_PROJECTS_PER_ORGANIZATION } from "./config.js";
import { requireRole } from "./authz.js";
import { parseInput } from "./parse.js";
import {
  buildAuditEvent,
  buildOrganizationBootstrap,
  buildProject,
} from "./domain.js";

/**
 * Regras de negócio das operações, independentes do runtime das functions.
 * Recebem o Firestore e o uid já autenticado, o que permite testá-las contra o
 * emulador sem subir o Functions emulator.
 */

/** Cria uma organização e torna `uid` seu administrador (transação única). */
export async function createOrganizationHandler(
  firestore: Firestore,
  uid: string,
  rawData: unknown,
  requestId?: string,
): Promise<{ organizationId: string }> {
  const input = parseInput(() => createOrganizationInputSchema.parse(rawData));
  const orgRef = firestore.collection("organizations").doc();
  const bootstrap = buildOrganizationBootstrap(uid, orgRef.id, input.name);

  await firestore.runTransaction(async (tx) => {
    const existing = await tx.get(
      firestore.collection(paths.userMemberships(uid)).limit(MAX_ORGANIZATIONS_PER_USER),
    );
    if (existing.size >= MAX_ORGANIZATIONS_PER_USER) {
      throw new HttpsError("resource-exhausted", "Limite de organizações por usuário atingido.");
    }

    const now = FieldValue.serverTimestamp();
    tx.set(orgRef, { ...bootstrap.organization, createdAt: now, updatedAt: now });
    tx.set(firestore.doc(paths.member(orgRef.id, uid)), { ...bootstrap.member, createdAt: now });
    tx.set(firestore.doc(paths.userMembership(uid, orgRef.id)), {
      ...bootstrap.userMembership,
      createdAt: now,
    });
    tx.set(firestore.collection(paths.auditEvents(orgRef.id)).doc(), {
      ...buildAuditEvent({
        organizationId: orgRef.id,
        actorId: uid,
        action: "organization.create",
        subject: { type: "organization", id: orgRef.id },
        after: { name: input.name },
        requestId,
      }),
      at: now,
    });
  });

  return { organizationId: orgRef.id };
}

/**
 * Cria um projeto. Exige membro ativo com papel `reviewer` ou superior.
 * A unicidade do código por organização é garantida por documento-índice.
 */
export async function createProjectHandler(
  firestore: Firestore,
  uid: string,
  rawData: unknown,
): Promise<{ projectId: string }> {
  const input = parseInput(() => createProjectInputSchema.parse(rawData));

  await requireRole(firestore, uid, input.organizationId, "reviewer");

  const projectsPath = paths.projects(input.organizationId);
  const count = await firestore.collection(projectsPath).count().get();
  if (count.data().count >= MAX_PROJECTS_PER_ORGANIZATION) {
    throw new HttpsError("resource-exhausted", "Limite de projetos da organização atingido.");
  }

  const projectRef = firestore.collection(projectsPath).doc();
  const codeRef = firestore.doc(paths.projectCodeIndex(input.organizationId, input.code));

  await firestore.runTransaction(async (tx) => {
    if ((await tx.get(codeRef)).exists) {
      throw new HttpsError("already-exists", "Já existe um projeto com este código.");
    }
    const now = FieldValue.serverTimestamp();
    tx.set(projectRef, { ...buildProject(input, uid), createdAt: now, updatedAt: now });
    tx.set(codeRef, { projectId: projectRef.id, createdAt: now });
    tx.set(firestore.collection(paths.auditEvents(input.organizationId)).doc(), {
      ...buildAuditEvent({
        organizationId: input.organizationId,
        actorId: uid,
        action: "project.create",
        subject: { type: "project", id: projectRef.id },
        after: { code: input.code, name: input.name },
      }),
      at: now,
    });
  });

  return { projectId: projectRef.id };
}
