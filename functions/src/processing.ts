import Anthropic from "@anthropic-ai/sdk";
import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import { SCHEMA_VERSION, documentSchema, jobStatusSchema, paths } from "@mecabom/shared";
import { ExtractionError, extractDrawing, type CreateMessage, type ExtractionUsage } from "./ai/extractDrawing.js";
import type { PdfRenderer } from "./ai/render.js";
import { PIPELINE_VERSION } from "./config.js";
import type { ObjectStore } from "./objectStore.js";

/**
 * Worker de leitura (Fase 2b): consome um job `queued`, lê o PDF com a IA e grava a extração.
 *
 * - "Reivindica" o job numa transação (queued → running): eventos repetidos não processam
 *   o mesmo documento duas vezes.
 * - Falha de um documento não afeta os outros; o job fica `failed` com um código mostrado
 *   ao usuário, que pode reprocessar.
 * - Reprocessar substitui a extração e descarta as correções anteriores (os índices das
 *   linhas da lista de materiais podem mudar entre leituras).
 */

export interface ProcessingDeps {
  /** null quando a chave da API não está configurada. */
  createMessage: CreateMessage | null;
  openPdf: (bytes: Uint8Array) => Promise<PdfRenderer>;
}

export type ProcessResult = "skipped" | "succeeded" | "failed";

/** Job `running` há mais tempo que isso é considerado perdido (instância encerrada). */
export const STALE_RUNNING_MS = 15 * 60_000;
/** Job `queued` parado há mais tempo que isso recebe um novo disparo. */
export const STALE_QUEUED_MS = 3 * 60_000;

const emptyUsage = (): ExtractionUsage => ({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, calls: 0, regionViews: 0 });

function classify(error: unknown): { code: string; usage: ExtractionUsage } {
  if (error instanceof ExtractionError) return { code: error.code, usage: error.usage };
  if (
    error instanceof Anthropic.RateLimitError ||
    error instanceof Anthropic.InternalServerError ||
    error instanceof Anthropic.APIConnectionError
  ) {
    return { code: "ai_unavailable", usage: emptyUsage() };
  }
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return { code: "ai_not_configured", usage: emptyUsage() };
  }
  return { code: "internal", usage: emptyUsage() };
}

