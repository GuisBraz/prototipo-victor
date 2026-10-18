import ExcelJS from "exceljs";
import type { BomColumn, BomResult, BomRow, IssueSeverity, ReportDrawing } from "@mecabom/shared";

/**
 * Gera a planilha "Controle de Avanço" a partir da BOM calculada pelo motor.
 *
 * Parte do modelo da própria empresa (public/templates/controle-de-avanco.xlsx, convertido do
 * .xls original) e preenche SÓ as colunas que o MECABOM lê: B (desenho), C (posição), D (rev.),
 * E (descrição), F (qte total), G (peso unit.) e H (peso total). Todas as outras colunas,
 * fórmulas, formatação e resumos do topo ficam como no modelo, para o programador preencher.
 *
 * Célula com dúvida: fundo amarelo + comentário "CONFERIR: motivo".
 * Hierarquia: recuo nas colunas B e E e agrupamento de linhas do Excel (botões +/−).
 */

export const TEMPLATE_URL = "/templates/controle-de-avanco.xlsx";

/** Primeira linha de dados do modelo (a linha 8 é o cabeçalho). */
export const FIRST_DATA_ROW = 9;

const COLUMN_OF: Record<BomColumn, string> = {
  drawingNumber: "B",
  position: "C",
  revision: "D",
  description: "E",
  quantity: "F",
  unitWeight: "G",
  totalWeight: "H",
};

const YELLOW: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFF00" } };
const MAX_OUTLINE_LEVEL = 7;

export interface ExportMeta {
  projectName: string;
  generatedAt: Date;
  generatedBy: string;
  modelId: string;
  promptVersion: string;
}

/**
 * O ExcelJS compartilha o MESMO objeto de estilo entre células com o mesmo estilo no modelo:
 * mudar a cor de uma célula pintaria a coluna inteira. Cada célula alterada ganha uma cópia própria.
 */
function ownStyle(cell: ExcelJS.Cell): ExcelJS.Cell {
  cell.style = JSON.parse(JSON.stringify(cell.style ?? {})) as Partial<ExcelJS.Style>;
  return cell;
}

function setCell(ws: ExcelJS.Worksheet, address: string, value: ExcelJS.CellValue) {
  ws.getCell(address).value = value ?? null;
}

function markCheck(cell: ExcelJS.Cell, message: string) {
  cell.fill = YELLOW;
  cell.note = { texts: [{ text: `CONFERIR: ${message}` }] };
}

function writeBomRow(ws: ExcelJS.Worksheet, rowNumber: number, row: BomRow) {
  const r = String(rowNumber);
  const excelRow = ws.getRow(rowNumber);
  for (const col of Object.values(COLUMN_OF)) ownStyle(ws.getCell(`${col}${r}`));
  setCell(ws, `B${r}`, row.drawingNumber);
  setCell(ws, `C${r}`, row.position);
  setCell(ws, `D${r}`, row.revision);
  setCell(ws, `E${r}`, row.description);
  setCell(ws, `F${r}`, row.quantityTotal);
  setCell(ws, `G${r}`, row.unitWeightKg);
  // Peso total como fórmula: se o programador corrigir F ou G, o total acompanha.
  if (row.quantityTotal !== null && row.unitWeightKg !== null) {
    ws.getCell(`H${r}`).value = { formula: `F${r}*G${r}`, result: row.totalWeightKg ?? undefined };
  } else {
    setCell(ws, `H${r}`, null);
  }
  ws.getCell(`G${r}`).numFmt = "0.000";

  const indent = Math.min(row.level, 15);
  for (const col of ["B", "E"]) {
    const cell = ws.getCell(`${col}${r}`);
    cell.alignment = { ...cell.alignment, indent };
  }
  if (row.kind === "assembly") {
    for (const col of ["B", "E"]) {
      const cell = ws.getCell(`${col}${r}`);
      cell.font = { ...cell.font, bold: true };
    }
  }
  excelRow.outlineLevel = Math.min(row.level, MAX_OUTLINE_LEVEL);

  for (const [col, message] of Object.entries(row.checks) as [BomColumn, string][]) {
    markCheck(ws.getCell(`${COLUMN_OF[col]}${r}`), message);
  }
}

const SEVERITY_PT: Record<IssueSeverity, string> = { high: "Alta", medium: "Média", info: "Informação" };
const ROLE_PT: Record<ReportDrawing["role"], string> = {
  root: "Conjunto principal",
  assembly: "Subconjunto",
  part: "Peça",
  detail_in_note: "Detalhe citado em nota (fora da BOM)",
  unreferenced: "Não chamado por nenhum conjunto",
  duplicate: "Duplicado (não usado)",
};
const READ_MODE_PT: Record<ReportDrawing["readMode"], string> = {
  digital: "Digital (texto do PDF)",
  scanned: "Escaneado (imagem)",
  unknown: "—",
};

function styleHeader(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.font = { name: "Tahoma", size: 9, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF404040" } };
    cell.alignment = { vertical: "middle", wrapText: true };
    cell.border = { bottom: { style: "thin", color: { argb: "FF000000" } } };
  });
}

