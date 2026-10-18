import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from "firebase/firestore";
import { ref, uploadBytes, getBytes, deleteObject } from "firebase/storage";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-mecabom",
    firestore: {
      rules: readFileSync(resolve(__dirname, "../firestore.rules"), "utf8"),
    },
    storage: {
      rules: readFileSync(resolve(__dirname, "../storage.rules"), "utf8"),
    },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.clearStorage();
  // Dados de teste criados SEM regras (equivale ao Admin SDK).
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "organizations/orgA"), { name: "Org A", status: "active" });
    await setDoc(doc(db, "organizations/orgB"), { name: "Org B", status: "active" });
    await setDoc(doc(db, "organizations/orgA/members/alice"), { role: "admin", status: "active" });
    await setDoc(doc(db, "organizations/orgA/members/bob"), { role: "viewer", status: "active" });
    await setDoc(doc(db, "organizations/orgA/members/dora"), { role: "reviewer", status: "disabled" });
    await setDoc(doc(db, "organizations/orgB/members/carol"), { role: "admin", status: "active" });
    await setDoc(doc(db, "organizations/orgA/projects/p1"), { code: "PR-1", name: "Projeto A1" });
    await setDoc(doc(db, "organizations/orgB/projects/p2"), { code: "PR-2", name: "Projeto B1" });
    await setDoc(doc(db, "organizations/orgA/projectCodes/pr-1"), { projectId: "p1" });
    await setDoc(doc(db, "organizations/orgA/auditEvents/e1"), { action: "project.create" });
    const base = "organizations/orgA/projects/p1";
    await setDoc(doc(db, `${base}/documents/d1`), { fileName: "a.pdf", status: "queued" });
    await setDoc(doc(db, `${base}/jobs/d1`), { status: "queued" });
    await setDoc(doc(db, `${base}/extractions/d1`), { output: {}, overrides: {} });
    await setDoc(doc(db, "organizations/orgB/projects/p2/extractions/x1"), { output: {}, overrides: {} });
    await setDoc(doc(db, `${base}/documentHashes/abc`), { documentId: "d1" });
    await setDoc(doc(db, `${base}/uploads/u1`), { createdBy: "alice", status: "pending", declaredSizeBytes: 1000 });
    await setDoc(doc(db, `${base}/uploads/u2`), { createdBy: "alice", status: "accepted", declaredSizeBytes: 1000 });
    await setDoc(doc(db, "users/alice/memberships/orgA"), { organizationId: "orgA", role: "admin" });
    await setDoc(doc(db, "users/bob/memberships/orgA"), { organizationId: "orgA", role: "viewer" });
  });
});

describe("leitura", () => {
  it("membro ativo lê projetos da própria organização", async () => {
    const db = env.authenticatedContext("bob").firestore();
    await assertSucceeds(getDoc(doc(db, "organizations/orgA/projects/p1")));
  });

  it("cenário 15: usuário NÃO lê projeto de outra organização", async () => {
    const db = env.authenticatedContext("bob").firestore();
    await assertFails(getDoc(doc(db, "organizations/orgB/projects/p2")));
  });

  it("administrador de uma organização não lê outra", async () => {
    const db = env.authenticatedContext("alice").firestore();
    await assertFails(getDoc(doc(db, "organizations/orgB/projects/p2")));
    await assertFails(getDoc(doc(db, "organizations/orgB")));
  });

  it("não autenticado não lê nada", async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, "organizations/orgA/projects/p1")));
    await assertFails(getDoc(doc(db, "organizations/orgA")));
  });

  it("membro desativado não lê", async () => {
    const db = env.authenticatedContext("dora").firestore();
    await assertFails(getDoc(doc(db, "organizations/orgA/projects/p1")));
  });

  it("usuário autenticado sem vínculo não lê", async () => {
    const db = env.authenticatedContext("zoe").firestore();
    await assertFails(getDoc(doc(db, "organizations/orgA/projects/p1")));
  });

  it("auditoria: só administrador lê", async () => {
    await assertSucceeds(
      getDoc(doc(env.authenticatedContext("alice").firestore(), "organizations/orgA/auditEvents/e1")),
    );
    await assertFails(
      getDoc(doc(env.authenticatedContext("bob").firestore(), "organizations/orgA/auditEvents/e1")),
    );
  });

  it("índice de códigos de projeto não é acessível ao cliente", async () => {
    const db = env.authenticatedContext("alice").firestore();
    await assertFails(getDoc(doc(db, "organizations/orgA/projectCodes/pr-1")));
  });

  it("usuário lê só o próprio espelho de organizações", async () => {
    const db = env.authenticatedContext("bob").firestore();
    await assertSucceeds(getDoc(doc(db, "users/bob/memberships/orgA")));
    await assertFails(getDoc(doc(db, "users/alice/memberships/orgA")));
  });
});

