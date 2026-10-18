import { describe, expect, it } from "vitest";
import {
  authorize,
  buildAuditEvent,
  buildOrganizationBootstrap,
  buildProject,
} from "./domain.js";

describe("authorize", () => {
  it("nega quem não é membro", () => {
    expect(authorize(null, "viewer")).toEqual({ ok: false, reason: "not_a_member" });
  });

  it("nega membro desativado ou apenas convidado", () => {
    expect(authorize({ role: "admin", status: "disabled" }, "viewer")).toEqual({
      ok: false,
      reason: "inactive_member",
    });
    expect(authorize({ role: "admin", status: "invited" }, "viewer")).toEqual({
      ok: false,
      reason: "inactive_member",
    });
  });

  it("nega papel insuficiente", () => {
    expect(authorize({ role: "viewer", status: "active" }, "reviewer")).toEqual({
      ok: false,
      reason: "insufficient_role",
    });
  });

  it("permite papel igual ou superior", () => {
    expect(authorize({ role: "reviewer", status: "active" }, "reviewer").ok).toBe(true);
    expect(authorize({ role: "admin", status: "active" }, "reviewer").ok).toBe(true);
  });
});

describe("buildOrganizationBootstrap", () => {
  it("cria o criador como administrador ativo e espelha a organização", () => {
    const b = buildOrganizationBootstrap("u1", "org1", "ACME");
    expect(b.member).toMatchObject({ userId: "u1", organizationId: "org1", role: "admin", status: "active" });
    expect(b.userMembership.organizationName).toBe("ACME");
    expect(b.organization.createdBy).toBe("u1");
  });
});

describe("buildProject", () => {
  it("define o criador como dono e projeto ativo", () => {
    const p = buildProject({ organizationId: "o", code: "PR-1", name: "N", description: "" }, "u1");
    expect(p).toMatchObject({ ownerId: "u1", status: "active", organizationId: "o" });
  });
});

describe("buildAuditEvent", () => {
  it("omite campos opcionais ausentes", () => {
    const e = buildAuditEvent({
      organizationId: "o",
      actorId: "u",
      action: "project.create",
      subject: { type: "project", id: "p" },
    });
    expect(e).not.toHaveProperty("after");
    expect(e).not.toHaveProperty("requestId");
  });
});
