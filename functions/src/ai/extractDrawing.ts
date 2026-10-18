import Anthropic from "@anthropic-ai/sdk";
import {
  AI_EXTRACTION_CONFIG,
  extractionJsonSchema,
  validateExtractionOutput,
  type ExtractionOutput,
} from "@mecabom/shared";
import {
  DRAWING_EXTRACTION_SYSTEM_PROMPT,
  PROMPT_VERSION,
  VIEW_REGION_TOOL_DESCRIPTION,
  VIEW_REGION_TOOL_NAME,
  buildDrawingExtractionUserText,
  type NativeTextPage,
} from "./prompts/drawingExtraction.v2.js";
import { normalizeRect, type PdfRenderer } from "./render.js";

/**
 * Leitura de um desenho com o Claude (docs/AI_PIPELINE.md).
 *
 * Laço manual (não o tool runner) porque precisamos: limitar ampliações e tamanho total
 * das imagens, devolver imagens como resultado da ferramenta e testar com cliente falso.
 * O histórico é só acrescentado (nunca editado), como exige o pensamento preservado.
 * A saída final vem em `output_config.format` (JSON Schema) e é validada pelo Zod.
 */

type BetaParams = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;
type BetaMessage = Anthropic.Beta.Messages.BetaMessage;
type BetaContentBlockParam = Anthropic.Beta.Messages.BetaContentBlockParam;
type BetaToolResultBlockParam = Anthropic.Beta.Messages.BetaToolResultBlockParam;

/** Envia uma requisição e devolve a mensagem final (injeção para testes). */
export type CreateMessage = (params: BetaParams) => Promise<BetaMessage>;

export function anthropicCreateMessage(apiKey: string): CreateMessage {
  // Retentativas do SDK cobrem 429/5xx/conexão com backoff; timeout por requisição de 6 min.
  const client = new Anthropic({ apiKey, maxRetries: 4, timeout: 6 * 60_000 });
  return (params) => client.beta.messages.stream(params).finalMessage();
}

export type ExtractionErrorCode =
  | "ai_refusal"
  | "ai_max_tokens"
  | "ai_invalid_output"
  | "ai_too_many_turns"
  | "ai_no_output";

/** Falha da leitura que não adianta repetir automaticamente (vai para conferência manual). */
export class ExtractionError extends Error {
  constructor(
    readonly code: ExtractionErrorCode,
    message: string,
    readonly usage: ExtractionUsage,
  ) {
    super(message);
  }
}

export interface ExtractionUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  calls: number;
  regionViews: number;
}

export interface ExtractionRun {
  output: ExtractionOutput;
  usage: ExtractionUsage;
  readMode: "digital" | "scanned";
  modelId: string;
  servedBy: string;
  promptVersion: string;
  outputSchemaVersion: number;
}

/** Páginas com visão geral na primeira mensagem (desenhos têm 1–2 folhas; o resto via ampliação). */
export const MAX_OVERVIEW_PAGES = 6;
/** Teto de bytes de imagem por conversa (a API limita a requisição a 32 MB, e o base64 cresce ~33%). */
export const MAX_IMAGE_BYTES = 18 * 1024 * 1024;
/** Caracteres de texto nativo a partir dos quais o PDF é tratado como digital. */
const DIGITAL_TEXT_THRESHOLD = 40;

const viewRegionTool: Anthropic.Beta.Messages.BetaTool = {
  name: VIEW_REGION_TOOL_NAME,
  description: VIEW_REGION_TOOL_DESCRIPTION,
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      page: { type: "integer", description: "Página (a primeira é 1)." },
      x0: { type: "number", description: "Borda esquerda (0 a 1)." },
      y0: { type: "number", description: "Borda superior (0 a 1)." },
      x1: { type: "number", description: "Borda direita (0 a 1)." },
      y1: { type: "number", description: "Borda inferior (0 a 1)." },
    },
    required: ["page", "x0", "y0", "x1", "y1"],
    additionalProperties: false,
  },
};

function imageBlock(data: Buffer, mediaType: "image/jpeg"): Anthropic.Beta.Messages.BetaImageBlockParam {
  return { type: "image", source: { type: "base64", media_type: mediaType, data: data.toString("base64") } };
}

