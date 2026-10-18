import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";
import { REGION } from "./config.js";
import { createOrganizationHandler, createProjectHandler } from "./handlers.js";
import { createGcsObjectStore } from "./objectStore.js";
import {
  finalizeUploadHandler,
  reprocessDocumentHandler,
  requestUploadHandler,
} from "./uploads.js";

initializeApp();

/** Autenticação: exige usuário logado. Autenticar NÃO equivale a autorizar. */
function requireUid(request: CallableRequest<unknown>): string {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Login obrigatório.");
  return uid;
}

/** Cria uma organização e torna o chamador seu administrador. */
export const createOrganization = onCall({ region: REGION }, async (request) => {
  const uid = requireUid(request);
  const requestId = request.rawRequest?.header?.("x-cloud-trace-context") ?? undefined;
  const result = await createOrganizationHandler(getFirestore(), uid, request.data, requestId);
  logger.info("organization.create", { organizationId: result.organizationId });
  return result;
});

/** Cria um projeto (papel `reviewer` ou superior). */
export const createProject = onCall({ region: REGION }, async (request) => {
  const uid = requireUid(request);
  try {
    const result = await createProjectHandler(getFirestore(), uid, request.data);
    logger.info("project.create", { projectId: result.projectId });
    return result;
  } catch (error) {
    if (error instanceof HttpsError && error.code === "permission-denied") {
      logger.warn("project.create denied");
    }
    throw error;
  }
});

/** Abre uma sessão de upload e devolve o caminho que o servidor definiu no Storage. */
export const requestUpload = onCall({ region: REGION }, async (request) => {
  const uid = requireUid(request);
  return requestUploadHandler(getFirestore(), createGcsObjectStore(), uid, request.data);
});

/** Valida o PDF enviado, detecta duplicidade e cria Documento + Job. Timeout e memória maiores. */
export const finalizeUpload = onCall(
  { region: REGION, timeoutSeconds: 120, memory: "1GiB" },
  async (request) => {
    const uid = requireUid(request);
    const result = await finalizeUploadHandler(
      getFirestore(),
      createGcsObjectStore(),
      uid,
      request.data,
    );
    logger.info("document.finalize", { status: result.status });
    return result;
  },
);

/** Recoloca um documento na fila de processamento (sem duplicar registros). */
export const reprocessDocument = onCall({ region: REGION }, async (request) => {
  const uid = requireUid(request);
  return reprocessDocumentHandler(getFirestore(), uid, request.data);
});
