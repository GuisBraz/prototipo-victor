import { createHash } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { MAX_PDF_BYTES, MAX_PDF_PAGES, type RejectionCode } from "@mecabom/shared";

export type PdfValidation =
  | { ok: true; pageCount: number; sha256: string; sizeBytes: number }
  | { ok: false; code: RejectionCode };

/** A assinatura `%PDF-` deve aparecer logo no início (a especificação tolera poucos bytes antes). */
function hasPdfSignature(bytes: Uint8Array): boolean {
  const head = Buffer.from(bytes.subarray(0, 1024)).toString("latin1");
  return head.includes("%PDF-");
}

function isEncryptedPdfError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.constructor.name === "EncryptedPDFError" || /\bis encrypted\b/.test(error.message);
}

/**
 * Valida o CONTEÚDO real do arquivo (não confia em nome, extensão nem tipo
 * declarado pelo cliente): assinatura, interpretação do PDF, criptografia,
 * número de páginas e tamanho. Nada disso envolve IA.
 */
export async function validatePdf(bytes: Uint8Array): Promise<PdfValidation> {
  if (bytes.length === 0) return { ok: false, code: "empty_file" };
  if (bytes.length > MAX_PDF_BYTES) return { ok: false, code: "too_large" };
  if (!hasPdfSignature(bytes)) return { ok: false, code: "not_pdf" };

  let pageCount: number;
  try {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: false, updateMetadata: false });
    pageCount = doc.getPageCount();
  } catch (error) {
    // Não usar `instanceof`: o pdf-lib tem builds ESM e CJS com classes distintas.
    if (isEncryptedPdfError(error)) return { ok: false, code: "encrypted_pdf" };
    return { ok: false, code: "malformed_pdf" };
  }

  if (pageCount < 1) return { ok: false, code: "no_pages" };
  if (pageCount > MAX_PDF_PAGES) return { ok: false, code: "too_many_pages" };

  return {
    ok: true,
    pageCount,
    sizeBytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}
