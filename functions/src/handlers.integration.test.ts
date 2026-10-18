/**
 * Testes de integração dos handlers contra o emulador do Firestore.
 * Rodam com: npm run test:functions (na raiz), que sobe o emulador.
 * Sem FIRESTORE_EMULATOR_HOST definido, o arquivo é ignorado (não falha o `npm test` comum).
 */
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { paths } from "@mecabom/shared";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MAX_ORGANIZATIONS_PER_USER } from "./config.js";
import { createOrganizationHandler, createProjectHandler } from "./handlers.js";

const emulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const suite = emulator ? describe : describe.skip;

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toSatisfy(
    (e: unknown) => e instanceof HttpsError && e.code === code,
  );
}

suite("handlers (emulador do Firestore)", () => {
  let db: Firestore;

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
  });

  const validProject = (organizationId: string, code = "PR-1") => ({
    organizationId,
    code,
    name: "Projeto de teste",
    description: "",
  });

  describe("createOrganization", () => {
    it("cria organização, membro administrador, espelho do usuário e auditoria", async () => {
      const { organizationId } = await createOrganizationHandler(db, "alice", { name: "ACME" });

      const member = (await db.doc(paths.member(organizationId, "alice")).get()).data();
      expect(member).toMatchObject({ role: "admin", status: "active", userId: "alice" });

      const mirror = (await db.doc(paths.userMembership("alice", organizationId)).get()).data();
      expect(mirror).toMatchObject({ organizationName: "ACME", role: "admin" });

      const audit = await db.collection(paths.auditEvents(organizationId)).get();
      expect(audit.size).toBe(1);
      expect(audit.docs[0]?.data()).toMatchObject({
        action: "organization.create",
        actorId: "alice",
      });
    });

    it("rejeita nome inválido", async () => {
      await expectCode(createOrganizationHandler(db, "alice", { name: "A" }), "invalid-argument");
    });

    it("limita o número de organizações por usuário", async () => {
      for (let i = 0; i < MAX_ORGANIZATIONS_PER_USER; i++) {
        await createOrganizationHandler(db, "alice", { name: `Org ${i}` });
      }
      await expectCode(
        createOrganizationHandler(db, "alice", { name: "Org extra" }),
        "resource-exhausted",
      );
    });
  });

  describe("createProject", () => {
    it("administrador cria projeto, com índice de código e auditoria", async () => {
      const { organizationId } = await createOrganizationHandler(db, "alice", { name: "ACME" });
      const { projectId } = await createProjectHandler(db, "alice", validProject(organizationId));

      const project = (await db.doc(paths.project(organizationId, projectId)).get()).data();
      expect(project).toMatchObject({ code: "PR-1", ownerId: "alice", status: "active" });
      expect((await db.doc(paths.projectCodeIndex(organizationId, "PR-1")).get()).exists).toBe(true);

      const audit = await db.collection(paths.auditEvents(organizationId)).get();
      expect(audit.docs.map((d) => d.data().action).sort()).toEqual([
        "organization.create",
        "project.create",
      ]);
    });

    it("cenário 15: usuário de outra organização é negado e nada é criado", async () => {
      const a = await createOrganizationHandler(db, "alice", { name: "Org A" });
      await createOrganizationHandler(db, "carol", { name: "Org B" });

      await expectCode(
        createProjectHandler(db, "carol", validProject(a.organizationId)),
        "permission-denied",
      );
      const projects = await db.collection(paths.projects(a.organizationId)).get();
      expect(projects.size).toBe(0);
    });

    it("usuário sem vínculo é negado", async () => {
      const a = await createOrganizationHandler(db, "alice", { name: "Org A" });
      await expectCode(
        createProjectHandler(db, "zoe", validProject(a.organizationId)),
        "permission-denied",
      );
    });

    it("papel viewer é negado; reviewer é permitido", async () => {
      const { organizationId } = await createOrganizationHandler(db, "alice", { name: "ACME" });
      await db.doc(paths.member(organizationId, "bob")).set({ role: "viewer", status: "active" });
      await db.doc(paths.member(organizationId, "rita")).set({ role: "reviewer", status: "active" });

      await expectCode(
        createProjectHandler(db, "bob", validProject(organizationId, "PR-V")),
        "permission-denied",
      );
      await expect(
        createProjectHandler(db, "rita", validProject(organizationId, "PR-R")),
      ).resolves.toHaveProperty("projectId");
    });

    it("membro desativado é negado", async () => {
      const { organizationId } = await createOrganizationHandler(db, "alice", { name: "ACME" });
      await db.doc(paths.member(organizationId, "dora")).set({ role: "admin", status: "disabled" });
      await expectCode(
        createProjectHandler(db, "dora", validProject(organizationId)),
        "permission-denied",
      );
    });

    it("rejeita código duplicado, inclusive com caixa diferente", async () => {
      const { organizationId } = await createOrganizationHandler(db, "alice", { name: "ACME" });
      await createProjectHandler(db, "alice", validProject(organizationId, "PR-1"));
      await expectCode(
        createProjectHandler(db, "alice", validProject(organizationId, "pr-1")),
        "already-exists",
      );
      const projects = await db.collection(paths.projects(organizationId)).get();
      expect(projects.size).toBe(1);
    });

    it("rejeita código com caracteres inválidos", async () => {
      const { organizationId } = await createOrganizationHandler(db, "alice", { name: "ACME" });
      await expectCode(
        createProjectHandler(db, "alice", validProject(organizationId, "../x")),
        "invalid-argument",
      );
    });

    it("o mesmo código pode existir em organizações diferentes", async () => {
      const a = await createOrganizationHandler(db, "alice", { name: "Org A" });
      const b = await createOrganizationHandler(db, "carol", { name: "Org B" });
      await createProjectHandler(db, "alice", validProject(a.organizationId, "PR-1"));
      await expect(
        createProjectHandler(db, "carol", validProject(b.organizationId, "PR-1")),
      ).resolves.toHaveProperty("projectId");
    });
  });
});