describe("escrita pelo cliente (sempre negada na Fase 1)", () => {
  it("nem administrador cria ou altera projeto direto", async () => {
    const db = env.authenticatedContext("alice").firestore();
    await assertFails(setDoc(doc(db, "organizations/orgA/projects/novo"), { code: "X", name: "Y" }));
    await assertFails(updateDoc(doc(db, "organizations/orgA/projects/p1"), { name: "Alterado" }));
    await assertFails(deleteDoc(doc(db, "organizations/orgA/projects/p1")));
  });

  it("ninguém promove o próprio papel", async () => {
    const db = env.authenticatedContext("bob").firestore();
    await assertFails(updateDoc(doc(db, "organizations/orgA/members/bob"), { role: "admin" }));
  });

  it("ninguém cria organização ou membro direto", async () => {
    const db = env.authenticatedContext("zoe").firestore();
    await assertFails(setDoc(doc(db, "organizations/orgZ"), { name: "Z" }));
    await assertFails(setDoc(doc(db, "organizations/orgA/members/zoe"), { role: "admin", status: "active" }));
  });

  it("ninguém escreve auditoria ou espelho de organizações", async () => {
    const db = env.authenticatedContext("alice").firestore();
    await assertFails(setDoc(doc(db, "organizations/orgA/auditEvents/e2"), { action: "x" }));
    await assertFails(setDoc(doc(db, "users/alice/memberships/orgB"), { role: "admin" }));
  });
});

describe("caminhos desconhecidos", () => {
  it("negados por padrão", async () => {
    const db = env.authenticatedContext("alice").firestore();
    await assertFails(getDoc(doc(db, "qualquercoisa/x")));
    await assertFails(setDoc(doc(db, "qualquercoisa/x"), { a: 1 }));
  });
});

describe("Fase 2: documentos, jobs e uploads (Firestore)", () => {
  const base = "organizations/orgA/projects/p1";

  it("membro lê documentos e jobs do próprio projeto; não lê os de outra organização", async () => {
    const bob = env.authenticatedContext("bob").firestore();
    await assertSucceeds(getDoc(doc(bob, `${base}/documents/d1`)));
    await assertSucceeds(getDoc(doc(bob, `${base}/jobs/d1`)));
    const carol = env.authenticatedContext("carol").firestore();
    await assertFails(getDoc(doc(carol, `${base}/documents/d1`)));
    await assertFails(getDoc(doc(carol, `${base}/jobs/d1`)));
  });

  it("ninguém escreve documentos, jobs, uploads ou hashes direto", async () => {
    const alice = env.authenticatedContext("alice").firestore();
    await assertFails(setDoc(doc(alice, `${base}/documents/d2`), { fileName: "x.pdf" }));
    await assertFails(updateDoc(doc(alice, `${base}/jobs/d1`), { status: "succeeded" }));
    await assertFails(setDoc(doc(alice, `${base}/uploads/u3`), { createdBy: "alice", status: "pending" }));
    await assertFails(updateDoc(doc(alice, `${base}/uploads/u1`), { status: "accepted" }));
    await assertFails(deleteDoc(doc(alice, `${base}/documents/d1`)));
  });

  it("índice de hashes não é acessível ao cliente", async () => {
    await assertFails(getDoc(doc(env.authenticatedContext("alice").firestore(), `${base}/documentHashes/abc`)));
  });

  it("sessão de upload: só o criador lê", async () => {
    await assertSucceeds(getDoc(doc(env.authenticatedContext("alice").firestore(), `${base}/uploads/u1`)));
    await assertFails(getDoc(doc(env.authenticatedContext("bob").firestore(), `${base}/uploads/u1`)));
  });
});

