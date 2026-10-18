import { z } from "zod";

/**
 * Documentos (PDFs enviados), sessões de upload e jobs de processamento.
 * Fase 2: upload com validação no servidor, deduplicação por hash e fila.
 * Especificação de referência: docs/DATA_MODEL.md e docs/AI_PIPELINE.md.
 */

// ---------- Limites (configuração central; ver PRD P3) ----------

/** Tamanho máximo de PDF aceito. A API da Anthropic limita ~32 MB por requisição. */
export const MAX_PDF_BYTES = 30 * 1024 * 1024;
/** Páginas máximas por PDF (a API aceita 100 quando o contexto é menor que 1M tokens). */
export const MAX_PDF_PAGES = 100;
export const MAX_FILE_NAME_LENGTH = 200;
/** Documentos por projeto (proteção contra abuso de custo). */
export const MAX_DOCUMENTS_PER_PROJECT = 2000;
/** Sessões de upload pendentes por usuário e projeto. */
export const MAX_PENDING_UPLOADS_PER_USER = 20;
/** Validade de uma sessão de upload. */
export const UPLOAD_SESSION_TTL_MINUTES = 30;

// ---------- Enums ----------

export const UPLOAD_STATUSES = ["pending", "accepted", "duplicate", "rejected"] as const;
export const uploadStatusSchema = z.enum(UPLOAD_STATUSES);
export type UploadStatus = z.infer<typeof uploadStatusSchema>;

/** Motivos de rejeição de um arquivo (sem dados sensíveis; mostrados ao usuário). */
export const REJECTION_CODES = [
  "file_missing", // nada foi enviado ao caminho da sessão
  "too_large",
  "empty_file",
  "not_pdf", // assinatura %PDF ausente
  "malformed_pdf", // não foi possível interpretar o PDF
  "encrypted_pdf",
  "no_pages",
  "too_many_pages",
  "session_expired",
] as const;
export const rejectionCodeSchema = z.enum(REJECTION_CODES);
export type RejectionCode = z.infer<typeof rejectionCodeSchema>;

export const REJECTION_MESSAGES_PT: Record<RejectionCode, string> = {
  file_missing: "O arquivo não chegou ao servidor. Tente enviar novamente.",
  too_large: "O arquivo excede o tamanho máximo permitido.",
  empty_file: "O arquivo está vazio.",
  not_pdf: "O arquivo não é um PDF válido.",
  malformed_pdf: "Não foi possível ler o PDF (arquivo danificado ou fora do padrão).",
  encrypted_pdf: "O PDF é protegido por senha ou criptografia, o que não é suportado.",
  no_pages: "O PDF não tem páginas.",
  too_many_pages: "O PDF tem mais páginas do que o limite permitido.",
  session_expired: "O tempo para concluir o envio expirou. Envie novamente.",
};

export const DOCUMENT_STATUSES = [
  "uploaded",
  "validated",
  "rejected",
  "queued",
  "processing",
  "processed",
  "failed",
] as const;
export const documentStatusSchema = z.enum(DOCUMENT_STATUSES);
export type DocumentStatus = z.infer<typeof documentStatusSchema>;

export const JOB_STATUSES = ["queued", "running", "succeeded", "failed", "cancelled"] as const;
export const jobStatusSchema = z.enum(JOB_STATUSES);
export type JobStatus = z.infer<typeof jobStatusSchema>;

// ---------- Entradas das callables ----------

const id = z.string().trim().min(1).max(128);

export const requestUploadInputSchema = z.object({
  organizationId: id,
  projectId: id,
  fileName: z.string().trim().min(1).max(255),
  sizeBytes: z.number().int().min(1).max(MAX_PDF_BYTES),
});
export type RequestUploadInput = z.infer<typeof requestUploadInputSchema>;

export const finalizeUploadInputSchema = z.object({
  organizationId: id,
  projectId: id,
  uploadId: id,
});
export type FinalizeUploadInput = z.infer<typeof finalizeUploadInputSchema>;

export const reprocessDocumentInputSchema = z.object({
  organizationId: id,
  projectId: id,
  documentId: id,
});
export type ReprocessDocumentInput = z.infer<typeof reprocessDocumentInputSchema>;

export type FinalizeUploadResult =
  | { status: "accepted"; documentId: string }
  | { status: "duplicate"; documentId: string }
  | { status: "rejected"; reason: RejectionCode };

// ---------- Documentos persistidos (forma lida pelo cliente) ----------

export const uploadSchema = z.object({
  organizationId: z.string(),
  projectId: z.string(),
  createdBy: z.string(),
  fileName: z.string(),
  declaredSizeBytes: z.number().int(),
  storagePath: z.string(),
  status: uploadStatusSchema,
  rejectionCode: rejectionCodeSchema.optional(),
  documentId: z.string().optional(),
  schemaVersion: z.number().int(),
});
export type Upload = z.infer<typeof uploadSchema>;

