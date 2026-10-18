import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import {
  MAX_DOCUMENTS_PER_PROJECT,
  MAX_PDF_BYTES,
  MAX_PENDING_UPLOADS_PER_USER,
  SCHEMA_VERSION,
  UPLOAD_SESSION_TTL_MINUTES,
  canTransitionJob,
  finalizeUploadInputSchema,
  jobStatusSchema,
  paths,
  reprocessDocumentInputSchema,
  rejectionCodeSchema,
  requestUploadInputSchema,
  sanitizeFileName,
  storagePaths,
  uploadSchema,
  type FinalizeUploadResult,
  type RejectionCode,
} from "@mecabom/shared";
import { requireRole } from "./authz.js";
import { PIPELINE_VERSION } from "./config.js";
import { buildAuditEvent } from "./domain.js";
import type { ObjectStore } from "./objectStore.js";
import { parseInput } from "./parse.js";
import { validatePdf } from "./pdf.js";

/**
 * Upload de PDFs em duas etapas (docs/ARCHITECTURE.md §6):
 *  1. requestUpload  → o servidor cria uma sessão e define o caminho no Storage;
 *  2. o cliente envia o arquivo para esse caminho (storage.rules só permitem
 *     criar exatamente esse objeto, com limite de tamanho e tipo);
 *  3. finalizeUpload → o servidor valida o CONTEÚDO real, calcula o hash,
 *     detecta duplicidade, move o arquivo e cria Document + ProcessingJob.
 */

async function requireProject(firestore: Firestore, orgId: string, projectId: string) {
  const snap = await firestore.doc(paths.project(orgId, projectId)).get();
  if (!snap.exists) throw new HttpsError("not-found", "Projeto não encontrado.");
  if (snap.data()?.status !== "active") {
    throw new HttpsError("failed-precondition", "O projeto está arquivado.");
  }
}

function audit(
  firestore: Firestore,
  organizationId: string,
  projectId: string,
  actorId: string,
  action: string,
  subject: { type: string; id: string },
  after?: Record<string, unknown>,
) {
  return {
    ref: firestore.collection(paths.auditEvents(organizationId)).doc(),
    data: {
      ...buildAuditEvent({ organizationId, projectId, actorId, action, subject, after }),
      at: FieldValue.serverTimestamp(),
    },
  };
}

// ---------------------------------------------------------------------------

export async function requestUploadHandler(
  firestore: Firestore,
  store: ObjectStore,
  uid: string,
  rawData: unknown,
  now: Date = new Date(),
): Promise<{ uploadId: string; storagePath: string; expiresAt: string }> {
  const input = parseInput(() => requestUploadInputSchema.parse(rawData));
  await requireRole(firestore, uid, input.organizationId, "reviewer");
  await requireProject(firestore, input.organizationId, input.projectId);

  const docCount = await firestore
    .collection(paths.documents(input.organizationId, input.projectId))
    .count()
    .get();
  if (docCount.data().count >= MAX_DOCUMENTS_PER_PROJECT) {
    throw new HttpsError("resource-exhausted", "Limite de documentos do projeto atingido.");
  }

  // Sessões pendentes do usuário: as vencidas são encerradas aqui (limpeza oportunista).
  const uploadsPath = paths.uploads(input.organizationId, input.projectId);
  const pending = await firestore
    .collection(uploadsPath)
    .where("createdBy", "==", uid)
    .where("status", "==", "pending")
    .limit(MAX_PENDING_UPLOADS_PER_USER * 2)
    .get();
  let active = 0;
  for (const d of pending.docs) {
    const expiresAt = d.data().expiresAt as Timestamp | undefined;
    if (expiresAt && expiresAt.toMillis() > now.getTime()) {
      active += 1;
      continue;
    }
    await d.ref.update({ status: "rejected", rejectionCode: "session_expired" });
    await store.remove(String(d.data().storagePath)).catch(() => undefined);
  }
  if (active >= MAX_PENDING_UPLOADS_PER_USER) {
    throw new HttpsError("resource-exhausted", "Muitos envios em andamento. Aguarde a conclusão.");
  }

  const ref = firestore.collection(uploadsPath).doc();
  const storagePath = storagePaths.incoming(input.organizationId, input.projectId, ref.id);
  const expiresAt = new Date(now.getTime() + UPLOAD_SESSION_TTL_MINUTES * 60_000);
  await ref.set({
    organizationId: input.organizationId,
    projectId: input.projectId,
    createdBy: uid,
    fileName: sanitizeFileName(input.fileName),
    declaredSizeBytes: input.sizeBytes,
    storagePath,
    status: "pending",
    expiresAt: Timestamp.fromDate(expiresAt),
    createdAt: FieldValue.serverTimestamp(),
    schemaVersion: SCHEMA_VERSION,
  });

  return { uploadId: ref.id, storagePath, expiresAt: expiresAt.toISOString() };
}

