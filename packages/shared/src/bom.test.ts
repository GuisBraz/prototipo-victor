import { describe, expect, it } from "vitest";
import {
  buildBom,
  compareRevisions,
  drawingRecordFromExtraction,
  parseDecimal,
  parseQuantity,
  parseWeightKg,
  type CheckedValue,
  type ComponentRecord,
  type DrawingRecord,
} from "./bom.js";
import { TITLE_BLOCK_FIELDS, type ExtractedValue, type ExtractionOutput } from "./extraction.js";

const ok = <T>(value: T | null): CheckedValue<T> => ({ value, check: null });

let seq = 0;
function row(code: string | null, qty: number | null, extra: Partial<ComponentRecord> = {}): ComponentRecord {
  const i = seq++;
  return {
    rowIndex: i,
    position: ok(String(i + 1)),
    componentNumber: ok(code),
    revision: ok(null),
    description: ok(code ? `DESC ${code}` : "PARAFUSO M10"),
    quantity: ok(qty),
    weightKg: ok(null),
    evidence: { page: 1, snippet: null },
    ...extra,
  };
}

function drawing(number: string, opts: { rev?: string; weight?: number | null; rows?: ComponentRecord[]; notes?: string[] } = {}): DrawingRecord {
  return {
    documentId: `doc-${number}-${opts.rev ?? "A"}`,
    fileName: `${number}.pdf`,
    drawingNumber: ok(number),
    revision: ok(opts.rev ?? "A"),
    title: ok(`TITULO ${number}`),
    unitWeightKg: ok(opts.weight === undefined ? 1 : opts.weight),
    documentType: opts.rows?.length ? "assembly" : "part",
    hasComponentTable: (opts.rows?.length ?? 0) > 0,
    rows: opts.rows ?? [],
    noteReferences: opts.notes ?? [],
    readIssues: [],
    readMode: "digital",
    pageCount: 1,
  };
}

const flat = (r: ReturnType<typeof buildBom>) =>
  r.rows.map((x) => `${"  ".repeat(x.level)}${x.drawingNumber}:${x.quantityTotal}`);

describe("conversões", () => {
  it("decimal com vírgula, ponto e milhar", () => {
    expect(parseDecimal("12,5")).toEqual({ value: 12.5, ambiguous: false });
    expect(parseDecimal("12.5")).toEqual({ value: 12.5, ambiguous: false });
    expect(parseDecimal("1.234,5")).toEqual({ value: 1234.5, ambiguous: false });
    expect(parseDecimal("1.250")).toEqual({ value: 1.25, ambiguous: true });
    expect(parseDecimal("abc")).toBeNull();
  });

  it("quantidade: número, unidade de peça e casos para conferir", () => {
    expect(parseQuantity("2")).toEqual({ value: 2, check: null });
    expect(parseQuantity("02 PÇ")).toEqual({ value: 2, check: null });
    expect(parseQuantity("4x")).toEqual({ value: 4, check: null });
    expect(parseQuantity("2,5 M").check).toMatch(/não é peça/);
    expect(parseQuantity("A/R")).toEqual({ value: null, check: 'Quantidade "A/R" não é um número' });
    expect(parseQuantity(null).value).toBeNull();
  });

  it("peso em kg, g e t; sem unidade pede conferência", () => {
    expect(parseWeightKg("12,5 kg")).toEqual({ value: 12.5, check: null });
    expect(parseWeightKg("850 g")).toEqual({ value: 0.85, check: null });
    expect(parseWeightKg("1,2 t")).toEqual({ value: 1200, check: null });
    expect(parseWeightKg("3,4").check).toMatch(/sem unidade/);
    expect(parseWeightKg(null).check).toMatch(/não encontrado/);
  });

  it("ordem de revisões", () => {
    expect(compareRevisions("B", "A")).toBeGreaterThan(0);
    expect(compareRevisions("10", "9")).toBeGreaterThan(0);
    expect(compareRevisions("AA", "Z")).toBeGreaterThan(0);
  });
});