export const documentSchema = z.object({
  organizationId: z.string(),
  projectId: z.string(),
  fileName: z.string(),
  storagePath: z.string(),
  contentHash: z.string(),
  mimeType: z.literal("application/pdf"),
  sizeBytes: z.number().int(),
  pageCount: z.number().int(),
  status: documentStatusSchema,
  createdBy: z.string(),
  schemaVersion: z.number().int(),
});
export type PdfDocument = z.infer<typeof documentSchema>;

export const jobSchema = z.object({
  organizationId: z.string(),
  projectId: z.string(),
  documentId: z.string(),
  status: jobStatusSchema,
  currentStep: z.string(),
  attempts: z.number().int(),
  runCount: z.number().int(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  usage: z.object({
    inputTokens: z.number().int(),
    outputTokens: z.number().int(),
    calls: z.number().int(),
  }),
  schemaVersion: z.number().int(),
});
export type ProcessingJob = z.infer<typeof jobSchema>;

// ---------- Máquina de estados do job ----------

/** Transições permitidas. `failed`/`succeeded`/`cancelled` só voltam a `queued` por reprocessamento explícito. */
export const JOB_TRANSITIONS: Record<JobStatus, readonly JobStatus[]> = {
  queued: ["running", "cancelled"],
  running: ["succeeded", "failed", "queued"], // `queued` = retentativa após falha transitória
  succeeded: ["queued"],
  failed: ["queued"],
  cancelled: ["queued"],
};

export function canTransitionJob(from: JobStatus, to: JobStatus): boolean {
  return JOB_TRANSITIONS[from].includes(to);
}

/** Máximo de tentativas automáticas por execução (não reenviar indefinidamente). */
export const MAX_JOB_ATTEMPTS = 3;

/** Backoff exponencial limitado: 30 s, 60 s, 120 s… até 10 min. */
export function retryDelayMs(attempt: number): number {
  const exp = Math.max(0, attempt - 1);
  return Math.min(30_000 * 2 ** exp, 10 * 60_000);
}

// ---------- Nome de arquivo ----------

/**
 * Nome de arquivo seguro para exibição e metadados. O caminho no Storage NUNCA
 * usa este nome: é gerado pelo servidor.
 */
export function sanitizeFileName(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? "";
  const cleaned = base
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, "") // controle e bidi
    .replace(/\s+/g, " ")
    .trim();
  const limited = cleaned.slice(0, MAX_FILE_NAME_LENGTH);
  return limited.length > 0 && limited !== "." && limited !== ".." ? limited : "documento.pdf";
}

// ---------- Leitura por IA e conferência ----------

/** Códigos de falha da leitura mostrados ao usuário (sem detalhes internos). */
export const PROCESSING_ERROR_MESSAGES_PT: Record<string, string> = {
  ai_not_configured: "A leitura por IA não está configurada no servidor (chave da API ausente).",
  ai_refusal: "A IA recusou a leitura deste documento. Confira o arquivo e tente reprocessar.",
  ai_max_tokens: "O desenho gerou uma resposta grande demais. Tente reprocessar.",
  ai_invalid_output: "A IA devolveu um resultado fora do formato esperado. Tente reprocessar.",
  ai_too_many_turns: "A leitura não terminou no número máximo de etapas. Tente reprocessar.",
  ai_no_output: "A IA não devolveu resultado. Tente reprocessar.",
  ai_unavailable: "O serviço de IA está indisponível ou sobrecarregado. Tente reprocessar em alguns minutos.",
  pdf_render_failed: "Não foi possível renderizar o PDF para leitura.",
  timeout: "A leitura demorou demais e foi interrompida. Tente reprocessar.",
  internal: "Erro interno ao ler o desenho. Tente reprocessar.",
};

/** Chave de campo corrigível: campo da legenda ou `rows.<i>.<coluna>` da lista de materiais. */
export const REVIEW_FIELD_REGEX =
  /^(drawingNumber|revision|title|weight|rows\.(\d{1,4})\.(itemPosition|componentNumber|revision|description|quantity|weight))$/;

export const saveReviewInputSchema = z.object({
  organizationId: id,
  projectId: id,
  documentId: id,
  field: z.string().regex(REVIEW_FIELD_REGEX),
  /** Valor confirmado/corrigido; null = campo vazio (confirmado como ausente). */
  value: z.string().trim().max(500).nullable(),
  /** true = desfaz a correção e volta ao valor lido pela IA. */
  clear: z.boolean().default(false),
});
export type SaveReviewInput = z.infer<typeof saveReviewInputSchema>;