export async function processJobHandler(
  firestore: Firestore,
  store: ObjectStore,
  deps: ProcessingDeps,
  ids: { organizationId: string; projectId: string; jobId: string },
  log: (event: string, data: Record<string, unknown>) => void = () => undefined,
): Promise<ProcessResult> {
  const { organizationId: orgId, projectId, jobId } = ids;
  const jobRef = firestore.doc(paths.job(orgId, projectId, jobId));
  const documentRef = firestore.doc(paths.document(orgId, projectId, jobId));

  // 1. Reivindica o job.
  const claimed = await firestore.runTransaction(async (tx) => {
    const [jobSnap, docSnap] = await Promise.all([tx.get(jobRef), tx.get(documentRef)]);
    if (!jobSnap.exists || !docSnap.exists) return null;
    const status = jobStatusSchema.safeParse(jobSnap.data()?.status);
    if (!status.success || status.data !== "queued") return null;
    const doc = documentSchema.safeParse(docSnap.data());
    if (!doc.success) return null;
    const ts = FieldValue.serverTimestamp();
    tx.update(jobRef, {
      status: "running",
      currentStep: "reading",
      attempts: FieldValue.increment(1),
      pipelineVersion: PIPELINE_VERSION,
      startedAt: ts,
      updatedAt: ts,
    });
    tx.update(documentRef, { status: "processing", updatedAt: ts });
    return doc.data;
  });
  if (!claimed) return "skipped";

  const finish = async (ok: boolean, usage: ExtractionUsage, code: string | null, extra?: Record<string, unknown>) => {
    const ts = FieldValue.serverTimestamp();
    const batch = firestore.batch();
    batch.update(jobRef, {
      status: ok ? "succeeded" : "failed",
      currentStep: ok ? "done" : "failed",
      errorCode: code,
      errorMessage: null,
      usage: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, calls: usage.calls },
      regionViews: usage.regionViews,
      cacheReadTokens: usage.cacheReadTokens,
      finishedAt: ts,
      updatedAt: ts,
    });
    batch.update(documentRef, { status: ok ? "processed" : "failed", updatedAt: ts });
    if (extra) batch.set(firestore.doc(paths.extraction(orgId, projectId, jobId)), extra);
    await batch.commit();
  };

  if (!deps.createMessage) {
    await finish(false, emptyUsage(), "ai_not_configured");
    log("job.failed", { jobId, code: "ai_not_configured" });
    return "failed";
  }

  // 2. Leitura.
  let pdf: PdfRenderer | null = null;
  try {
    const bytes = await store.read(claimed.storagePath);
    try {
      pdf = await deps.openPdf(bytes);
    } catch {
      await finish(false, emptyUsage(), "pdf_render_failed");
      log("job.failed", { jobId, code: "pdf_render_failed" });
      return "failed";
    }
    const run = await extractDrawing({ pdf, createMessage: deps.createMessage });
    const ts = FieldValue.serverTimestamp();
    await finish(true, run.usage, null, {
      organizationId: orgId,
      projectId,
      documentId: jobId,
      fileName: claimed.fileName,
      pageCount: claimed.pageCount,
      output: run.output,
      readMode: run.readMode,
      modelId: run.modelId,
      servedBy: run.servedBy,
      promptVersion: run.promptVersion,
      outputSchemaVersion: run.outputSchemaVersion,
      pipelineVersion: PIPELINE_VERSION,
      usage: run.usage,
      overrides: {},
      createdAt: ts,
      updatedAt: ts,
      schemaVersion: SCHEMA_VERSION,
    });
    log("job.succeeded", { jobId, calls: run.usage.calls, regionViews: run.usage.regionViews, readMode: run.readMode });
    return "succeeded";
  } catch (error) {
    const { code, usage } = classify(error);
    await finish(false, usage, code);
    // Sem conteúdo do documento nem mensagem da API no log (podem conter dados do cliente).
    log("job.failed", { jobId, code, errorType: error instanceof Error ? error.constructor.name : typeof error });
    return "failed";
  } finally {
    await pdf?.close().catch(() => undefined);
  }
}

/**
 * Varredura periódica: redispara jobs `queued` parados (evento perdido ou limite de instâncias)
 * e encerra jobs `running` abandonados (instância encerrada no meio da leitura).
 */
export async function sweepJobsHandler(firestore: Firestore, now: Date = new Date()): Promise<{ kicked: number; timedOut: number }> {
  let kicked = 0;
  let timedOut = 0;
  const queued = await firestore
    .collectionGroup("jobs")
    .where("status", "==", "queued")
    .where("updatedAt", "<", Timestamp.fromMillis(now.getTime() - STALE_QUEUED_MS))
    .limit(50)
    .get();
  for (const d of queued.docs) {
    await d.ref.update({ kickedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    kicked += 1;
  }
  const running = await firestore
    .collectionGroup("jobs")
    .where("status", "==", "running")
    .where("updatedAt", "<", Timestamp.fromMillis(now.getTime() - STALE_RUNNING_MS))
    .limit(50)
    .get();
  for (const d of running.docs) {
    const data = d.data();
    const ts = FieldValue.serverTimestamp();
    const batch = firestore.batch();
    batch.update(d.ref, { status: "failed", currentStep: "failed", errorCode: "timeout", updatedAt: ts, finishedAt: ts });
    batch.update(firestore.doc(paths.document(String(data.organizationId), String(data.projectId), d.id)), {
      status: "failed",
      updatedAt: ts,
    });
    await batch.commit();
    timedOut += 1;
  }
  return { kicked, timedOut };
}

/** O evento de escrita do job deve disparar a leitura? (entrou em `queued` ou foi redisparado) */
export function shouldProcess(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined,
): boolean {
  if (!after || after.status !== "queued") return false;
  if (!before || before.status !== "queued") return true;
  const k = (v: unknown) => (v instanceof Timestamp ? v.toMillis() : v === undefined ? null : String(v));
  return k(before.kickedAt) !== k(after.kickedAt);
}