describe("hierarquia", () => {
  it("conjunto → subconjunto → peça, com quantidade multiplicada (2 × 3 = 6)", () => {
    const peca = drawing("DT-101", { weight: 2.5 });
    const sub = drawing("SC-010", { rows: [row("DT-101", 3)] });
    const cj = drawing("CJ-001", { rows: [row("SC-010", 2)] });
    const r = buildBom([peca, cj, sub]);
    expect(flat(r)).toEqual(["CJ-001:1", "  SC-010:2", "    DT-101:6"]);
    const last = r.rows[2]!;
    expect(last.unitWeightKg).toBe(2.5);
    expect(last.totalWeightKg).toBe(15);
    expect(last.position).toBeTruthy();
    expect(r.summary.rootAssemblies).toBe(1);
  });

  it("peça usada em dois subconjuntos aparece sob cada um", () => {
    const peca = drawing("DT-1");
    const a = drawing("SC-A", { rows: [row("DT-1", 2)] });
    const b = drawing("SC-B", { rows: [row("DT-1", 5)] });
    const cj = drawing("CJ", { rows: [row("SC-A", 1), row("SC-B", 2)] });
    expect(flat(buildBom([peca, a, b, cj]))).toEqual(["CJ:1", "  SC-A:1", "    DT-1:2", "  SC-B:2", "    DT-1:10"]);
  });

  it("item sem desenho no lote fica marcado para conferir", () => {
    const cj = drawing("CJ", { rows: [row("ROL-6205", 2), row(null, 8)] });
    const r = buildBom([cj]);
    expect(r.rows[1]!.kind).toBe("no_drawing");
    expect(r.rows[1]!.checks.drawingNumber).toMatch(/não está no lote/);
    expect(r.rows[2]!.checks.drawingNumber).toMatch(/sem código/);
    expect(r.rows[2]!.quantityTotal).toBe(8);
    expect(r.summary.itemsWithoutDrawing).toBe(2);
  });

  it("desenho citado só em nota fica fora da BOM e vai ao relatório como detalhe", () => {
    const detalhe = drawing("DET-9");
    const peca = drawing("DT-1");
    const cj = drawing("CJ", { rows: [row("DT-1", 1)], notes: ["DET-9"] });
    const r = buildBom([detalhe, peca, cj]);
    expect(r.rows.map((x) => x.drawingNumber)).toEqual(["CJ", "DT-1"]);
    expect(r.drawings.find((d) => d.drawingNumber === "DET-9")!.role).toBe("detail_in_note");
    expect(r.summary.detailDrawings).toBe(1);
  });

  it("desenho que ninguém chama entra no fim com quantidade a definir", () => {
    const solto = drawing("DT-SOLTO");
    const cj = drawing("CJ", { rows: [row("DT-1", 1)] });
    const r = buildBom([solto, cj, drawing("DT-1")]);
    const last = r.rows[r.rows.length - 1]!;
    expect(last.kind).toBe("unreferenced");
    expect(last.quantityTotal).toBeNull();
    expect(last.checks.quantity).toMatch(/quantidade a definir/);
    expect(r.issues.some((i) => i.drawing === "DT-SOLTO")).toBe(true);
  });

  it("revisão citada na lista diferente da revisão do desenho", () => {
    const peca = drawing("DT-1", { rev: "C" });
    const cj = drawing("CJ", { rows: [row("DT-1", 1, { revision: ok("B") })] });
    const r = buildBom([peca, cj]);
    expect(r.rows[1]!.revision).toBe("C");
    expect(r.rows[1]!.checks.revision).toMatch(/rev\. B.*rev\. C/);
    expect(r.issues[0]!.severity).toBe("high");
  });

  it("mesmo desenho com duas revisões: usa a mais recente e avisa", () => {
    const a = drawing("DT-1", { rev: "A" });
    const b = drawing("DT-1", { rev: "B" });
    const cj = drawing("CJ", { rows: [row("DT-1", 1)] });
    const r = buildBom([a, b, cj]);
    expect(r.rows[1]!.revision).toBe("B");
    expect(r.drawings.find((d) => d.documentId === a.documentId)!.role).toBe("duplicate");
    expect(r.issues.some((i) => /revisões diferentes/.test(i.message))).toBe(true);
  });

  it("ciclo é detectado e não trava", () => {
    const a = drawing("A", { rows: [row("B", 1)] });
    const b = drawing("B", { rows: [row("A", 1)] });
    const r = buildBom([a, b]);
    expect(r.issues.some((i) => /ciclo/i.test(i.message))).toBe(true);
    expect(r.rows.length).toBeLessThan(10);
  });

  it("quantidade ausente não vira zero: total vazio e conferir", () => {
    const peca = drawing("DT-1", { weight: 3 });
    const cj = drawing("CJ", { rows: [row("DT-1", null, { quantity: { value: null, check: "Quantidade não informada" } })] });
    const r = buildBom([peca, cj]);
    expect(r.rows[1]!.quantityTotal).toBeNull();
    expect(r.rows[1]!.totalWeightKg).toBeNull();
    expect(r.rows[1]!.checks.quantity).toBeTruthy();
    expect(r.rows[1]!.checks.totalWeight).toBeTruthy();
  });

  it("código na lista com separador diferente casa de forma aproximada e pede conferência", () => {
    const peca = drawing("DT-101");
    const cj = drawing("CJ", { rows: [row("DT.101", 1)] });
    const r = buildBom([peca, cj]);
    expect(r.rows[1]!.documentId).toBe(peca.documentId);
    expect(r.rows[1]!.checks.drawingNumber).toMatch(/separadores/);
  });

  it("peso divergente entre desenho e lista de materiais", () => {
    const peca = drawing("DT-1", { weight: 10 });
    const cj = drawing("CJ", { rows: [row("DT-1", 2, { weightKg: ok(12) })] });
    const r = buildBom([peca, cj]);
    expect(r.rows[1]!.unitWeightKg).toBe(10);
    expect(r.rows[1]!.checks.unitWeight).toMatch(/10 kg.*12 kg/);
  });
});

