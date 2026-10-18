import { z } from "zod";

/**
 * Extração de dados técnicos de um desenho pela IA (Fase 2/3).
 * Especificação de referência: docs/AI_PIPELINE.md (§1, §5, §6) e docs/DATA_MODEL.md.
 *
 * Este arquivo define:
 * 1. a configuração versionada do modelo (fonte única: nada de modelo espalhado pelo código);
 * 2. o contrato de SAÍDA da IA, em duas formas que precisam coincidir:
 *    - `extractionJsonSchema`: enviado à API em `output_config.format` (saída estruturada);
 *    - `extractionOutputSchema` (Zod): validação no backend, incluindo o que o JSON Schema
 *      da API não expressa (faixas numéricas, coerência entre campos).
 *
 * A saída da IA é BRUTA: o status final de cada campo (validated, conflicting, approved…)
 * é decidido pelo sistema e pela revisão humana, nunca pelo modelo.
 */

// ---------- Configuração versionada do modelo ----------

/**
 * Fatos conferidos em 17/10/2026 na referência oficial da API (tabela de modelos de 06/10/2026):
 * - Claude Opus 5.5 (`claude-opus-5-5`): US$ 4 / 1M tokens de entrada e US$ 20 / 1M de saída;
 *   contexto de 1M tokens, até 128K de saída; aceita PDF e imagens; suporta saída estruturada.
 * - Pensamento (thinking) não pode ser desligado neste modelo; a profundidade é controlada por
 *   `effort` (low…max), cujo padrão é `medium`. Usamos `high` como ponto de partida porque
 *   acerto vale mais que custo aqui; o valor final sai da avaliação com o gabarito (AI_PIPELINE §8).
 * - `refusalFallback: "default"`: em caso de recusa por classificador de segurança, a própria API
 *   reprocessa com um modelo de reserva (parâmetro `fallbacks`, beta). Pode ser desligado.
 * Reverificar na documentação oficial antes de cada troca de modelo.
 */
export const AI_EXTRACTION_CONFIG = {
  provider: "anthropic",
  modelId: "claude-opus-5-5",
  effort: "high",
  /** Teto de saída por chamada (inclui o raciocínio). Valores altos exigem streaming no SDK. */
  maxOutputTokens: 32000,
  refusalFallback: "default",
  /** Versão do prompt: functions/src/ai/prompts/drawingExtraction.v1.ts. */
  promptVersion: "drawing-extraction.v1",
  /** Versão do contrato de saída abaixo. Mudou o schema, sobe a versão. */
  outputSchemaVersion: 1,
} as const;

export type AiExtractionConfig = typeof AI_EXTRACTION_CONFIG;

// ---------- Enums ----------

/** Como a IA classifica cada campo. O status final do campo é decidido pelo sistema. */
export const EXTRACTION_VALUE_STATUSES = ["found", "not_found", "ambiguous"] as const;

/** Tipos de desenho (mesmos de `Drawing.documentType` em DATA_MODEL.md). */
export const DRAWING_DOCUMENT_TYPES = [
  "part",
  "assembly",
  "subassembly",
  "general_assembly",
  "fabrication",
  "detail",
  "reference",
  "other",
  "unknown",
] as const;

/** A que o peso indicado se refere; impede confundir peso de peça com peso de conjunto. */
export const WEIGHT_SCOPES = ["unit", "assembly", "unknown"] as const;

/** Problemas que a IA deve sinalizar em vez de "resolver" sozinha. */
export const EXTRACTION_ISSUE_TYPES = [
  "illegible", // região ilegível ou cortada
  "conflicting_values", // o mesmo dado aparece com valores diferentes no documento
  "multiple_title_blocks", // mais de uma legenda/carimbo
  "table_continues_elsewhere", // tabela de componentes continua em outra folha/documento
  "instruction_like_text", // texto do PDF que parece instrução ao modelo (tratado como dado)
  "other",
] as const;