function addReportSheet(wb: ExcelJS.Workbook, bom: BomResult, meta: ExportMeta) {
  const ws = wb.addWorksheet("Relatório");
  ws.columns = [
    { width: 22 },
    { width: 26 },
    { width: 70 },
    { width: 16 },
    { width: 30 },
    { width: 22 },
    { width: 10 },
    { width: 14 },
  ];
  const base: Partial<ExcelJS.Font> = { name: "Tahoma", size: 9 };
  const add = (values: ExcelJS.CellValue[], font: Partial<ExcelJS.Font> = base) => {
    const row = ws.addRow(values);
    row.eachCell((c) => (c.font = { ...base, ...font }));
    return row;
  };

  add(["RELATÓRIO DE LEITURA DOS DESENHOS — MECABOM"], { size: 13, bold: true });
  add([`Projeto: ${meta.projectName}`]);
  add([`Gerado em ${meta.generatedAt.toLocaleString("pt-BR")} por ${meta.generatedBy}`]);
  add([`Leitura por IA (${meta.modelId}, ${meta.promptVersion}) com regras fixas de montagem da BOM.`]);
  add(["RASCUNHO: confira todas as células amarelas antes de usar a lista."], { bold: true, color: { argb: "FFC00000" } });
  add([]);

  const s = bom.summary;
  add(["RESUMO"], { bold: true, size: 10 });
  const summary: [string, number][] = [
    ["Desenhos lidos", s.drawingsRead],
    ["Conjuntos principais", s.rootAssemblies],
    ["Linhas na BOM", s.bomLines],
    ["Linhas com itens para conferir", s.linesToCheck],
    ["Células para conferir (amarelas)", s.cellsToCheck],
    ["Itens sem desenho no lote", s.itemsWithoutDrawing],
    ["Desenhos de detalhe citados em nota (fora da BOM)", s.detailDrawings],
    ["Desenhos não chamados por nenhum conjunto", s.unreferencedDrawings],
  ];
  for (const [k, v] of summary) add([k, v]);
  add([]);

  add(["INCONSISTÊNCIAS E AVISOS"], { bold: true, size: 10 });
  const issuesHeader = add(["Gravidade", "Desenho", "Ocorrência"]);
  styleHeader(issuesHeader);
  if (bom.issues.length === 0) add(["—", "—", "Nenhuma inconsistência encontrada."]);
  for (const it of bom.issues) {
    const row = add([SEVERITY_PT[it.severity], it.drawing, it.message]);
    row.getCell(3).alignment = { wrapText: true, vertical: "top" };
    if (it.severity === "high") row.getCell(1).font = { ...base, bold: true, color: { argb: "FFC00000" } };
  }
  add([]);

  add(["DESENHOS APLICADOS"], { bold: true, size: 10 });
  const drawingsHeader = add(["Arquivo", "Desenho", "Descrição", "Revisão", "Papel na BOM", "Leitura", "Páginas", "Itens a conferir"]);
  styleHeader(drawingsHeader);
  for (const d of bom.drawings) {
    add([
      d.fileName,
      d.drawingNumber ?? "(não identificado)",
      d.title ?? "",
      d.revision ?? "",
      ROLE_PT[d.role],
      READ_MODE_PT[d.readMode],
      d.pageCount ?? "",
      d.checks,
    ]);
  }
  add([]);
  add(["Leitura: Digital = texto copiado do PDF; Escaneado = lido da imagem (mais sujeito a erro de leitura)."]);
}

/** Monta a pasta de trabalho completa a partir do modelo (bytes do .xlsx). */
export async function buildControleWorkbook(
  template: ArrayBuffer | Uint8Array,
  bom: BomResult,
  meta: ExportMeta,
): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(template as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("Modelo de planilha sem abas.");

  bom.rows.forEach((row, i) => writeBomRow(ws, FIRST_DATA_ROW + i, row));
  const maxLevel = bom.rows.reduce((m, r) => Math.max(m, Math.min(r.level, MAX_OUTLINE_LEVEL)), 0);
  ws.properties.outlineLevelRow = maxLevel;
  // Botão +/− na linha do conjunto (acima dos filhos), como numa BOM indentada.
  ws.properties.outlineProperties = { summaryBelow: false, summaryRight: false };

  addReportSheet(wb, bom, meta);
  wb.creator = "MECABOM";
  wb.modified = meta.generatedAt;
  return wb;
}

export async function buildControleXlsx(template: ArrayBuffer | Uint8Array, bom: BomResult, meta: ExportMeta): Promise<ArrayBuffer> {
  const wb = await buildControleWorkbook(template, bom, meta);
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

export function exportFileName(projectCode: string, date: Date): string {
  const d = date.toISOString().slice(0, 10);
  const safe = projectCode.replace(/[^A-Za-z0-9._-]+/g, "_");
  return `CONTROLE DE AVANCO - ${safe} - ${d}.xlsx`;
}