// ---------- Extração → registro ----------

const nf: ExtractedValue = { status: "not_found", rawValue: null, page: null, snippet: null, isExplicit: false, note: null };
const fv = (rawValue: string): ExtractedValue => ({ status: "found", rawValue, page: 1, snippet: rawValue, isExplicit: true, note: null });

function extraction(): ExtractionOutput {
  return {
    titleBlock: {
      ...(Object.fromEntries(TITLE_BLOCK_FIELDS.map((f) => [f, nf])) as ExtractionOutput["titleBlock"]),
      drawingNumber: fv("CJ-001"),
      revision: { status: "ambiguous", rawValue: "B", page: 1, snippet: "REV B", isExplicit: true, note: "pode ser 8" },
      title: fv("REDUTOR"),
      weight: fv("250 kg"),
    },
    documentType: { classification: "assembly", basis: fv("CONJUNTO") },
    weightScope: "assembly",
    componentTable: {
      status: "found",
      note: null,
      rows: [
        {
          itemPosition: "1",
          componentNumber: "DT-101",
          revision: null,
          description: "EIXO",
          quantity: "2",
          unit: "PÇ",
          material: null,
          weight: "18,5",
          page: 1,
          snippet: "1 DT-101 EIXO 2",
          isExplicit: true,
          uncertainColumns: ["quantity"],
          note: "quantidade borrada",
        },
      ],
    },
    noteReferences: [{ drawingNumber: "DET-5", page: 1, snippet: "VER DET-5" }],
    issues: [{ type: "illegible", page: 1, message: "canto inferior cortado" }],
  };
}