/** Resultado já registrado numa sessão encerrada (usado para idempotência). */
function resultFromUpload(data: FirebaseFirestore.DocumentData | undefined): FinalizeUploadResult {
  const documentId = typeof data?.documentId === "string" ? data.documentId : undefined;
  if (data?.status === "accepted" && documentId) return { status: "accepted", documentId };
  if (data?.status === "duplicate" && documentId) return { status: "duplicate", documentId };
  const reason = rejectionCodeSchema.safeParse(data?.rejectionCode);
  return { status: "rejected", reason: reason.success ? reason.data : "malformed_pdf" };
}

// ---------------------------------------------------------------------------

export async function finalizeUploadHandler(
  firestore: Firestore,
  store: ObjectStore,
  uid: string,
  rawData: unknown,
  now: Date = new Date(),
): Promise<FinalizeUploadResult> {
  const input = parseInput(() => finalizeUploadInputSchema.parse(rawData));
  const { organizationId: orgId, projectId, uploadId } = input;
  await requireRole(firestore, uid, orgId, "reviewer");

  const uploadRef = firestore.doc(paths.upload(orgId, projectId, uploadId));
  const uploadSnap = await uploadRef.get();
  const parsed = uploadSnap.exists ? uploadSchema.safeParse(uploadSnap.data()) : null;
  // Sessão inexistente ou de outro usuário: mesma resposta.
  if (!parsed?.success || parsed.data.createdBy !== uid) {
    throw new HttpsError("not-found", "Envio não encontrado.");
  }
  const upload = parsed.data;

  // Idempotência: finalizar de novo devolve o resultado já registrado.
  if (upload.status !== "pending") return resultFromUpload(uploadSnap.data());

  const reject = async (reason: RejectionCode): Promise<FinalizeUploadResult> => {
    const event = audit(firestore, orgId, projectId, uid, "document.upload_rejected",
      { type: "upload", id: uploadId }, { reason });
    const batch = firestore.batch();
    batch.update(uploadRef, { status: "rejected", rejectionCode: reason });
    batch.set(event.ref, event.data);
    await batch.commit();
    await store.remove(upload.storagePath).catch(() => undefined);
    return { status: "rejected", reason };
  };

  const expiresAt = uploadSnap.data()?.expiresAt as Timestamp | undefined;
  if (!expiresAt || expiresAt.toMillis() <= now.getTime()) return reject("session_expired");

  const size = await store.size(upload.storagePath);
  // Nada foi enviado ainda: não encerra a sessão (o cliente pode tentar de novo).
  if (size === null) return { status: "rejected", reason: "file_missing" };
  if (size > MAX_PDF_BYTES) return reject("too_large");

  let bytes: Buffer;
  try {
    bytes = await store.read(upload.storagePath);
  } catch (error) {
    // Pode ser uma finalização simultânea da mesma sessão que já moveu o arquivo.
    const latest = await uploadRef.get();
    if (latest.data()?.status !== "pending") return resultFromUpload(latest.data());
    throw error;
  }
  const validation = await validatePdf(bytes);
  if (!validation.ok) return reject(validation.code);

  // Deduplicação: (projeto, hash do conteúdo).
  const hashRef = firestore.doc(paths.documentHash(orgId, projectId, validation.sha256));
  const already = await hashRef.get();
  const finishDuplicate = async (existingId: string): Promise<FinalizeUploadResult> => {
    const event = audit(firestore, orgId, projectId, uid, "document.duplicate_detected",
      { type: "document", id: existingId }, { uploadId });
    const batch = firestore.batch();
    batch.update(uploadRef, { status: "duplicate", documentId: existingId });
    batch.set(event.ref, event.data);
    await batch.commit();
    await store.remove(upload.storagePath).catch(() => undefined);
    return { status: "duplicate", documentId: existingId };
  };
  if (already.exists) return finishDuplicate(String(already.data()?.documentId));

  const documentRef = firestore.collection(paths.documents(orgId, projectId)).doc();
  const finalPath = storagePaths.document(orgId, projectId, documentRef.id);
  await store.copy(upload.storagePath, finalPath);

  let duplicateOf: string | null = null;
  let settled: FinalizeUploadResult | null = null;
  try {
    await firestore.runTransaction(async (tx) => {
      duplicateOf = null;
      settled = null;
      const [hashSnap, currentUpload] = await Promise.all([tx.get(hashRef), tx.get(uploadRef)]);
      // Finalização simultânea da MESMA sessão (duplo clique): vale a primeira.
      if (currentUpload.data()?.status !== "pending") {
        settled = resultFromUpload(currentUpload.data());
        return;
      }
      if (hashSnap.exists) {
        duplicateOf = String(hashSnap.data()?.documentId);
        return;
      }
      const ts = FieldValue.serverTimestamp();
      tx.set(documentRef, {
        organizationId: orgId,
        projectId,
        fileName: upload.fileName,
        storagePath: finalPath,
        contentHash: validation.sha256,
        mimeType: "application/pdf",
        sizeBytes: validation.sizeBytes,
        pageCount: validation.pageCount,
        status: "queued",
        createdBy: uid,
        createdAt: ts,
        updatedAt: ts,
        schemaVersion: SCHEMA_VERSION,
      });
      // Job com id determinístico = id do documento: reprocessar reaproveita o mesmo registro.
      tx.set(firestore.doc(paths.job(orgId, projectId, documentRef.id)), {
        organizationId: orgId,
        projectId,
        documentId: documentRef.id,
        status: "queued",
        currentStep: "queued",
        attempts: 0,
        runCount: 1,
        pipelineVersion: PIPELINE_VERSION,
        errorCode: null,
        errorMessage: null,
        usage: { inputTokens: 0, outputTokens: 0, calls: 0 },
        createdAt: ts,
        updatedAt: ts,
        schemaVersion: SCHEMA_VERSION,
      });
      tx.set(hashRef, { documentId: documentRef.id, createdAt: ts });
      tx.update(uploadRef, { status: "accepted", documentId: documentRef.id });
      const event = audit(firestore, orgId, projectId, uid, "document.upload",
        { type: "document", id: documentRef.id },
        { fileName: upload.fileName, pageCount: validation.pageCount, sizeBytes: validation.sizeBytes });
      tx.set(event.ref, event.data);
    });
  } catch (error) {
    await store.remove(finalPath).catch(() => undefined);
    throw error;
  }

  if (settled) {
    await store.remove(finalPath).catch(() => undefined);
    return settled;
  }

  if (duplicateOf) {
    // Corrida: outro envio idêntico foi aceito entre a checagem e a transação.
    await store.remove(finalPath).catch(() => undefined);
    return finishDuplicate(duplicateOf);
  }

  await store.remove(upload.storagePath).catch(() => undefined);
  return { status: "accepted", documentId: documentRef.id };
}

