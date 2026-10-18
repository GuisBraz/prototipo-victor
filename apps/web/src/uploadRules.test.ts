import { describe, expect, it } from "vitest";
import { MAX_PDF_BYTES } from "@mecabom/shared";
import { formatBytes, prevalidateFile } from "./uploadRules";

describe("prevalidateFile", () => {
  it("aceita PDF pelo tipo ou pela extensão", () => {
    expect(prevalidateFile({ name: "a.pdf", size: 10, type: "application/pdf" })).toBeNull();
    expect(prevalidateFile({ name: "A.PDF", size: 10, type: "" })).toBeNull();
  });
  it("recusa outros tipos, vazio e grande demais", () => {
    expect(prevalidateFile({ name: "a.png", size: 10, type: "image/png" })).toMatch(/PDF/);
    expect(prevalidateFile({ name: "a.pdf", size: 0, type: "application/pdf" })).toMatch(/vazio/);
    expect(prevalidateFile({ name: "a.pdf", size: MAX_PDF_BYTES + 1, type: "application/pdf" })).toMatch(/limite/);
  });
  it("formata tamanhos", () => {
    expect(formatBytes(500)).toBe("500 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(3 * 1024 * 1024)).toBe("3.0 MB");
  });
});
