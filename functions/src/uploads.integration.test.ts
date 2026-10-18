/**
 * Testes de integração do fluxo de upload contra o emulador do Firestore, com
 * armazenamento de objetos em memória (o Storage real é coberto pelos testes
 * de Rules e pelo teste manual com os emuladores).
 * Rodam com: npm run test:functions (na raiz). Sem FIRESTORE_EMULATOR_HOST, são ignorados.
 */
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { PDFDocument } from "pdf-lib";
import {
  MAX_PENDING_UPLOADS_PER_USER,
  UPLOAD_SESSION_TTL_MINUTES,
  paths,
  storagePaths,
} from "@mecabom/shared";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createOrganizationHandler, createProjectHandler } from "./handlers.js";
import type { ObjectStore } from "./objectStore.js";
import { finalizeUploadHandler, reprocessDocumentHandler, requestUploadHandler } from "./uploads.js";

const emulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const suite = emulator ? describe : describe.skip;

function memoryStore() {
  const objects = new Map<string, Buffer>();
  const store: ObjectStore = {
    size: async (p) => objects.get(p)?.length ?? null,
    read: async (p) => {
      const b = objects.get(p);
      if (!b) throw new Error("not found");
      return b;
    },
    copy: async (from, to) => {
      const b = objects.get(from);
      if (!b) throw new Error("not found");
      objects.set(to, Buffer.from(b));
    },
    remove: async (p) => void objects.delete(p),
  };
  return { objects, store };
}

async function makePdf(pages = 1, seed = 0): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.setTitle(`doc-${seed}`); // conteúdo distinto ⇒ hash distinto
  for (let i = 0; i < pages; i += 1) doc.addPage([200, 200]);
  return Buffer.from(await doc.save());
}

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toSatisfy(
    (e: unknown) => e instanceof HttpsError && e.code === code,
  );
}

