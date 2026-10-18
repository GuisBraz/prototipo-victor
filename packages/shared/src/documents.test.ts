import { describe, expect, it } from "vitest";
import {
  MAX_PDF_BYTES,
  canTransitionJob,
  finalizeUploadInputSchema,
  requestUploadInputSchema,
  retryDelayMs,
  sanitizeFileName,
} from "./documents.js";
import { paths, storagePaths } from "./schemas.js";

describe("requestUploadInputSchema", () => {
  const ok = { organizationId: "o", projectId: "p", fileName: "a.pdf", sizeBytes: 1000 };
  it("aceita entrada válida", () => {
    expect(requestUploadInputSchema.safeParse(ok).success).toBe(true);
  });
  it("rejeita tamanho zero, negativo, fracionário ou acima do limite", () => {
    for (const sizeBytes of [0, -1, 1.5, MAX_PDF_BYTES + 1]) {
      expect(requestUploadInputSchema.safeParse({ ...ok, sizeBytes }).success).toBe(false);
    }
  });
  it("rejeita nome vazio", () => {
    expect(requestUploadInputSchema.safeParse({ ...ok, fileName: "   " }).success).toBe(false);
  });
  it("finalize exige ids", () => {
    expect(finalizeUploadInputSchema.safeParse({ organizationId: "o", projectId: "p" }).success).toBe(false);
  });
});

describe("sanitizeFileName", () => {
  it("remove diretórios e caracteres de controle", () => {
    expect(sanitizeFileName("..\\..\\etc/passwd\u0000.pdf")).toBe("passwd.pdf");
    expect(sanitizeFileName("C:\\Users\\x\\desenho 1.pdf")).toBe("desenho 1.pdf");
  });
  it("remove caracteres de inversão bidi", () => {
    expect(sanitizeFileName("a\u202etxt.pdf")).toBe("atxt.pdf");
  });
  it("usa nome padrão quando não sobra nada e limita o tamanho", () => {
    expect(sanitizeFileName("..")).toBe("documento.pdf");
    expect(sanitizeFileName("///")).toBe("documento.pdf");
    expect(sanitizeFileName("a".repeat(500)).length).toBe(200);
  });
});

describe("máquina de estados do job", () => {
  it("permite o fluxo normal e a retentativa", () => {
    expect(canTransitionJob("queued", "running")).toBe(true);
    expect(canTransitionJob("running", "succeeded")).toBe(true);
    expect(canTransitionJob("running", "queued")).toBe(true);
    expect(canTransitionJob("failed", "queued")).toBe(true);
  });
  it("proíbe pular etapas", () => {
    expect(canTransitionJob("queued", "succeeded")).toBe(false);
    expect(canTransitionJob("succeeded", "running")).toBe(false);
    expect(canTransitionJob("failed", "running")).toBe(false);
  });
  it("backoff cresce e é limitado", () => {
    expect(retryDelayMs(1)).toBe(30_000);
    expect(retryDelayMs(2)).toBe(60_000);
    expect(retryDelayMs(3)).toBe(120_000);
    expect(retryDelayMs(50)).toBe(600_000);
  });
});

describe("caminhos", () => {
  it("o caminho do Storage não depende de nome de arquivo", () => {
    expect(storagePaths.incoming("o", "p", "u1")).toBe("organizations/o/projects/p/incoming/u1");
    expect(storagePaths.document("o", "p", "d1")).toBe("organizations/o/projects/p/documents/d1.pdf");
    expect(paths.documentHash("o", "p", "abc")).toBe("organizations/o/projects/p/documentHashes/abc");
  });
});
