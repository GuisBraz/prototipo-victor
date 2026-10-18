import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  AI_EXTRACTION_CONFIG,
  COMPONENT_COLUMNS,
  TITLE_BLOCK_FIELDS,
  extractedValueSchema,
  extractionJsonSchema,
  extractionOutputSchema,
  validateExtractionOutput,
  type ExtractedValue,
} from "./extraction.js";

const notFound: ExtractedValue = {
  status: "not_found",
  rawValue: null,
  page: null,
  snippet: null,
  isExplicit: false,
  note: null,
};
const found = (rawValue: string, page = 1): ExtractedValue => ({
  status: "found",
  rawValue,
  page,
  snippet: rawValue,
  isExplicit: true,
  note: null,
});

/** Saída típica de um desenho de conjunto com tabela de componentes (dados fictícios). */
function sample() {
  return {
    titleBlock: {
      ...Object.fromEntries(TITLE_BLOCK_FIELDS.map((f) => [f, notFound])),
      drawingNumber: found("CJ-001"),
      revision: found("A"),
      title: found("SUPORTE SOLDADO"),
      weight: found("12,5 kg"),
    },
    documentType: { classification: "assembly", basis: found("CONJUNTO") },
    weightScope: "assembly",
    componentTable: {
      status: "found",
      rows: [
        {
          itemPosition: "1",
          componentNumber: "PC-101",
          revision: null,
          description: "CHAPA BASE",
          quantity: "2",
          unit: "PÇ",
          material: "SAE 1020",
          weight: null,
          page: 1,
          uncertainColumns: [],
          snippet: "1 PC-101 CHAPA BASE 2 PÇ SAE 1020",
          isExplicit: true,
          note: null,
        },
      ],
      note: null,
    },
    noteReferences: [],
    issues: [],
  };
}

describe("AI_EXTRACTION_CONFIG", () => {
  it("usa Claude Opus 5.5 como padrão e versiona prompt e schema", () => {
    expect(AI_EXTRACTION_CONFIG.modelId).toBe("claude-opus-5-5");
    expect(AI_EXTRACTION_CONFIG.promptVersion).toMatch(/\S/);
    expect(AI_EXTRACTION_CONFIG.outputSchemaVersion).toBeGreaterThanOrEqual(1);
  });
});

describe("extractedValueSchema", () => {
  it("aceita campo encontrado com evidência e campo ausente sem valor", () => {
    expect(extractedValueSchema.safeParse(found("CJ-001")).success).toBe(true);
    expect(extractedValueSchema.safeParse(notFound).success).toBe(true);
  });
  it("não aceita dado inventado: not_found com valor", () => {
    expect(extractedValueSchema.safeParse({ ...notFound, rawValue: "0" }).success).toBe(false);
  });
  it("found exige valor e página; ambiguous exige explicação", () => {
    expect(extractedValueSchema.safeParse({ ...found("x"), rawValue: " " }).success).toBe(false);
    expect(extractedValueSchema.safeParse({ ...found("x"), page: null }).success).toBe(false);
    expect(extractedValueSchema.safeParse({ ...found("A ou B"), status: "ambiguous" }).success).toBe(false);
    expect(
      extractedValueSchema.safeParse({ ...found("A ou B"), status: "ambiguous", note: "duas revisões" }).success,
    ).toBe(true);
  });
  it("rejeita página zero e campos extras", () => {
    expect(extractedValueSchema.safeParse(found("x", 0)).success).toBe(false);
    expect(extractedValueSchema.safeParse({ ...found("x"), confidence: 0.9 }).success).toBe(false);
  });
  it("normaliza a capitalização dos enums", () => {
    const r = extractedValueSchema.safeParse({ ...found("x"), status: "FOUND" });
    expect(r.success && r.data.status).toBe("found");
  });
});