describe("drawingRecordFromExtraction", () => {
  it("leva ambiguidade e incerteza por célula para 'conferir'", () => {
    const r = drawingRecordFromExtraction({ documentId: "d1", fileName: "cj.pdf", extraction: extraction() });
    expect(r.drawingNumber).toMatchObject({ value: "CJ-001", check: null });
    expect(r.revision.check).toMatch(/pode ser 8/);
    expect(r.unitWeightKg.value).toBe(250);
    expect(r.rows[0]!.quantity).toMatchObject({ value: 2 });
    expect(r.rows[0]!.quantity.check).toMatch(/borrada/);
    expect(r.rows[0]!.weightKg.check).toMatch(/sem unidade/);
    expect(r.noteReferences).toEqual(["DET-5"]);
    expect(r.readIssues[0]).toMatch(/cortado/);
  });

  it("correção da pessoa substitui o valor e limpa o 'conferir'", () => {
    const r = drawingRecordFromExtraction({
      documentId: "d1",
      fileName: "cj.pdf",
      extraction: extraction(),
      overrides: { revision: { value: "B" }, "rows.0.quantity": { value: "3" } },
    });
    expect(r.revision).toMatchObject({ value: "B", check: null });
    expect(r.rows[0]!.quantity).toMatchObject({ value: 3, check: null });
  });

  it("campo não encontrado nunca vira valor", () => {
    const ex = extraction();
    ex.titleBlock.weight = nf;
    const r = drawingRecordFromExtraction({ documentId: "d1", fileName: "cj.pdf", extraction: ex });
    expect(r.unitWeightKg.value).toBeNull();
    expect(r.unitWeightKg.check).toMatch(/não encontrado/);
  });
});

describe("conferência: origem das células, 'conferido' e quantidade avulsa", () => {
  it("cada célula aponta o desenho e o campo de onde veio", () => {
    const peca = drawing("DT-1", { weight: 2 });
    const cj = drawing("CJ", { rows: [row("DT-1", 3), row(null, 4)] });
    const r = buildBom([peca, cj]);
    const filho = r.rows[1]!;
    const idx = cj.rows[0]!.rowIndex;
    expect(filho.sources.quantity).toEqual({ documentId: cj.documentId, field: `rows.${idx}.quantity` });
    expect(filho.sources.unitWeight).toEqual({ documentId: peca.documentId, field: "weight" });
    expect(filho.sources.drawingNumber).toEqual({ documentId: peca.documentId, field: "drawingNumber" });
    expect(r.rows[2]!.sources.drawingNumber!.field).toMatch(/componentNumber$/);
    expect(r.rows[0]!.sources.quantity).toEqual({ documentId: cj.documentId, field: "quantity" });
  });

  it("marcar como conferido remove o amarelo daquela célula", () => {
    const cj = drawing("CJ", { rows: [row("ROL-1", 2)] });
    const field = `rows.${cj.rows[0]!.rowIndex}.componentNumber`;
    expect(buildBom([cj]).rows[1]!.checks.drawingNumber).toBeTruthy();
    const conferido = { ...cj, acks: [field] };
    expect(buildBom([conferido]).rows[1]!.checks.drawingNumber).toBeUndefined();
  });

  it("quantidade definida para desenho avulso entra no cálculo", () => {
    const solto = { ...drawing("DT-SOLTO", { weight: 5 }), rootQuantity: { value: 3, check: null } };
    const r = buildBom([solto]);
    expect(r.rows[0]).toMatchObject({ kind: "unreferenced", quantityTotal: 3, totalWeightKg: 15 });
    expect(r.rows[0]!.checks.quantity).toBeUndefined();
  });

  it("extração: override 'quantity' e chaves 'ack.' viram rootQuantity e acks", () => {
    const rec = drawingRecordFromExtraction({
      documentId: "d1",
      fileName: "x.pdf",
      extraction: extraction(),
      overrides: { quantity: { value: "2" }, "ack.revision": { value: null } },
    });
    expect(rec.rootQuantity).toMatchObject({ value: 2, check: null });
    expect(rec.acks).toEqual(["revision"]);
  });
});