function textOf(message: BetaMessage): string {
  return message.content
    .filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

export async function extractDrawing(input: {
  pdf: PdfRenderer;
  createMessage: CreateMessage;
}): Promise<ExtractionRun> {
  const { pdf, createMessage } = input;
  const cfg = AI_EXTRACTION_CONFIG;
  const usage: ExtractionUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, calls: 0, regionViews: 0 };
  let imageBytes = 0;

  // 1. Visão geral + texto nativo.
  const pagesShown = Math.min(pdf.pageCount, MAX_OVERVIEW_PAGES);
  const firstContent: BetaContentBlockParam[] = [];
  const nativeText: NativeTextPage[] = [];
  let nativeChars = 0;
  for (let page = 1; page <= pagesShown; page++) {
    const img = await pdf.overview(page, cfg.imageLongEdgePx);
    imageBytes += img.data.length;
    firstContent.push({ type: "text", text: `Página ${page} (visão geral, ${img.width}×${img.height} px):` });
    firstContent.push(imageBlock(img.data, img.mediaType));
  }
  for (let page = 1; page <= pdf.pageCount; page++) {
    const lines = await pdf.nativeText(page);
    nativeChars += lines.reduce((n, l) => n + l.text.replace(/\s/g, "").length, 0);
    nativeText.push({ page, lines });
  }
  const readMode = nativeChars >= DIGITAL_TEXT_THRESHOLD ? "digital" : "scanned";
  firstContent.push({
    type: "text",
    text: buildDrawingExtractionUserText({
      pageCount: pdf.pageCount,
      pagesShown,
      nativeText: readMode === "digital" ? nativeText : null,
    }),
  });

  const messages: Anthropic.Beta.Messages.BetaMessageParam[] = [{ role: "user", content: firstContent }];
  const maxTurns = cfg.maxRegionViews + 4;
  let servedBy: string = cfg.modelId;

  for (let turn = 0; turn < maxTurns; turn++) {
    const params: BetaParams = {
      model: cfg.modelId,
      max_tokens: cfg.maxOutputTokens,
      system: [{ type: "text", text: DRAWING_EXTRACTION_SYSTEM_PROMPT }],
      // Cache automático do prefixo: cada volta reenvia as imagens anteriores.
      cache_control: { type: "ephemeral" },
      tools: [viewRegionTool],
      messages,
      output_config: {
        effort: cfg.effort,
        format: { type: "json_schema", schema: extractionJsonSchema as unknown as Record<string, unknown> },
      },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    };
    const msg = await createMessage(params);
    usage.calls += 1;
    usage.inputTokens += msg.usage.input_tokens + (msg.usage.cache_creation_input_tokens ?? 0) + (msg.usage.cache_read_input_tokens ?? 0);
    usage.cacheReadTokens += msg.usage.cache_read_input_tokens ?? 0;
    usage.outputTokens += msg.usage.output_tokens;
    servedBy = msg.model;

    if (msg.stop_reason === "refusal") {
      throw new ExtractionError("ai_refusal", "A IA recusou a leitura deste documento.", usage);
    }
    if (msg.stop_reason === "max_tokens") {
      throw new ExtractionError("ai_max_tokens", "A resposta da IA excedeu o limite de tamanho.", usage);
    }
    messages.push({ role: "assistant", content: msg.content });

    if (msg.stop_reason === "pause_turn") continue;

    const toolUses = msg.content.filter((b): b is Anthropic.Beta.Messages.BetaToolUseBlock => b.type === "tool_use");
    if (msg.stop_reason === "tool_use" && toolUses.length > 0) {
      const results: BetaToolResultBlockParam[] = [];
      for (const use of toolUses) {
        results.push(await runViewRegion(pdf, use, usage, () => imageBytes, (n) => (imageBytes += n)));
      }
      messages.push({ role: "user", content: results });
      continue;
    }

    const text = textOf(msg).trim();
    if (text === "") throw new ExtractionError("ai_no_output", "A IA não devolveu resultado.", usage);
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      throw new ExtractionError("ai_invalid_output", "A resposta da IA não é um JSON válido.", usage);
    }
    const validated = validateExtractionOutput(raw, { pageCount: pdf.pageCount });
    if (!validated.ok) {
      throw new ExtractionError("ai_invalid_output", `Resposta fora do contrato: ${validated.errors.slice(0, 5).join("; ")}`, usage);
    }
    return {
      output: validated.data,
      usage,
      readMode,
      modelId: cfg.modelId,
      servedBy,
      promptVersion: PROMPT_VERSION,
      outputSchemaVersion: cfg.outputSchemaVersion,
    };
  }
  throw new ExtractionError("ai_too_many_turns", "A leitura não terminou no número máximo de etapas.", usage);
}

async function runViewRegion(
  pdf: PdfRenderer,
  use: Anthropic.Beta.Messages.BetaToolUseBlock,
  usage: ExtractionUsage,
  bytesSoFar: () => number,
  addBytes: (n: number) => void,
): Promise<BetaToolResultBlockParam> {
  const error = (text: string): BetaToolResultBlockParam => ({
    type: "tool_result",
    tool_use_id: use.id,
    is_error: true,
    content: text,
  });
  if (use.name !== VIEW_REGION_TOOL_NAME) return error(`Ferramenta desconhecida: ${use.name}.`);
  if (usage.regionViews >= AI_EXTRACTION_CONFIG.maxRegionViews) {
    return error("Limite de ampliações atingido. Finalize a extração com o que já viu, marcando como incerto o que não conseguiu ler.");
  }
  const args = use.input as { page?: unknown; x0?: unknown; y0?: unknown; x1?: unknown; y1?: unknown };
  const page = Number(args.page);
  if (!Number.isInteger(page) || page < 1 || page > pdf.pageCount) {
    return error(`Página inválida. O documento tem ${pdf.pageCount} página(s).`);
  }
  const rect = normalizeRect({ x0: Number(args.x0), y0: Number(args.y0), x1: Number(args.x1), y1: Number(args.y1) });
  if (!rect) return error("Região inválida: use coordenadas entre 0 e 1, com largura e altura maiores que 0,01.");

  const img = await pdf.region(page, rect, AI_EXTRACTION_CONFIG.imageLongEdgePx);
  if (bytesSoFar() + img.data.length > MAX_IMAGE_BYTES) {
    return error("Limite de tamanho de imagens atingido. Finalize a extração com o que já viu.");
  }
  addBytes(img.data.length);
  usage.regionViews += 1;
  return {
    type: "tool_result",
    tool_use_id: use.id,
    content: [
      {
        type: "text",
        text: `Página ${page}, região x ${rect.x0.toFixed(3)}–${rect.x1.toFixed(3)}, y ${rect.y0.toFixed(3)}–${rect.y1.toFixed(3)} (${img.width}×${img.height} px). Restam ${AI_EXTRACTION_CONFIG.maxRegionViews - usage.regionViews} ampliações.`,
      },
      imageBlock(img.data, img.mediaType),
    ],
  };
}