/** Campos da legenda/carimbo extraídos como texto bruto (a normalização é do sistema). */
export const TITLE_BLOCK_FIELDS = [
  "drawingNumber",
  "revision",
  "title",
  "sheet",
  "totalSheets",
  "material",
  "materialStandard",
  "weight",
] as const;
export type TitleBlockField = (typeof TITLE_BLOCK_FIELDS)[number];

/** Colunas da tabela de componentes (lista de peças), todas como texto bruto. */
export const COMPONENT_COLUMNS = [
  "itemPosition",
  "componentNumber",
  "description",
  "quantity",
  "unit",
  "material",
] as const;
export type ComponentColumn = (typeof COMPONENT_COLUMNS)[number];

// ---------- Zod (validação no backend) ----------

/** Capitalização de enum não é garantida pela API: normaliza antes de validar. */
const lowerEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z.preprocess((v) => (typeof v === "string" ? v.trim().toLowerCase() : v), z.enum(values));

const text = z.string();
const nullableText = text.nullable();
const page = z.number().int().min(1);

/** Valor extraído de um campo, com evidência. */
export const extractedValueObject = z
  .object({
    status: lowerEnum(EXTRACTION_VALUE_STATUSES),
    /** Exatamente como aparece no documento (sem conversão de unidade nem correção). */
    rawValue: nullableText,
    page: page.nullable(),
    /** Trecho do documento que sustenta o valor. */
    snippet: nullableText,
    /** false = inferido (não escrito explicitamente no documento). */
    isExplicit: z.boolean(),
    /** Ambiguidade, conflito ou dúvida de leitura. */
    note: nullableText,
  })
  .strict();

export const extractedValueSchema = extractedValueObject.superRefine((v, ctx) => {
  if (v.status === "found") {
    if (v.rawValue === null || v.rawValue.trim() === "") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "found exige rawValue", path: ["rawValue"] });
    }
    if (v.page === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "found exige page", path: ["page"] });
    }
  }
  if (v.status === "not_found" && (v.rawValue !== null || v.snippet !== null)) {
    // Ausência nunca vem com valor: nada de dado inventado.
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "not_found não pode ter valor", path: ["rawValue"] });
  }
  if (v.status === "ambiguous" && (v.note === null || v.note.trim() === "")) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "ambiguous exige note explicando", path: ["note"] });
  }
});
export type ExtractedValue = z.infer<typeof extractedValueSchema>;

export const titleBlockObject = z
  .object(
    Object.fromEntries(TITLE_BLOCK_FIELDS.map((f) => [f, extractedValueSchema])) as Record<
      TitleBlockField,
      typeof extractedValueSchema
    >,
  )
  .strict();

export const documentTypeObject = z
  .object({
    classification: lowerEnum(DRAWING_DOCUMENT_TYPES),
    /** Texto do documento que justifica a classificação (ex.: "CONJUNTO SOLDADO"). */
    basis: extractedValueSchema,
  })
  .strict();

export const componentRowObject = z
  .object({
    ...(Object.fromEntries(COMPONENT_COLUMNS.map((c) => [c, nullableText])) as Record<
      ComponentColumn,
      typeof nullableText
    >),
    page,
    snippet: nullableText,
    isExplicit: z.boolean(),
    note: nullableText,
  })
  .strict();
export type ComponentRow = z.infer<typeof componentRowObject>;

export const componentTableObject = z
  .object({
    status: lowerEnum(EXTRACTION_VALUE_STATUSES),
    rows: z.array(componentRowObject),
    note: nullableText,
  })
  .strict();

export const componentTableSchema = componentTableObject.superRefine((t, ctx) => {
  if (t.status === "not_found" && t.rows.length > 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "not_found não pode ter linhas", path: ["rows"] });
  }
});

export const extractionIssueObject = z
  .object({
    type: lowerEnum(EXTRACTION_ISSUE_TYPES),
    page: page.nullable(),
    message: text,
  })
  .strict();