// ---------------------------------------------------------------------------

/** Recoloca um documento na fila sem criar registros novos (mesmo documento, mesmo job). */
export async function reprocessDocumentHandler(
  firestore: Firestore,
  uid: string,
  rawData: unknown,
): Promise<{ documentId: string }> {
  const input = parseInput(() => reprocessDocumentInputSchema.parse(rawData));
  const { organizationId: orgId, projectId, documentId } = input;
  await requireRole(firestore, uid, orgId, "reviewer");

  const documentRef = firestore.doc(paths.document(orgId, projectId, documentId));
  const jobRef = firestore.doc(paths.job(orgId, projectId, documentId));

  await firestore.runTransaction(async (tx) => {
    const [docSnap, jobSnap] = await Promise.all([tx.get(documentRef), tx.get(jobRef)]);
    if (!docSnap.exists || !jobSnap.exists) throw new HttpsError("not-found", "Documento não encontrado.");
    const status = jobStatusSchema.parse(jobSnap.data()?.status);
    if (!canTransitionJob(status, "queued") || status === "running") {
      throw new HttpsError("failed-precondition", "O documento já está em processamento.");
    }
    const ts = FieldValue.serverTimestamp();
    tx.update(jobRef, {
      status: "queued",
      currentStep: "queued",
      attempts: 0,
      runCount: FieldValue.increment(1),
      errorCode: null,
      errorMessage: null,
      updatedAt: ts,
    });
    tx.update(documentRef, { status: "queued", updatedAt: ts });
    const event = audit(firestore, orgId, projectId, uid, "document.reprocess",
      { type: "document", id: documentId }, { previousJobStatus: status });
    tx.set(event.ref, event.data);
  });

  return { documentId };
}