describe("validateExtractionOutput", () => {
  it("aceita saída válida", () => {
    expect(validateExtractionOutput(sample(), { pageCount: 1 }).ok).toBe(true);
  });
  it("rejeita página além do total do documento", () => {
    const s = sample();
    s.componentTable.rows[0]!.page = 3;
    const r = validateExtractionOutput(s, { pageCount: 2 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toContain("componentTable.rows.0.page");
  });
  it("tabela ausente não pode trazer linhas", () => {
    const s = sample();
    s.componentTable.status = "not_found";
    expect(validateExtractionOutput(s, { pageCount: 1 }).ok).toBe(false);
  });
  it("rejeita campo da legenda faltando (o modelo não pode omitir campos)", () => {
    const s = sample() as Record<string, unknown>;
    const tb = { ...(s.titleBlock as Record<string, unknown>) };
    delete tb.revision;
    expect(validateExtractionOutput({ ...s, titleBlock: tb }, { pageCount: 1 }).ok).toBe(false);
  });
});

// ---------- O JSON Schema da API e o Zod precisam descrever o mesmo contrato ----------

type Json = Record<string, unknown>;
const FORBIDDEN = ["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf", "minLength", "maxLength", "minItems", "maxItems", "uniqueItems", "pattern"];

function resolve(node: Json): Json {
  const ref = node.$ref as string | undefined;
  if (!ref) return node;
  const name = ref.replace("#/$defs/", "");
  return (extractionJsonSchema.$defs as unknown as Record<string, Json>)[name]!;
}

/** Remove wrappers do Zod (superRefine, preprocess, nullable) até o tipo base. */
function unwrap(s: z.ZodTypeAny): z.ZodTypeAny {
  if (s instanceof z.ZodEffects) return unwrap(s._def.schema);
  if (s instanceof z.ZodNullable) return unwrap(s._def.innerType);
  return s;
}

function compare(json: Json, zod: z.ZodTypeAny, path: string) {
  json = resolve(json);
  for (const k of FORBIDDEN) expect(json, `${path} usa ${k}`).not.toHaveProperty(k);
  if (json.anyOf) {
    const branches = json.anyOf as Json[];
    expect(branches.some((b) => b.type === "null"), `${path} anyOf sem null`).toBe(true);
    expect(zod.isNullable(), `${path}: JSON aceita null e Zod não`).toBe(true);
    return compare(branches.find((b) => b.type !== "null")!, unwrap(zod), path);
  }
  expect(zod.isNullable(), `${path}: Zod aceita null e JSON não`).toBe(false);
  const base = unwrap(zod);
  if (json.type === "object") {
    expect(base, path).toBeInstanceOf(z.ZodObject);
    const shape = (base as z.ZodObject<z.ZodRawShape>).shape;
    const props = json.properties as Record<string, Json>;
    expect(json.additionalProperties, `${path} additionalProperties`).toBe(false);
    expect([...(json.required as string[])].sort(), `${path} required`).toEqual(Object.keys(props).sort());
    expect(Object.keys(props).sort(), `${path} campos`).toEqual(Object.keys(shape).sort());
    for (const key of Object.keys(props)) compare(props[key]!, shape[key]!, `${path}.${key}`);
  } else if (json.type === "array") {
    expect(base, path).toBeInstanceOf(z.ZodArray);
    compare(json.items as Json, (base as z.ZodArray<z.ZodTypeAny>).element, `${path}[]`);
  } else if (json.enum) {
    expect(base, path).toBeInstanceOf(z.ZodEnum);
    expect([...(json.enum as string[])].sort()).toEqual([...(base as z.ZodEnum<[string]>).options].sort());
  } else if (json.type === "string") {
    expect(base, path).toBeInstanceOf(z.ZodString);
  } else if (json.type === "integer") {
    expect(base, path).toBeInstanceOf(z.ZodNumber);
    expect((base as z.ZodNumber).isInt, `${path} inteiro`).toBe(true);
  } else if (json.type === "boolean") {
    expect(base, path).toBeInstanceOf(z.ZodBoolean);
  } else {
    throw new Error(`${path}: tipo não tratado no teste`);
  }
}

describe("extractionJsonSchema", () => {
  it("tem os mesmos campos, tipos, enums e nulos que o Zod", () => {
    compare(extractionJsonSchema as unknown as Json, extractionOutputSchema, "$");
  });
  it("cobre todos os campos da legenda e colunas da tabela", () => {
    const tb = extractionJsonSchema.properties.titleBlock.properties;
    expect(Object.keys(tb).sort()).toEqual([...TITLE_BLOCK_FIELDS].sort());
    const row = extractionJsonSchema.properties.componentTable.properties.rows.items.properties;
    for (const c of COMPONENT_COLUMNS) expect(row).toHaveProperty(c);
  });
  it("não usa recursão: $defs não se referenciam", () => {
    expect(JSON.stringify(extractionJsonSchema.$defs)).not.toContain("$ref");
  });
});
