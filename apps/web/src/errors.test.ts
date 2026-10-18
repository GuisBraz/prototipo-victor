import { describe, expect, it } from "vitest";
import { friendlyError } from "./errors";

describe("friendlyError", () => {
  it("traduz códigos conhecidos", () => {
    expect(friendlyError({ code: "functions/permission-denied" })).toMatch(/permissão/);
    expect(friendlyError({ code: "auth/invalid-credential" })).toMatch(/incorretos/);
  });

  it("não vaza detalhes de erros desconhecidos", () => {
    const msg = friendlyError(new Error("stack interno com segredo"));
    expect(msg).not.toMatch(/segredo/);
  });
});
