import { describe, expect, it } from "vitest";
import { bomTotals, pendingLines, summarizeDocuments, visibleBomLines } from "./bom";
import { demoBom, demoDocuments } from "./data";
import { toCsv, exportRows } from "./exportBom";
import { toXlsx } from "./exportBom";
import { buildXlsx, columnLetter, crc32, safeSheetName } from "./xlsx";
import { formatKg, normalizeText } from "./format";

const none = new Set<string>();

describe("documentos", () => {
  it("contagens derivadas da lista", () => {
    expect(demoDocuments).toHaveLength(8);
    expect(summarizeDocuments()).toEqual({ registered: 8, processed: 6, reviewPending: 1, queued: 1 });
  });
});

describe("BOM", () => {
  it("totais: peso parcial só de componentes com peso, sem inventar o do conjunto", () => {
    const t = bomTotals(demoBom);
    expect(t.assemblies).toBe(1);
    expect(t.components).toBe(4);
    expect(t.pieces).toBe(8);
    // 2×12,5 + 4×8,2 + 1×5,1 + 1×2,8 = 65,7 kg
    expect(t.partialWeightGrams).toBe(65_700);
    expect(t.componentsWithoutWeight).toBe(0);
    expect(t.weightedToCheck).toBe(1);
    expect(t.byState).toEqual({ validated: 3, check: 2, not_found: 0 });
    expect(formatKg(t.partialWeightGrams)).toBe("65,70");
  });
  it("pendências: itens que não estão validados", () => {
    expect(pendingLines(demoBom).map((l) => l.code)).toEqual(["CJ-001", "PC-103"]);
  });
  it("sem filtro respeita recolhimento", () => {
    expect(visibleBomLines(demoBom, { query: "", state: "all", collapsed: none })).toHaveLength(5);
    expect(visibleBomLines(demoBom, { query: "", state: "all", collapsed: new Set(["1"]) })).toHaveLength(1);
  });
  it("busca ignora acento/caixa e mantém o conjunto-pai", () => {
    const r = visibleBomLines(demoBom, { query: "SUPORTE", state: "all", collapsed: new Set(["1"]) });
    expect(r.map((l) => l.code)).toEqual(["CJ-001", "PC-102"]);
    expect(visibleBomLines(demoBom, { query: "pc-10", state: "all", collapsed: none })).toHaveLength(5);
    expect(visibleBomLines(demoBom, { query: "xyz", state: "all", collapsed: none })).toHaveLength(0);
  });
  it("filtro por estado", () => {
    expect(visibleBomLines(demoBom, { query: "", state: "check", collapsed: none }).map((l) => l.code)).toEqual(["CJ-001", "PC-103"]);
    expect(visibleBomLines(demoBom, { query: "", state: "not_found", collapsed: none })).toHaveLength(0);
  });
  it("normalizeText", () => expect(normalizeText("  AÇO Inox ")).toBe("aco inox"));
});

describe("exportação", () => {
  it("CSV: BOM utf-8, ';', vírgula decimal, vazio onde não há dado", () => {
    const csv = toCsv(demoBom);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const lines = csv.replace(/\r\n$/, "").split("\r\n");
    expect(lines).toHaveLength(6);
    expect(lines[0]).toBe("﻿Item;Código;Descrição;Quantidade;Unidade;Material;Peso unitário (kg);Peso total (kg);Estado");
    expect(lines[2]).toBe("1.1;PC-101;Base de fixação;2;un;Aço carbono;12,50;25,00;Validado");
    expect(lines[1]).toBe("1;CJ-001;Conjunto principal;1;un;Conforme especificação do conjunto;;;Conferir");
  });
  it("linhas exportadas usam null (não zero) quando falta peso", () => {
    expect(exportRows(demoBom)[0]![6]).toBeNull();
  });
  it("XLSX: zip válido com as partes obrigatórias", () => {
    const bytes = toXlsx(demoBom);
    expect([bytes[0], bytes[1]]).toEqual([0x50, 0x4b]);
    const text = new TextDecoder().decode(bytes);
    for (const p of ["[Content_Types].xml", "xl/workbook.xml", "xl/worksheets/sheet1.xml", "xl/styles.xml"]) expect(text).toContain(p);
    expect(text).toContain("Base de fixação");
  });
  it("crc32 conhecido", () => expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926));
  it("helpers do xlsx", () => {
    expect(columnLetter(0)).toBe("A");
    expect(columnLetter(26)).toBe("AA");
    expect(safeSheetName("a/b:c")).toBe("a b c");
    expect(buildXlsx([{ name: "x", rows: [["<&>"]] }]).length).toBeGreaterThan(100);
  });
});
