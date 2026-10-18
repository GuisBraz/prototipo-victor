import type Anthropic from "@anthropic-ai/sdk";
import { AI_EXTRACTION_CONFIG, TITLE_BLOCK_FIELDS, type ExtractionOutput } from "@mecabom/shared";
import { describe, expect, it } from "vitest";
import { ExtractionError, extractDrawing, type CreateMessage } from "./extractDrawing.js";
import type { PdfRenderer } from "./render.js";

type Msg = Anthropic.Beta.Messages.BetaMessage;
type Params = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;

/** PDF falso: uma página, imagem mínima, texto nativo opcional. */
function fakePdf(text: string[] = ["CJ-001 REV A", "CONJUNTO PRINCIPAL DE SUPORTE", "LISTA DE MATERIAIS"]): PdfRenderer & { regions: number } {
  const img = { mediaType: "image/jpeg" as const, data: Buffer.from([0xff, 0xd8, 0xff]), width: 100, height: 70 };
  const pdf = {
    regions: 0,
    pageCount: 1,
    pageSize: async () => ({ width: 1190, height: 842 }),
    overview: async () => img,
    region: async () => {
      pdf.regions += 1;
      return img;
    },
    nativeText: async () => text.map((t, i) => ({ x: 0.8, y: 0.9 + i * 0.01, text: t })),
    close: async () => undefined,
  };
  return pdf;
}

const usage = { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };

function message(partial: Partial<Msg>): Msg {
  return {
    id: "msg",
    type: "message",
    role: "assistant",
    model: AI_EXTRACTION_CONFIG.modelId,
    content: [],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage,
    ...partial,
  } as unknown as Msg;
}

const nf = { status: "not_found", rawValue: null, page: null, snippet: null, isExplicit: false, note: null } as const;
function validOutput(): ExtractionOutput {
  return {
    titleBlock: {
      ...(Object.fromEntries(TITLE_BLOCK_FIELDS.map((f) => [f, nf])) as ExtractionOutput["titleBlock"]),
      drawingNumber: { status: "found", rawValue: "CJ-001", page: 1, snippet: "CJ-001", isExplicit: true, note: null },
    },
    documentType: { classification: "assembly", basis: nf },
    weightScope: "unknown",
    componentTable: { status: "not_found", rows: [], note: null },
    noteReferences: [],
    issues: [],
  };
}

const toolUse = (id: string, input: Record<string, unknown>) =>
  message({
    stop_reason: "tool_use",
    content: [{ type: "tool_use", id, name: "view_region", input } as Anthropic.Beta.Messages.BetaToolUseBlock],
  });
const final = (json: unknown) => message({ content: [{ type: "text", text: JSON.stringify(json), citations: null } as Anthropic.Beta.Messages.BetaTextBlock] });

function scripted(responses: Msg[]): CreateMessage & { calls: Params[] } {
  const calls: Params[] = [];
  const fn = (async (params: Params) => {
    calls.push(structuredClone(params));
    const next = responses.shift();
    if (!next) throw new Error("sem resposta roteirizada");
    return next;
  }) as CreateMessage & { calls: Params[] };
  fn.calls = calls;
  return fn;
}

describe("extractDrawing", () => {
  it("amplia uma região e devolve a extração validada", async () => {
    const pdf = fakePdf();
    const create = scripted([toolUse("t1", { page: 1, x0: 0.6, y0: 0.7, x1: 1, y1: 1 }), final(validOutput())]);
    const run = await extractDrawing({ pdf, createMessage: create });

    expect(run.output.titleBlock.drawingNumber.rawValue).toBe("CJ-001");
    expect(run.readMode).toBe("digital");
    expect(run.usage).toMatchObject({ calls: 2, regionViews: 1, inputTokens: 200, outputTokens: 100 });
    expect(pdf.regions).toBe(1);

    const first = create.calls[0]!;
    expect(first.model).toBe("claude-opus-5-5");
    expect(first.output_config?.effort).toBe("high");
    expect(first.output_config?.format?.type).toBe("json_schema");
    expect(first.fallbacks).toBe("default");
    expect(first.betas).toContain("server-side-fallback-2026-07-01");
    expect(first.tools?.[0]).toMatchObject({ name: "view_region", strict: true });

    // Segunda volta: histórico só acrescentado, com o resultado da ferramenta contendo a imagem.
    const second = create.calls[1]!;
    expect(second.messages).toHaveLength(3);
    const toolResult = (second.messages[2]!.content as Anthropic.Beta.Messages.BetaToolResultBlockParam[])[0]!;
    expect(toolResult.tool_use_id).toBe("t1");
    expect(JSON.stringify(toolResult.content)).toContain('"type":"image"');
  });

  it("PDF sem texto nativo é tratado como escaneado", async () => {
    const create = scripted([final(validOutput())]);
    const run = await extractDrawing({ pdf: fakePdf([]), createMessage: create });
    expect(run.readMode).toBe("scanned");
    const userText = JSON.stringify(create.calls[0]!.messages[0]!.content);
    expect(userText).toContain("não tem texto nativo");
  });

  it("região inválida volta como erro para a IA, sem renderizar", async () => {
    const pdf = fakePdf();
    const create = scripted([toolUse("t1", { page: 7, x0: 0, y0: 0, x1: 1, y1: 1 }), final(validOutput())]);
    await extractDrawing({ pdf, createMessage: create });
    expect(pdf.regions).toBe(0);
    const result = (create.calls[1]!.messages[2]!.content as Anthropic.Beta.Messages.BetaToolResultBlockParam[])[0]!;
    expect(result.is_error).toBe(true);
  });

  it("respeita o limite de ampliações", async () => {
    const pdf = fakePdf();
    const max = AI_EXTRACTION_CONFIG.maxRegionViews;
    const views = Array.from({ length: max + 1 }, (_, i) => toolUse(`t${i}`, { page: 1, x0: 0, y0: 0, x1: 0.5, y1: 0.5 }));
    const create = scripted([...views, final(validOutput())]);
    const run = await extractDrawing({ pdf, createMessage: create });
    expect(pdf.regions).toBe(max);
    expect(run.usage.regionViews).toBe(max);
  });

  it("recusa, corte por tamanho e saída fora do contrato viram ExtractionError", async () => {
    await expect(extractDrawing({ pdf: fakePdf(), createMessage: scripted([message({ stop_reason: "refusal" })]) })).rejects.toMatchObject({ code: "ai_refusal" });
    await expect(extractDrawing({ pdf: fakePdf(), createMessage: scripted([message({ stop_reason: "max_tokens" })]) })).rejects.toMatchObject({ code: "ai_max_tokens" });
    const bad = { ...validOutput(), weightScope: "galáxia" };
    const err = await extractDrawing({ pdf: fakePdf(), createMessage: scripted([final(bad)]) }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ExtractionError);
    expect((err as ExtractionError).code).toBe("ai_invalid_output");
    expect((err as ExtractionError).usage.calls).toBe(1);
  });
});
