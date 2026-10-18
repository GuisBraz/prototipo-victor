import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { buildBom, type CheckedValue, type ComponentRecord, type DrawingRecord } from "@mecabom/shared";
import { FIRST_DATA_ROW, buildControleXlsx } from "./controleWorkbook.js";

const template = readFileSync(fileURLToPath(new URL("../../public/templates/controle-de-avanco.xlsx", import.meta.url)));

const ok = <T>(value: T | null): CheckedValue<T> => ({ value, check: null });
const row = (i: number, code: string, qty: number): ComponentRecord => ({
  rowIndex: i,
  position: ok(String(i + 1)),
  componentNumber: ok(code),
  revision: ok<string>(null),
  description: ok(`DESC ${code}`),
  quantity: ok(qty),
  weightKg: ok<number>(null),
  evidence: { page: 1, snippet: null },
});
const drawing = (n: string, weight: CheckedValue<number>, rows: ComponentRecord[] = []): DrawingRecord => ({
  documentId: n,
  fileName: `${n}.pdf`,
  drawingNumber: ok(n),
  revision: ok("A"),
  title: ok(`TITULO ${n}`),
  unitWeightKg: weight,
  documentType: rows.length ? "assembly" : "part",
  hasComponentTable: rows.length > 0,
  rows,
  noteReferences: [],
  readIssues: [],
  readMode: "digital",
  pageCount: 1,
});

describe("planilha Controle de Avanço", () => {
  it("preenche B–H a partir da linha 9, mantém o modelo e marca 'conferir' em amarelo", async () => {
    const bom = buildBom([
      drawing("CJ-001", ok(250), [row(0, "DT-101", 2)]),
      drawing("DT-101", { value: 18.5, check: "Peso borrado" }),
    ]);
    const bytes = await buildControleXlsx(template, bom, {
      projectName: "Teste",
      generatedAt: new Date("2026-10-18T12:00:00Z"),
      generatedBy: "teste@exemplo.com",
      modelId: "claude-opus-5-5",
      promptVersion: "drawing-extraction.v2",
    });

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes);
    const ws = wb.worksheets[0]!;
    expect(ws.name).toBe("Planilha1");
    // Cabeçalho do modelo intacto.
    expect(ws.getCell("B8").value).toBe("DESENHO");
    expect(ws.getCell("AA8").value).toBe("Avanço Usi(%)");

    const r1 = FIRST_DATA_ROW;
    const r2 = FIRST_DATA_ROW + 1;
    expect(ws.getCell(`B${r1}`).value).toBe("CJ-001");
    expect(ws.getCell(`F${r1}`).value).toBe(1);
    expect(ws.getCell(`B${r2}`).value).toBe("DT-101");
    expect(ws.getCell(`C${r2}`).value).toBe("1");
    expect(ws.getCell(`F${r2}`).value).toBe(2);
    expect(ws.getCell(`G${r2}`).value).toBe(18.5);
    expect(ws.getCell(`H${r2}`).value).toMatchObject({ formula: `F${r2}*G${r2}` });
    // Colunas do programador continuam vazias; fórmula AA do modelo preservada.
    expect(ws.getCell(`I${r2}`).value).toBeNull();
    expect(JSON.stringify(ws.getCell(`AA${r1}`).value)).toMatch(/K9/);

    // Hierarquia: recuo e agrupamento de linhas.
    expect(ws.getCell(`B${r2}`).alignment?.indent).toBe(1);
    expect(ws.getRow(r2).outlineLevel).toBe(1);

    // Conferir: amarelo + comentário.
    const g = ws.getCell(`G${r2}`);
    expect(g.fill).toMatchObject({ pattern: "solid", fgColor: { argb: "FFFFFF00" } });
    expect(JSON.stringify(g.note)).toMatch(/CONFERIR: Peso borrado/);
    expect(ws.getCell(`B${r2}`).note).toBeUndefined();
    // Só a célula marcada fica amarela (o estilo do modelo é compartilhado entre células).
    expect(ws.getCell(`G${r1}`).fill).not.toMatchObject({ fgColor: { argb: "FFFFFF00" } });
    expect(ws.getCell(`G${r2 + 5}`).fill).not.toMatchObject({ fgColor: { argb: "FFFFFF00" } });
    expect(ws.getCell(`B${r2 + 5}`).font?.bold).not.toBe(true);

    // Segunda aba com o relatório.
    const rep = wb.getWorksheet("Relatório")!;
    expect(rep).toBeTruthy();
    const text = rep.getSheetValues().flat().map(String).join(" ");
    expect(text).toMatch(/Desenhos lidos/);
    expect(text).toMatch(/DT-101/);
  });
});
