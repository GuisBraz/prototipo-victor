/**
 * Worker de leitura e conferência contra o emulador do Firestore, com IA e PDF falsos.
 * Rodam com: npm run test:functions (na raiz). Sem FIRESTORE_EMULATOR_HOST, são ignorados.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { getApps, initializeApp } from "firebase-admin/app";
import { Timestamp, getFirestore, type Firestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { PDFDocument } from "pdf-lib";
import { TITLE_BLOCK_FIELDS, paths, type ExtractionOutput } from "@mecabom/shared";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { CreateMessage } from "./ai/extractDrawing.js";
import type { PdfRenderer } from "./ai/render.js";
import { createOrganizationHandler, createProjectHandler } from "./handlers.js";
import type { ObjectStore } from "./objectStore.js";
import { processJobHandler, sweepJobsHandler } from "./processing.js";
import { saveReviewHandler } from "./reviews.js";
import { finalizeUploadHandler, reprocessDocumentHandler, requestUploadHandler } from "./uploads.js";

const emulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const suite = emulator ? describe : describe.skip;

function memoryStore(): ObjectStore & { objects: Map<string, Buffer> } {
  const objects = new Map<string, Buffer>();
  return {
    objects,
    size: async (p) => objects.get(p)?.length ?? null,
    read: async (p) => {
      const b = objects.get(p);
      if (!b) throw new Error("not found");
      return b;
    },
    copy: async (from, to) => void objects.set(to, Buffer.from(objects.get(from)!)),
    remove: async (p) => void objects.delete(p),
  };
}

const fakePdf = async (): Promise<PdfRenderer> => {
  const img = { mediaType: "image/jpeg" as const, data: Buffer.from([0xff, 0xd8]), width: 10, height: 10 };
  return {
    pageCount: 1,
    pageSize: async () => ({ width: 100, height: 100 }),
    overview: async () => img,
    region: async () => img,
    nativeText: async () => [],
    close: async () => undefined,
  };
};

const nf = { status: "not_found", rawValue: null, page: null, snippet: null, isExplicit: false, note: null } as const;
const output: ExtractionOutput = {
  titleBlock: {
    ...(Object.fromEntries(TITLE_BLOCK_FIELDS.map((f) => [f, nf])) as ExtractionOutput["titleBlock"]),
    drawingNumber: { status: "found", rawValue: "CJ-001", page: 1, snippet: "CJ-001", isExplicit: true, note: null },
  },
  documentType: { classification: "assembly", basis: nf },
  weightScope: "unknown",
  componentTable: {
    status: "found",
    note: null,
    rows: [
      {
        itemPosition: "1",
        componentNumber: "DT-1",
        revision: null,
        description: "EIXO",
        quantity: "2",
        unit: null,
        material: null,
        weight: null,
        page: 1,
        snippet: null,
        isExplicit: true,
        uncertainColumns: ["quantity"],
        note: "borrado",
      },
    ],
  },
  noteReferences: [],
  issues: [],
};

const ai = (reply: "ok" | "refusal"): CreateMessage => async () =>
  ({
    id: "m",
    type: "message",
    role: "assistant",
    model: "claude-opus-5-5",
    stop_reason: reply === "ok" ? "end_turn" : "refusal",
    stop_sequence: null,
    content: reply === "ok" ? [{ type: "text", text: JSON.stringify(output), citations: null }] : [],
    usage: { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
  }) as unknown as Anthropic.Beta.Messages.BetaMessage;

suite("worker de leitura e conferência (emulador do Firestore)", () => {
  let db: Firestore;
  let store: ReturnType<typeof memoryStore>;
  let orgId: string;
  let projectId: string;
  let documentId: string;

  beforeAll(() => {
    if (getApps().length === 0) initializeApp({ projectId: "demo-mecabom" });
    db = getFirestore();
  });

  beforeEach(async () => {
    const res = await fetch(
      `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-mecabom/databases/(default)/documents`,
      { method: "DELETE" },
    );
    expect(res.ok).toBe(true);
    store = memoryStore();
    ({ organizationId: orgId } = await createOrganizationHandler(db, "alice", { name: "ACME" }));
    ({ projectId } = await createProjectHandler(db, "alice", { organizationId: orgId, code: "PR-1", name: "Projeto", description: "" }));
    const pdfDoc = await PDFDocument.create();
    pdfDoc.addPage([200, 200]);
    const bytes = Buffer.from(await pdfDoc.save());
    const session = await requestUploadHandler(db, store, "alice", { organizationId: orgId, projectId, fileName: "cj.pdf", sizeBytes: bytes.length });
    store.objects.set(session.storagePath, bytes);
    const result = await finalizeUploadHandler(db, store, "alice", { organizationId: orgId, projectId, uploadId: session.uploadId });
    if (result.status !== "accepted") throw new Error("upload não aceito");
    documentId = result.documentId;
  });

  const ids = () => ({ organizationId: orgId, projectId, jobId: documentId });

  it("lê o documento, grava a extração e marca o job como concluído", async () => {
    expect(await processJobHandler(db, store, { createMessage: ai("ok"), openPdf: fakePdf }, ids())).toBe("succeeded");
    const job = (await db.doc(paths.job(orgId, projectId, documentId)).get()).data()!;
    expect(job).toMatchObject({ status: "succeeded", errorCode: null, usage: { calls: 1, inputTokens: 1000, outputTokens: 200 } });
    const doc = (await db.doc(paths.document(orgId, projectId, documentId)).get()).data()!;
    expect(doc.status).toBe("processed");
    const ex = (await db.doc(paths.extraction(orgId, projectId, documentId)).get()).data()!;
    expect(ex.output.titleBlock.drawingNumber.rawValue).toBe("CJ-001");
    expect(ex).toMatchObject({ readMode: "scanned", modelId: "claude-opus-5-5", promptVersion: "drawing-extraction.v2", overrides: {} });
  });

  it("evento repetido não processa duas vezes", async () => {
    const deps = { createMessage: ai("ok"), openPdf: fakePdf };
    const [a, b] = await Promise.all([processJobHandler(db, store, deps, ids()), processJobHandler(db, store, deps, ids())]);
    expect([a, b].sort()).toEqual(["skipped", "succeeded"]);
  });

  it("sem chave da API: falha com código claro, sem chamar a IA", async () => {
    expect(await processJobHandler(db, store, { createMessage: null, openPdf: fakePdf }, ids())).toBe("failed");
    const job = (await db.doc(paths.job(orgId, projectId, documentId)).get()).data()!;
    expect(job.errorCode).toBe("ai_not_configured");
  });

  it("recusa da IA: job falha e pode ser reprocessado", async () => {
    await processJobHandler(db, store, { createMessage: ai("refusal"), openPdf: fakePdf }, ids());
    expect((await db.doc(paths.job(orgId, projectId, documentId)).get()).data()!.errorCode).toBe("ai_refusal");
    await reprocessDocumentHandler(db, "alice", { organizationId: orgId, projectId, documentId });
    expect(await processJobHandler(db, store, { createMessage: ai("ok"), openPdf: fakePdf }, ids())).toBe("succeeded");
  });

  it("conferência grava correção com autor, desfaz e audita", async () => {
    await processJobHandler(db, store, { createMessage: ai("ok"), openPdf: fakePdf }, ids());
    const base = { organizationId: orgId, projectId, documentId };
    await saveReviewHandler(db, "alice", { ...base, field: "rows.0.quantity", value: "3" });
    let ex = (await db.doc(paths.extraction(orgId, projectId, documentId)).get()).data()!;
    expect(ex.overrides["rows.0.quantity"]).toMatchObject({ value: "3", by: "alice" });
    expect(ex.output.componentTable.rows[0].quantity).toBe("2"); // leitura original preservada

    await saveReviewHandler(db, "alice", { ...base, field: "rows.0.quantity", value: null, clear: true });
    ex = (await db.doc(paths.extraction(orgId, projectId, documentId)).get()).data()!;
    expect(ex.overrides["rows.0.quantity"]).toBeUndefined();

    const audit = await db.collection(paths.auditEvents(orgId)).where("action", "in", ["review.save", "review.clear"]).get();
    expect(audit.size).toBe(2);

    await expect(saveReviewHandler(db, "alice", { ...base, field: "rows.9.quantity", value: "1" })).rejects.toSatisfy(
      (e: unknown) => e instanceof HttpsError && e.code === "invalid-argument",
    );
    await expect(saveReviewHandler(db, "mallory", { ...base, field: "title", value: "X" })).rejects.toSatisfy(
      (e: unknown) => e instanceof HttpsError && e.code === "permission-denied",
    );
  });

  it("varredura redispara job parado na fila e encerra leitura abandonada", async () => {
    const jobRef = db.doc(paths.job(orgId, projectId, documentId));
    await jobRef.update({ updatedAt: Timestamp.fromMillis(Date.now() - 10 * 60_000) });
    expect((await sweepJobsHandler(db)).kicked).toBe(1);
    expect((await jobRef.get()).data()!.kickedAt).toBeTruthy();

    await jobRef.update({ status: "running", updatedAt: Timestamp.fromMillis(Date.now() - 60 * 60_000) });
    expect((await sweepJobsHandler(db)).timedOut).toBe(1);
    expect((await jobRef.get()).data()!).toMatchObject({ status: "failed", errorCode: "timeout" });
  });
});
