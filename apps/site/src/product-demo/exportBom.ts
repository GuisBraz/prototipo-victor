import { STATE_LABEL, type BomLine } from "./data";
import { formatKg } from "./format";
import { lineTotalGrams } from "./bom";

export const EXPORT_BASENAME = "MECABOM-BOM-demonstrativa";
export const EXPORT_HEADERS = [
  "Item", "Código", "Descrição", "Quantidade", "Unidade", "Material", "Peso unitário (kg)", "Peso total (kg)", "Estado",
] as const;

/** Linhas para exportação: números reais (ou vazio quando o dado não existe — nunca zero inventado). */
export function exportRows(lines: readonly BomLine[]): (string | number | null)[][] {
  return lines.map((l) => {
    const total = lineTotalGrams(l);
    return [
      l.item, l.code, l.description, l.quantity, l.unit, l.material,
      l.unitWeightGrams === null ? null : l.unitWeightGrams / 1000,
      total === null ? null : total / 1000,
      STATE_LABEL[l.state],
    ];
  });
}

const csvCell = (v: string | number | null, isNumber: boolean): string => {
  if (v === null) return "";
  if (isNumber && typeof v === "number") return formatKg(Math.round(v * 1000)); // 12.5 → "12,50"
  const s = String(v);
  return /[";\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

/** CSV para Excel em português: separador ";", decimal ",", UTF-8 com BOM e quebras CRLF. */
export function toCsv(lines: readonly BomLine[]): string {
  const rows = exportRows(lines).map((r) => r.map((v, i) => csvCell(v, i >= 6 && i <= 7)).join(";"));
  return "﻿" + [EXPORT_HEADERS.join(";"), ...rows].join("\r\n") + "\r\n";
}

export const XLSX_NOTICE_ROWS: string[][] = [
  ["Arquivo demonstrativo gerado pelo site de apresentação do MECABOM."],
  ["Os dados são fictícios e não vêm de uma leitura real de documentos."],
  ["O peso do conjunto não está definido no desenho; a coluna de peso total só calcula componentes com peso unitário informado."],
];

import { buildXlsx } from "./xlsx";

export function toXlsx(lines: readonly BomLine[]) {
  return buildXlsx([
    {
      name: "BOM demonstrativa",
      rows: [[...EXPORT_HEADERS], ...exportRows(lines)],
      widths: [8, 11, 24, 12, 9, 36, 18, 16, 18],
      boldRows: [0],
      decimalColumns: [6, 7],
    },
    { name: "Aviso", rows: XLSX_NOTICE_ROWS, widths: [110] },
  ]);
}