describe("Fase 2: Storage (upload só na sessão aberta pelo servidor)", () => {
  const pdf = (n: number) => new Uint8Array(n).fill(0x25);
  const meta = { contentType: "application/pdf" };
  const incoming = (uploadId: string) => `organizations/orgA/projects/p1/incoming/${uploadId}`;

  it("o criador envia PDF para o caminho da própria sessão pendente", async () => {
    const storage = env.authenticatedContext("alice").storage();
    await assertSucceeds(uploadBytes(ref(storage, incoming("u1")), pdf(500), meta));
  });

  it("outro usuário não envia para a sessão de terceiros", async () => {
    const storage = env.authenticatedContext("bob").storage();
    await assertFails(uploadBytes(ref(storage, incoming("u1")), pdf(500), meta));
  });

  it("não envia para sessão inexistente ou já encerrada", async () => {
    const storage = env.authenticatedContext("alice").storage();
    await assertFails(uploadBytes(ref(storage, incoming("naoexiste")), pdf(500), meta));
    await assertFails(uploadBytes(ref(storage, incoming("u2")), pdf(500), meta));
  });

  it("não excede o tamanho declarado e não aceita outro tipo", async () => {
    const storage = env.authenticatedContext("alice").storage();
    await assertFails(uploadBytes(ref(storage, incoming("u1")), pdf(1001), meta));
    await assertFails(uploadBytes(ref(storage, incoming("u1")), pdf(500), { contentType: "text/html" }));
  });

  it("não autenticado não envia", async () => {
    const storage = env.unauthenticatedContext().storage();
    await assertFails(uploadBytes(ref(storage, incoming("u1")), pdf(500), meta));
  });

  it("não grava fora do caminho de sessões (nem em documents/)", async () => {
    const storage = env.authenticatedContext("alice").storage();
    await assertFails(uploadBytes(ref(storage, "organizations/orgA/projects/p1/documents/d9.pdf"), pdf(500), meta));
    await assertFails(uploadBytes(ref(storage, "qualquer/coisa.pdf"), pdf(500), meta));
  });

  it("o cliente não lê nem apaga objetos, nem os próprios", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await uploadBytes(ref(ctx.storage(), incoming("u1")), pdf(500), meta);
    });
    const storage = env.authenticatedContext("alice").storage();
    await assertFails(getBytes(ref(storage, incoming("u1"))));
    await assertFails(deleteObject(ref(storage, incoming("u1"))));
  });
});

describe("leitura por IA e conferência (extractions)", () => {
  it("membro ativo lê a leitura do próprio projeto; outra organização não", async () => {
    const bob = env.authenticatedContext("bob").firestore();
    await assertSucceeds(getDoc(doc(bob, "organizations/orgA/projects/p1/extractions/d1")));
    await assertFails(getDoc(doc(bob, "organizations/orgB/projects/p2/extractions/x1")));
    await assertFails(getDoc(doc(env.authenticatedContext("dora").firestore(), "organizations/orgA/projects/p1/extractions/d1")));
  });

  it("ninguém grava leitura ou correção direto (só pela callable saveReview)", async () => {
    const alice = env.authenticatedContext("alice").firestore();
    const path = "organizations/orgA/projects/p1/extractions/d1";
    await assertFails(updateDoc(doc(alice, path), { "overrides.title": { value: "X" } }));
    await assertFails(setDoc(doc(alice, "organizations/orgA/projects/p1/extractions/novo"), { output: {} }));
    await assertFails(deleteDoc(doc(alice, path)));
  });
});
