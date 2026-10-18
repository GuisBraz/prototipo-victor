import { describe, expect, it } from "vitest";
import {
  createOrganizationInputSchema,
  createProjectInputSchema,
  hasAtLeastRole,
  paths,
} from "./index.js";

describe("createProjectInputSchema", () => {
  const base = { organizationId: "org1", code: "PR-2026-018", name: "Linha de produção" };

  it("aceita entrada válida e aplica descrição padrão", () => {
    const parsed = createProjectInputSchema.parse(base);
    expect(parsed.description).toBe("");
  });

  it("rejeita código com caracteres inválidos", () => {
    expect(createProjectInputSchema.safeParse({ ...base, code: "PR 2026/018" }).success).toBe(false);
    expect(createProjectInputSchema.safeParse({ ...base, code: "../x" }).success).toBe(false);
  });

  it("rejeita nome vazio ou só com espaços", () => {
    expect(createProjectInputSchema.safeParse({ ...base, name: "   " }).success).toBe(false);
  });
});

describe("createOrganizationInputSchema", () => {
  it("remove espaços nas bordas e exige tamanho mínimo", () => {
    expect(createOrganizationInputSchema.parse({ name: "  ACME  " }).name).toBe("ACME");
    expect(createOrganizationInputSchema.safeParse({ name: "A" }).success).toBe(false);
  });
});

describe("hasAtLeastRole", () => {
  it("respeita a ordem dos papéis", () => {
    expect(hasAtLeastRole("admin", "reviewer")).toBe(true);
    expect(hasAtLeastRole("viewer", "reviewer")).toBe(false);
    expect(hasAtLeastRole("approver", "approver")).toBe(true);
  });
});

describe("paths", () => {
  it("normaliza o código no índice de unicidade", () => {
    expect(paths.projectCodeIndex("o", "PR-1")).toBe("organizations/o/projectCodes/pr-1");
  });
});