export const extractionOutputSchema = z
  .object({
    titleBlock: titleBlockObject,
    documentType: documentTypeObject,
    weightScope: lowerEnum(WEIGHT_SCOPES),
    componentTable: componentTableSchema,
    issues: z.array(extractionIssueObject),
  })
  .strict();
export type ExtractionOutput = z.infer<typeof extractionOutputSchema>;

/**
 * Valida a resposta da IA: forma (Zod) e regras que dependem do documento.
 * Resposta inválida não é "consertada": o job marca o resultado para revisão/retentativa.
 */
export function validateExtractionOutput(
  raw: unknown,
  ctx: { pageCount: number },
): { ok: true; data: ExtractionOutput } | { ok: false; errors: string[] } {
  const parsed = extractionOutputSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
  }
  const errors: string[] = [];
  const checkPage = (p: number | null, where: string) => {
    if (p !== null && p > ctx.pageCount) errors.push(`${where}: página ${p} além de ${ctx.pageCount}`);
  };
  const out = parsed.data;
  for (const f of TITLE_BLOCK_FIELDS) checkPage(out.titleBlock[f].page, `titleBlock.${f}.page`);
  checkPage(out.documentType.basis.page, "documentType.basis.page");
  out.componentTable.rows.forEach((r, i) => checkPage(r.page, `componentTable.rows.${i}.page`));
  out.issues.forEach((it, i) => checkPage(it.page, `issues.${i}.page`));
  return errors.length > 0 ? { ok: false, errors } : { ok: true, data: out };
}

// ---------- JSON Schema enviado à API (output_config.format) ----------

/**
 * Restrições da API (conferidas em 17/10/2026): todo objeto com `additionalProperties: false`;
 * sem recursão; sem `minimum`/`maximum`/`minLength`/`maxLength`/restrições complexas de array.
 * Por isso faixas (página ≥ 1, página ≤ total) e coerência entre campos ficam no Zod acima.
 * O teste `extraction.test.ts` garante que este schema e o Zod têm os mesmos campos.
 */
const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: "null" }] });
const jsonText = { type: "string" } as const;

const obj = (properties: Record<string, unknown>) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

const extractedValueJson = obj({
  status: { type: "string", enum: [...EXTRACTION_VALUE_STATUSES] },
  rawValue: nullable(jsonText),
  page: nullable({ type: "integer" }),
  snippet: nullable(jsonText),
  isExplicit: { type: "boolean" },
  note: nullable(jsonText),
});

export const extractionJsonSchema = {
  type: "object",
  $defs: {
    extractedValue: extractedValueJson,
  },
  properties: {
    titleBlock: obj(Object.fromEntries(TITLE_BLOCK_FIELDS.map((f) => [f, { $ref: "#/$defs/extractedValue" }]))),
    documentType: obj({
      classification: { type: "string", enum: [...DRAWING_DOCUMENT_TYPES] },
      basis: { $ref: "#/$defs/extractedValue" },
    }),
    weightScope: { type: "string", enum: [...WEIGHT_SCOPES] },
    componentTable: obj({
      status: { type: "string", enum: [...EXTRACTION_VALUE_STATUSES] },
      rows: {
        type: "array",
        items: obj({
          ...Object.fromEntries(COMPONENT_COLUMNS.map((c) => [c, nullable(jsonText)])),
          page: { type: "integer" },
          snippet: nullable(jsonText),
          isExplicit: { type: "boolean" },
          note: nullable(jsonText),
        }),
      },
      note: nullable(jsonText),
    }),
    issues: {
      type: "array",
      items: obj({
        type: { type: "string", enum: [...EXTRACTION_ISSUE_TYPES] },
        page: nullable({ type: "integer" }),
        message: jsonText,
      }),
    },
  },
  required: ["titleBlock", "documentType", "weightScope", "componentTable", "issues"],
  additionalProperties: false,
} as const;
