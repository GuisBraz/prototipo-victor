import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { PDFDocument } from "pdf-lib";
import { MAX_PDF_BYTES, MAX_PDF_PAGES } from "@mecabom/shared";
import { describe, expect, it } from "vitest";
import { validatePdf } from "./pdf.js";

async function makePdf(pages: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i += 1) doc.addPage([200, 200]);
  // addDefaultPage: false — por padrão o pdf-lib acrescenta uma página a documentos vazios ao salvar.
  return doc.save({ addDefaultPage: false });
}

describe("validatePdf", () => {
  it("aceita um PDF válido e devolve páginas, tamanho e hash SHA-256", async () => {
    const bytes = await makePdf(2);
    const result = await validatePdf(bytes);
    expect(result).toMatchObject({ ok: true, pageCount: 2, sizeBytes: bytes.length });
    if (result.ok) expect(result.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("o hash é determinístico e depende do conteúdo", async () => {
    const a = await makePdf(1);
    const b = await makePdf(2);
    const [ra, ra2, rb] = await Promise.all([validatePdf(a), validatePdf(a), validatePdf(b)]);
    expect(ra.ok && ra2.ok && rb.ok).toBe(true);
    if (ra.ok && ra2.ok && rb.ok) {
      expect(ra.sha256).toBe(ra2.sha256);
      expect(ra.sha256).not.toBe(rb.sha256);
    }
  });

  it("rejeita arquivo vazio", async () => {
    expect(await validatePdf(new Uint8Array())).toEqual({ ok: false, code: "empty_file" });
  });

  it("rejeita arquivo que não é PDF, mesmo com nome .pdf (a extensão nunca é consultada)", async () => {
    const text = new TextEncoder().encode("isto é só texto, não um PDF");
    expect(await validatePdf(text)).toEqual({ ok: false, code: "not_pdf" });
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    expect(await validatePdf(png)).toEqual({ ok: false, code: "not_pdf" });
  });

  it("rejeita PDF malformado (assinatura presente, conteúdo corrompido)", async () => {
    const valid = await makePdf(1);
    const truncated = valid.slice(0, Math.floor(valid.length / 3));
    expect((await validatePdf(truncated)).ok).toBe(false);
    const onlyHeader = new TextEncoder().encode("%PDF-1.7\nlixo sem estrutura\n");
    expect(await validatePdf(onlyHeader)).toEqual({ ok: false, code: "malformed_pdf" });
  });

  it("rejeita PDF protegido por senha (fixture gerada com qpdf, AES-256)", async () => {
    const bytes = readFileSync(resolve(__dirname, "../test-fixtures/encrypted.pdf"));
    expect(await validatePdf(bytes)).toEqual({ ok: false, code: "encrypted_pdf" });
  });

  it("rejeita PDF sem páginas", async () => {
    expect(await validatePdf(await makePdf(0))).toEqual({ ok: false, code: "no_pages" });
  });

  it("rejeita PDF com páginas acima do limite e aceita exatamente no limite", async () => {
    expect(await validatePdf(await makePdf(MAX_PDF_PAGES + 1))).toEqual({
      ok: false,
      code: "too_many_pages",
    });
    expect((await validatePdf(await makePdf(MAX_PDF_PAGES))).ok).toBe(true);
  });

  it("rejeita arquivo acima do tamanho máximo antes de qualquer análise", async () => {
    const big = new Uint8Array(MAX_PDF_BYTES + 1);
    expect(await validatePdf(big)).toEqual({ ok: false, code: "too_large" });
  });
});

/**
 * Teste opcional com desenhos reais: roda só se existir a pasta indicada em
 * MECABOM_SAMPLES_DIR (ou `samples/` na raiz). Os desenhos nunca vão para o Git.
 */
const samplesDir = process.env.MECABOM_SAMPLES_DIR ?? resolve(__dirname, "../../samples");
describe.skipIf(!existsSync(samplesDir))("desenhos reais (opcional)", () => {
  it("aceita todos os PDFs da pasta de amostras", async () => {
    const files = readdirSync(samplesDir).filter((f) => /\.pdf$/i.test(f));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const result = await validatePdf(readFileSync(resolve(samplesDir, f)));
      expect(result.ok, `${f} deveria ser aceito`).toBe(true);
    }
  });
});
