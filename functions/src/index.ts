import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { defineSecret } from "firebase-functions/params";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { anthropicCreateMessage } from "./ai/extractDrawing.js";
import { openPdf } from "./ai/render.js";
import { MAX_CONCURRENT_READINGS, REGION } from "./config.js";
import { createOrganizationHandler, createProjectHandler } from "./handlers.js";
import { createGcsObjectStore } from "./objectStore.js";
import { processJobHandler, shouldProcess, sweepJobsHandler } from "./processing.js";
import { saveReviewHandler } from "./reviews.js";
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

/** Chave da API da Anthropic: Secret Manager em produção; functions/.secret.local no emulador. */
const anthropicApiKey = defineSecret("ANTHROPIC_API_KEY");

/**
 * Leitura por IA: dispara quando um job entra em `queued` (upload, reprocessamento ou
 * redisparo da varredura). Limite de instâncias = limite de leituras simultâneas na API.
 */
export const processDocumentJob = onDocumentWritten(
  {
    document: "organizations/{orgId}/projects/{projectId}/jobs/{jobId}",
    region: REGION,
    timeoutSeconds: 540,
    memory: "2GiB",
    maxInstances: MAX_CONCURRENT_READINGS,
    concurrency: 1,
    secrets: [anthropicApiKey],
  },
  async (event) => {
    if (!shouldProcess(event.data?.before?.data(), event.data?.after?.data())) return;
    const { orgId, projectId, jobId } = event.params;
    const key = anthropicApiKey.value();
    await processJobHandler(
      getFirestore(),
      createGcsObjectStore(),
      { createMessage: key ? anthropicCreateMessage(key) : null, openPdf },
      { organizationId: orgId, projectId, jobId },
      (name, data) => logger.info(name, data),
    );
  },
);

/** Redispara jobs parados na fila e encerra leituras abandonadas. */
export const sweepJobs = onSchedule({ schedule: "every 5 minutes", region: REGION }, async () => {
  const result = await sweepJobsHandler(getFirestore());
  if (result.kicked || result.timedOut) logger.info("jobs.sweep", result);
});

/** Conferência: corrige ou confirma um campo lido pela IA (papel `reviewer` ou superior). */
export const saveReview = onCall({ region: REGION }, async (request) => {
  const uid = requireUid(request);
  return saveReviewHandler(getFirestore(), uid, request.data);
});
