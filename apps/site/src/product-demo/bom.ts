import { demoDocuments, type BomLine, type DemoDocument, type ProcessingStatus, type ValidationState } from "./data";
import { normalizeText } from "./format";

export type StateFilter = ValidationState | "all";

/** Peso total da linha (quantidade × unitário). `null` quando o peso unitário não foi informado. */
export function lineTotalGrams(line: BomLine): number | null {
  return line.unitWeightGrams === null ? null : line.unitWeightGrams * line.quantity;
}

export function summarizeDocuments(docs: readonly DemoDocument[] = demoDocuments) {
  const count = (s: ProcessingStatus) => docs.filter((d) => d.status === s).length;
  return {
    registered: docs.length,
    processed: count("processed"),
    reviewPending: count("review_pending"),
    queued: count("queued"),
  };
}

export interface BomFilter {
  query: string;
  state: StateFilter;
  /** Itens (conjuntos) recolhidos. Ignorado enquanto houver busca ou filtro ativo. */
  collapsed: ReadonlySet<string>;
}

/**
 * Linhas visíveis. Com busca/filtro ativos, mostra as linhas que combinam e o conjunto-pai
 * delas (para manter a hierarquia legível). Sem filtro, respeita os conjuntos recolhidos.
 */
export function visibleBomLines(lines: readonly BomLine[], f: BomFilter): BomLine[] {
  const q = normalizeText(f.query);
  const filtering = q !== "" || f.state !== "all";
  if (!filtering) return lines.filter((l) => l.parentItem === null || !f.collapsed.has(l.parentItem));

  const matches = (l: BomLine) =>
    (f.state === "all" || l.state === f.state) && (q === "" || normalizeText(`${l.code} ${l.description}`).includes(q));
  const hit = new Set(lines.filter(matches).map((l) => l.item));
  const parents = new Set(lines.filter((l) => hit.has(l.item) && l.parentItem).map((l) => l.parentItem as string));
  return lines.filter((l) => hit.has(l.item) || parents.has(l.item));
}

export interface BomTotals {
  lines: number;
  assemblies: number;
  components: number;
  /** Soma das quantidades dos componentes. */
  pieces: number;
  byState: Record<ValidationState, number>;
  /** Soma de quantidade × peso unitário dos componentes COM peso informado. Não é o peso do conjunto. */
  partialWeightGrams: number;
  /** Componentes cujo peso unitário não foi informado (ficam fora da soma). */
  componentsWithoutWeight: number;
  /** Componentes incluídos na soma que ainda estão em "Conferir". */
  weightedToCheck: number;
}

export function bomTotals(lines: readonly BomLine[]): BomTotals {
  const components = lines.filter((l) => l.kind === "component");
  const byState: Record<ValidationState, number> = { validated: 0, check: 0, not_found: 0 };
  for (const l of lines) byState[l.state] += 1;
  const weighted = components.filter((l) => l.unitWeightGrams !== null);
  return {
    lines: lines.length,
    assemblies: lines.length - components.length,
    components: components.length,
    pieces: components.reduce((s, l) => s + l.quantity, 0),
    byState,
    partialWeightGrams: weighted.reduce((s, l) => s + (lineTotalGrams(l) ?? 0), 0),
    componentsWithoutWeight: components.length - weighted.length,
    weightedToCheck: weighted.filter((l) => l.state !== "validated").length,
  };
}

export function pendingLines(lines: readonly BomLine[]): BomLine[] {
  return lines.filter((l) => l.state !== "validated");
}