suite("upload de documentos (emulador do Firestore)", () => {
  let db: Firestore;
  let mem: ReturnType<typeof memoryStore>;
  let orgId: string;
  let projectId: string;

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
    mem = memoryStore();
    ({ organizationId: orgId } = await createOrganizationHandler(db, "alice", { name: "ACME" }));
    ({ projectId } = await createProjectHandler(db, "alice", {
      organizationId: orgId,
      code: "PR-1",
      name: "Projeto",
      description: "",
    }));
    const setMember = (uid: string, role: string, status = "active") =>
      db.doc(paths.member(orgId, uid)).set({ userId: uid, organizationId: orgId, role, status });
    await setMember("rita", "reviewer");
    await setMember("vera", "viewer");
    await setMember("dora", "reviewer", "disabled");
    // outra organização, para testes de isolamento
    await createOrganizationHandler(db, "carol", { name: "Outra" });
  });

  /** Fluxo completo de um envio: abre sessão, "envia" os bytes e finaliza. */
  async function send(uid: string, bytes: Buffer, fileName = "desenho.pdf") {
    const session = await requestUploadHandler(db, mem.store, uid, {
      organizationId: orgId,
      projectId,
      fileName,
      sizeBytes: Math.max(bytes.length, 1),
    });
    mem.objects.set(session.storagePath, bytes);
    const result = await finalizeUploadHandler(db, mem.store, uid, {
      organizationId: orgId,
      projectId,
      uploadId: session.uploadId,
    });
    return { session, result };
  }

  const count = async (path: string) => (await db.collection(path).count().get()).data().count;

  describe("requestUpload", () => {
    it("cria sessão pendente com caminho definido pelo servidor e nome sanitizado", async () => {
      const s = await requestUploadHandler(db, mem.store, "rita", {
        organizationId: orgId,
        projectId,
        fileName: "..\\..\\evil/../nome.pdf",
        sizeBytes: 1234,
      });
      expect(s.storagePath).toBe(storagePaths.incoming(orgId, projectId, s.uploadId));
      expect(s.storagePath).not.toContain("evil");
      const data = (await db.doc(paths.upload(orgId, projectId, s.uploadId)).get()).data();
      expect(data).toMatchObject({
        createdBy: "rita",
        status: "pending",
        fileName: "nome.pdf",
        declaredSizeBytes: 1234,
      });
    });

    it("viewer, desativado, não membro e outra organização são negados", async () => {
      const input = { organizationId: orgId, projectId, fileName: "a.pdf", sizeBytes: 10 };
      for (const uid of ["vera", "dora", "zoe", "carol"]) {
        await expectCode(requestUploadHandler(db, mem.store, uid, input), "permission-denied");
      }
    });

    it("projeto inexistente ou arquivado é recusado", async () => {
      await expectCode(
        requestUploadHandler(db, mem.store, "rita", {
          organizationId: orgId, projectId: "naoexiste", fileName: "a.pdf", sizeBytes: 10,
        }),
        "not-found",
      );
      await db.doc(paths.project(orgId, projectId)).update({ status: "archived" });
      await expectCode(
        requestUploadHandler(db, mem.store, "rita", {
          organizationId: orgId, projectId, fileName: "a.pdf", sizeBytes: 10,
        }),
        "failed-precondition",
      );
    });

    it("rejeita tamanho inválido (acima do máximo)", async () => {
      await expectCode(
        requestUploadHandler(db, mem.store, "rita", {
          organizationId: orgId, projectId, fileName: "a.pdf", sizeBytes: 10 ** 10,
        }),
        "invalid-argument",
      );
    });

    it("limita sessões pendentes simultâneas e encerra as vencidas", async () => {
      const input = { organizationId: orgId, projectId, fileName: "a.pdf", sizeBytes: 10 };
      const t0 = new Date("2026-01-01T10:00:00Z");
      for (let i = 0; i < MAX_PENDING_UPLOADS_PER_USER; i += 1) {
        await requestUploadHandler(db, mem.store, "rita", input, t0);
      }
      await expectCode(requestUploadHandler(db, mem.store, "rita", input, t0), "resource-exhausted");
      // Depois do vencimento, as antigas são encerradas e o usuário pode enviar de novo.
      const later = new Date(t0.getTime() + (UPLOAD_SESSION_TTL_MINUTES + 1) * 60_000);
      await expect(requestUploadHandler(db, mem.store, "rita", input, later)).resolves.toBeDefined();
      const expired = await db
        .collection(paths.uploads(orgId, projectId))
        .where("rejectionCode", "==", "session_expired")
        .count()
        .get();
      expect(expired.data().count).toBe(MAX_PENDING_UPLOADS_PER_USER);
    });
  });

  describe("finalizeUpload", () => {
    it("aceita PDF válido: cria Document, Job na fila, índice de hash e auditoria; move o arquivo", async () => {
      const bytes = await makePdf(2);
      const { session, result } = await send("rita", bytes);
      expect(result.status).toBe("accepted");
      if (result.status !== "accepted") return;

      const doc = (await db.doc(paths.document(orgId, projectId, result.documentId)).get()).data();
      expect(doc).toMatchObject({
        fileName: "desenho.pdf",
        status: "queued",
        pageCount: 2,
        sizeBytes: bytes.length,
        mimeType: "application/pdf",
        createdBy: "rita",
        storagePath: storagePaths.document(orgId, projectId, result.documentId),
      });
      expect(doc?.contentHash).toMatch(/^[0-9a-f]{64}$/);

      const job = (await db.doc(paths.job(orgId, projectId, result.documentId)).get()).data();
      expect(job).toMatchObject({
        status: "queued", attempts: 0, runCount: 1, errorCode: null,
        usage: { inputTokens: 0, outputTokens: 0, calls: 0 },
      });

      expect((await db.doc(paths.documentHash(orgId, projectId, String(doc?.contentHash))).get()).exists).toBe(true);
      expect(mem.objects.has(storagePaths.document(orgId, projectId, result.documentId))).toBe(true);
      expect(mem.objects.has(session.storagePath)).toBe(false);

      const audit = await db.collection(paths.auditEvents(orgId)).where("action", "==", "document.upload").get();
      expect(audit.size).toBe(1);
      expect(audit.docs[0]?.data()).toMatchObject({ actorId: "rita", projectId });
    });

    it("cenário 8: mesmo conteúdo enviado de novo é detectado como duplicado e não cria registros", async () => {
      const bytes = await makePdf(1, 1);
      const first = await send("rita", bytes, "original.pdf");
      const second = await send("alice", Buffer.from(bytes), "copia-renomeada.pdf");
      expect(first.result.status).toBe("accepted");
      expect(second.result.status).toBe("duplicate");
      if (first.result.status === "accepted" && second.result.status === "duplicate") {
        expect(second.result.documentId).toBe(first.result.documentId);
      }
      expect(await count(paths.documents(orgId, projectId))).toBe(1);
      expect(await count(paths.jobs(orgId, projectId))).toBe(1);
      // Só o arquivo do documento original permanece no armazenamento.
      expect([...mem.objects.keys()]).toHaveLength(1);
      const dup = await db.collection(paths.auditEvents(orgId)).where("action", "==", "document.duplicate_detected").get();
      expect(dup.size).toBe(1);
    });

    it("duas finalizações simultâneas do mesmo conteúdo geram um único documento", async () => {
      const bytes = await makePdf(1, 2);
      const [a, b] = await Promise.all([send("rita", bytes), send("alice", Buffer.from(bytes))]);
      const statuses = [a.result.status, b.result.status].sort();
      expect(statuses).toEqual(["accepted", "duplicate"]);
      expect(await count(paths.documents(orgId, projectId))).toBe(1);
      expect(await count(paths.jobs(orgId, projectId))).toBe(1);
      expect([...mem.objects.keys()]).toHaveLength(1);
    });

    it("duplo clique: duas finalizações simultâneas da mesma sessão geram um documento e o mesmo resultado", async () => {
      const session = await requestUploadHandler(db, mem.store, "rita", {
        organizationId: orgId, projectId, fileName: "a.pdf", sizeBytes: 100,
      });
      mem.objects.set(session.storagePath, await makePdf(1, 10));
      const input = { organizationId: orgId, projectId, uploadId: session.uploadId };
      const [a, b] = await Promise.all([
        finalizeUploadHandler(db, mem.store, "rita", input),
        finalizeUploadHandler(db, mem.store, "rita", input),
      ]);
      expect(a).toEqual(b);
      expect(a.status).toBe("accepted");
      expect(await count(paths.documents(orgId, projectId))).toBe(1);
      expect([...mem.objects.keys()]).toHaveLength(1);
    });

    it("rejeita arquivo que não é PDF (mesmo com nome .pdf), sem criar documento e limpando o arquivo", async () => {
      const { session, result } = await send("rita", Buffer.from("<html>não sou pdf</html>"), "falso.pdf");
      expect(result).toEqual({ status: "rejected", reason: "not_pdf" });
      expect(await count(paths.documents(orgId, projectId))).toBe(0);
      expect(mem.objects.size).toBe(0);
      const up = (await db.doc(paths.upload(orgId, projectId, session.uploadId)).get()).data();
      expect(up).toMatchObject({ status: "rejected", rejectionCode: "not_pdf" });
    });

    it("rejeita PDF corrompido", async () => {
      const bytes = await makePdf(1, 3);
      const { result } = await send("rita", bytes.subarray(0, Math.floor(bytes.length / 3)));
      expect(result.status).toBe("rejected");
    });

    it("cenário 14: a falha de um PDF não afeta os demais", async () => {
      const bad = await send("rita", Buffer.from("lixo"));
      const good = await send("rita", await makePdf(1, 4));
      expect(bad.result.status).toBe("rejected");
      expect(good.result.status).toBe("accepted");
      expect(await count(paths.documents(orgId, projectId))).toBe(1);
    });

    it("sem arquivo enviado: informa file_missing e mantém a sessão para nova tentativa", async () => {
      const session = await requestUploadHandler(db, mem.store, "rita", {
        organizationId: orgId, projectId, fileName: "a.pdf", sizeBytes: 100,
      });
      const input = { organizationId: orgId, projectId, uploadId: session.uploadId };
      expect(await finalizeUploadHandler(db, mem.store, "rita", input)).toEqual({
        status: "rejected", reason: "file_missing",
      });
      mem.objects.set(session.storagePath, await makePdf(1, 5));
      expect((await finalizeUploadHandler(db, mem.store, "rita", input)).status).toBe("accepted");
    });

    it("sessão vencida é rejeitada", async () => {
      const t0 = new Date("2026-01-01T10:00:00Z");
      const session = await requestUploadHandler(db, mem.store, "rita", {
        organizationId: orgId, projectId, fileName: "a.pdf", sizeBytes: 100,
      }, t0);
      mem.objects.set(session.storagePath, await makePdf(1, 6));
      const later = new Date(t0.getTime() + (UPLOAD_SESSION_TTL_MINUTES + 1) * 60_000);
      const result = await finalizeUploadHandler(db, mem.store, "rita", {
        organizationId: orgId, projectId, uploadId: session.uploadId,
      }, later);
      expect(result).toEqual({ status: "rejected", reason: "session_expired" });
      expect(await count(paths.documents(orgId, projectId))).toBe(0);
    });

    it("é idempotente: finalizar de novo devolve o mesmo resultado sem duplicar", async () => {
      const { session, result } = await send("rita", await makePdf(1, 7));
      const again = await finalizeUploadHandler(db, mem.store, "rita", {
        organizationId: orgId, projectId, uploadId: session.uploadId,
      });
      expect(again).toEqual(result);
      expect(await count(paths.documents(orgId, projectId))).toBe(1);
    });

    it("não finaliza sessão de outro usuário nem de outra organização", async () => {
      const session = await requestUploadHandler(db, mem.store, "rita", {
        organizationId: orgId, projectId, fileName: "a.pdf", sizeBytes: 100,
      });
      mem.objects.set(session.storagePath, await makePdf(1, 8));
      const input = { organizationId: orgId, projectId, uploadId: session.uploadId };
      await expectCode(finalizeUploadHandler(db, mem.store, "alice", input), "not-found");
      await expectCode(finalizeUploadHandler(db, mem.store, "vera", input), "permission-denied");
      await expectCode(finalizeUploadHandler(db, mem.store, "carol", input), "permission-denied");
    });
  });

  describe("reprocessDocument", () => {
    async function accepted() {
      const { result } = await send("rita", await makePdf(1, 9));
      if (result.status !== "accepted") throw new Error("esperava aceito");
      return result.documentId;
    }
    const input = (documentId: string) => ({ organizationId: orgId, projectId, documentId });

    it("cenário 17: reprocessar falha recoloca o MESMO job na fila, sem duplicar registros", async () => {
      const documentId = await accepted();
      await db.doc(paths.job(orgId, projectId, documentId)).update({
        status: "failed", errorCode: "x", errorMessage: "falha", attempts: 3,
      });
      await reprocessDocumentHandler(db, "rita", input(documentId));
      const job = (await db.doc(paths.job(orgId, projectId, documentId)).get()).data();
      expect(job).toMatchObject({ status: "queued", attempts: 0, runCount: 2, errorCode: null, errorMessage: null });
      expect(await count(paths.documents(orgId, projectId))).toBe(1);
      expect(await count(paths.jobs(orgId, projectId))).toBe(1);
      const audit = await db.collection(paths.auditEvents(orgId)).where("action", "==", "document.reprocess").get();
      expect(audit.size).toBe(1);
    });

    it("não reprocessa documento em execução", async () => {
      const documentId = await accepted();
      await db.doc(paths.job(orgId, projectId, documentId)).update({ status: "running" });
      await expectCode(reprocessDocumentHandler(db, "rita", input(documentId)), "failed-precondition");
    });

    it("exige papel reviewer; outra organização é negada; documento inexistente dá not-found", async () => {
      const documentId = await accepted();
      await expectCode(reprocessDocumentHandler(db, "vera", input(documentId)), "permission-denied");
      await expectCode(reprocessDocumentHandler(db, "carol", input(documentId)), "permission-denied");
      await expectCode(reprocessDocumentHandler(db, "rita", input("naoexiste")), "not-found");
    });
  });
});
