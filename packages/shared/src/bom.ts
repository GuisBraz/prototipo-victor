import type { ComponentColumn, ExtractedValue, ExtractionOutput, TitleBlockField } from "./extraction.js";

/**
 * Motor de BOM (docs/BOM_RULES.md). TypeScript puro: sem IA, sem Firebase, determinístico.
 *
 * Entrada: um registro por desenho lido (legenda + lista de materiais), já com as correções
 * feitas pela pessoa na conferência. Saída: linhas hierárquicas no formato da planilha
 * "Controle de Avanço" e um relatório de inconsistências.
 *
 * Regras principais:
 * - Pai → filho somente pela LISTA DE MATERIAIS. Desenhos citados só em notas/detalhes
 *   ficam fora da BOM e aparecem no relatório.
 * - QTE TOTAL = produto das quantidades ao longo do caminho desde o conjunto raiz (raiz = 1).
 * - PESO TOTAL = QTE TOTAL × PESO UNIT. Valor ausente nunca vira zero: fica vazio e "conferir".
 * - Tudo que não é seguro vira uma marcação "conferir" com o motivo, na célula afetada.
 */

// ---------- Registro de desenho (entrada do motor) ----------

export interface Evidence {
  page: number | null;
  snippet: string | null;
}

/** Valor de uma célula com o motivo para conferir (null = leitura segura ou já conferida). */
export interface CheckedValue<T> {
  value: T | null;
  check: string | null;
  evidence?: Evidence;
}

export interface ComponentRecord {
  rowIndex: number;
  position: CheckedValue<string>;
  componentNumber: CheckedValue<string>;
  revision: CheckedValue<string>;
  description: CheckedValue<string>;
  quantity: CheckedValue<number>;
  weightKg: CheckedValue<number>;
  evidence: Evidence;
}

export type ReadMode = "digital" | "scanned" | "unknown";

export interface DrawingRecord {
  documentId: string;
  fileName: string;
  drawingNumber: CheckedValue<string>;
  revision: CheckedValue<string>;
  title: CheckedValue<string>;
  unitWeightKg: CheckedValue<number>;
  /** Classificação lida pela IA (assembly, part…), só informativa. */
  documentType: string;
  hasComponentTable: boolean;
  rows: ComponentRecord[];
  /** Números de desenho citados só em notas/detalhes. */
  noteReferences: string[];
  /** Problemas apontados na leitura (ilegível, conflito…), mostrados no relatório. */
  readIssues: string[];
  readMode: ReadMode;
  pageCount: number | null;
  /** Quantidade definida na conferência para desenho que nenhum conjunto chama. */
  rootQuantity?: CheckedValue<number> | null;
  /** Campos marcados como conferidos (o aviso some mesmo sem alterar o valor). */
  acks?: string[];
}

// ---------- Correções da conferência ----------

/**
 * Chave de um campo corrigível: `drawingNumber`, `revision`, `title`, `weight` (legenda),
 * `quantity` (quantidade de desenho não chamado por conjunto) ou `rows.<índice>.<coluna>`
 * (lista de materiais). Com prefixo `ack.`: campo marcado como conferido.
 */
export type OverrideKey = string;

/** Valor digitado/confirmado pela pessoa. Confirmar = gravar o próprio valor lido. */
export interface FieldOverride {
  value: string | null;
}

export type DrawingOverrides = Record<OverrideKey, FieldOverride>;

/** Campos da legenda que a conferência pode corrigir (chaves de `DrawingOverrides`). */
export const EDITABLE_TITLE_FIELDS = ["drawingNumber", "revision", "title", "weight"] as const satisfies readonly TitleBlockField[];

export const ACK_PREFIX = "ack.";

export function overrideKeyForRow(rowIndex: number, column: ComponentColumn): OverrideKey {
  return `rows.${rowIndex}.${column}`;
}

// ---------- Conversões ----------

/** Normaliza número decimal escrito como em desenhos (vírgula ou ponto). Null se não for número. */
export function parseDecimal(raw: string): { value: number; ambiguous: boolean } | null {
  const s = raw.trim().replace(/\s+/g, "");
  if (!/^\d[\d.,]*$/.test(s)) return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let normalized: string;
  let ambiguous = false;
  if (lastComma >= 0 && lastDot >= 0) {
    // O último separador é o decimal; o outro é de milhar.
    normalized = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma >= 0) {
    if ((s.match(/,/g) ?? []).length > 1) return null;
    normalized = s.replace(",", ".");
  } else if (lastDot >= 0) {
    if ((s.match(/\./g) ?? []).length > 1) {
      if (!/^\d{1,3}(\.\d{3})+$/.test(s)) return null;
      normalized = s.replace(/\./g, "");
    } else {
      normalized = s;
      // "1.250" pode ser 1250 (milhar) ou 1,25 (decimal).
      ambiguous = /^\d{1,3}\.\d{3}$/.test(s);
    }
  } else {
    normalized = s;
  }
  const value = Number(normalized);
  return Number.isFinite(value) ? { value, ambiguous } : null;
}

/** Quantidade de um item ("2", "02", "2 PÇ", "2,5 M"). Unidade diferente de peça vira aviso. */
export function parseQuantity(raw: string | null): { value: number | null; check: string | null } {
  if (raw === null || raw.trim() === "") return { value: null, check: "Quantidade não informada na lista de materiais" };
  const m = raw.trim().match(/^(\d[\d.,]*)\s*(?:x|X)?\s*([A-Za-zÀ-ÿ.²³]*)\.?$/);
  const num = m ? parseDecimal(m[1]!) : null;
  if (!m || !num) return { value: null, check: `Quantidade "${raw}" não é um número` };
  const unit = (m[2] ?? "").toUpperCase().replace(/\./g, "");
  const pieceUnits = ["", "PC", "PÇ", "PÇS", "PCS", "UN", "UND", "UNID", "PEÇA", "PEÇAS", "PECA", "PECAS", "CJ", "PZ", "PZS"];
  if (num.ambiguous) return { value: num.value, check: `Quantidade "${raw}" ambígua (separador decimal)` };
  if (!pieceUnits.includes(unit)) return { value: num.value, check: `Quantidade em "${unit}" (não é peça): conferir` };
  return { value: num.value, check: null };
}

/** Peso em kg ("12,5 kg", "850 g", "1,2 t"). Sem unidade: assume kg e pede conferência. */
export function parseWeightKg(raw: string | null): { value: number | null; check: string | null } {
  if (raw === null || raw.trim() === "") return { value: null, check: "Peso não encontrado" };
  const m = raw.trim().match(/^(?:peso[:\s]*)?(\d[\d.,\s]*)\s*(kg|kgs|g|gr|t|ton)?\.?$/i);
  const num = m ? parseDecimal(m[1]!) : null;
  if (!m || !num) return { value: null, check: `Peso "${raw}" não reconhecido` };
  const unit = (m[2] ?? "").toLowerCase();
  const factor = unit === "g" || unit === "gr" ? 0.001 : unit === "t" || unit === "ton" ? 1000 : 1;
  const value = Math.round(num.value * factor * 1000) / 1000;
  if (num.ambiguous) return { value, check: `Peso "${raw}" ambíguo (separador decimal)` };
  if (unit === "") return { value, check: `Peso "${raw}" sem unidade (assumido kg)` };
  return { value, check: null };
}

/** Chave de comparação de número de desenho: maiúsculas, sem espaços. */
export function drawingKey(raw: string): string {
  return raw.toUpperCase().replace(/\s+/g, "");
}

/** Chave aproximada: só letras e números (ignora "-", ".", "/", "_"). */
export function looseDrawingKey(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Compara revisões: números por valor, letras em ordem alfabética (B > A, AA > Z). */
export function compareRevisions(a: string, b: string): number {
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb) && a.trim() !== "" && b.trim() !== "") return na - nb;
  const ua = a.trim().toUpperCase();
  const ub = b.trim().toUpperCase();
  return ua.length !== ub.length ? ua.length - ub.length : ua.localeCompare(ub);
}

// ---------- Extração → registro ----------

/** Motivo para conferir um campo lido pela IA, ou null se a leitura é segura. */
function checkFromExtracted(v: ExtractedValue, label: string): string | null {
  if (v.status === "not_found") return `${label} não encontrado no desenho`;
  if (v.status === "ambiguous") return v.note ? `Leitura incerta: ${v.note}` : "Leitura incerta";
  if (!v.isExplicit) return v.note ? `Valor inferido: ${v.note}` : "Valor inferido pela posição, sem rótulo";
  return null;
}

function textValue(v: ExtractedValue, label: string): CheckedValue<string> {
  const value = v.rawValue !== null && v.rawValue.trim() !== "" ? v.rawValue.trim() : null;
  return { value, check: checkFromExtracted(v, label), evidence: { page: v.page, snippet: v.snippet } };
}

function applyText(base: CheckedValue<string>, o: FieldOverride | undefined): CheckedValue<string> {
  if (!o) return base;
  const value = o.value !== null && o.value.trim() !== "" ? o.value.trim() : null;
  return { value, check: null, evidence: base.evidence };
}

function numberFromText(
  base: CheckedValue<string>,
  parse: (raw: string | null) => { value: number | null; check: string | null },
  overridden: boolean,
): CheckedValue<number> {
  const parsed = parse(base.value);
  // Valor confirmado pela pessoa: só volta a pedir conferência se nem for número.
  const check = overridden ? (parsed.value === null && base.value !== null ? parsed.check : null) : (base.check ?? parsed.check);
  return { value: parsed.value, check, evidence: base.evidence };
}

export function drawingRecordFromExtraction(input: {
  documentId: string;
  fileName: string;
  extraction: ExtractionOutput;
  overrides?: DrawingOverrides;
  readMode?: ReadMode;
  pageCount?: number | null;
}): DrawingRecord {
  const { extraction: ex } = input;
  const ov = input.overrides ?? {};
  const tb = ex.titleBlock;

  const weightText = applyText(textValue(tb.weight, "Peso"), ov.weight);
  let unitWeightKg = numberFromText(weightText, parseWeightKg, ov.weight !== undefined);
  if (!ov.weight && unitWeightKg.value !== null && ex.weightScope === "unknown" && unitWeightKg.check === null) {
    unitWeightKg = { ...unitWeightKg, check: "Não está claro se o peso é da peça ou do conjunto" };
  }

  const rows: ComponentRecord[] =
    ex.componentTable.status === "not_found"
      ? []
      : ex.componentTable.rows.map((r, i) => {
          const uncertain = new Set(r.uncertainColumns);
          const ev: Evidence = { page: r.page, snippet: r.snippet };
          const cell = (c: ComponentColumn, label: string, required: boolean): CheckedValue<string> => {
            const raw = r[c];
            const value = raw !== null && raw.trim() !== "" ? raw.trim() : null;
            let check: string | null = null;
            if (uncertain.has(c)) check = r.note ? `Leitura incerta: ${r.note}` : `${label}: leitura incerta`;
            else if (value === null && required) check = `${label} não informado`;
            return applyText({ value, check, evidence: ev }, ov[overrideKeyForRow(i, c)]);
          };
          const qtyText = cell("quantity", "Quantidade", true);
          const weightCell = cell("weight", "Peso", false);
          return {
            rowIndex: i,
            position: cell("itemPosition", "Posição", false),
            componentNumber: cell("componentNumber", "Código/desenho", false),
            revision: cell("revision", "Revisão", false),
            description: cell("description", "Descrição", true),
            quantity: numberFromText(qtyText, parseQuantity, ov[overrideKeyForRow(i, "quantity")] !== undefined),
            weightKg:
              weightCell.value === null
                ? { value: null, check: weightCell.check, evidence: ev }
                : numberFromText(weightCell, parseWeightKg, ov[overrideKeyForRow(i, "weight")] !== undefined),
            evidence: ev,
          };
        });

  const readIssues = ex.issues.map((it) => (it.page ? `p. ${it.page}: ${it.message}` : it.message));
  if (ex.componentTable.status === "ambiguous" && ex.componentTable.note) {
    readIssues.push(`Lista de materiais: ${ex.componentTable.note}`);
  }

  const rootQuantity = ov.quantity
    ? numberFromText({ value: ov.quantity.value, check: null }, parseQuantity, true)
    : null;
  const acks = Object.keys(ov)
    .filter((k) => k.startsWith(ACK_PREFIX))
    .map((k) => k.slice(ACK_PREFIX.length));

  return {
    documentId: input.documentId,
    fileName: input.fileName,
    rootQuantity,
    acks,
    drawingNumber: applyText(textValue(tb.drawingNumber, "Número do desenho"), ov.drawingNumber),
    revision: applyText(textValue(tb.revision, "Revisão"), ov.revision),
    title: applyText(textValue(tb.title, "Descrição"), ov.title),
    unitWeightKg,
    documentType: ex.documentType.classification,
    hasComponentTable: rows.length > 0,
    rows,
    noteReferences: ex.noteReferences.map((n) => n.drawingNumber.trim()).filter((n) => n !== ""),
    readIssues,
    readMode: input.readMode ?? "unknown",
    pageCount: input.pageCount ?? null,
  };
}

// ---------- Saída do motor ----------

export const BOM_COLUMNS = [
  "drawingNumber",
  "position",
  "revision",
  "description",
  "quantity",
  "unitWeight",
  "totalWeight",
] as const;
export type BomColumn = (typeof BOM_COLUMNS)[number];

export type BomRowKind = "assembly" | "part" | "no_drawing" | "unreferenced";

/** De qual desenho e campo veio o valor de uma célula (para corrigir no lugar certo). */
export interface CellSource {
  documentId: string;
  /** Chave de correção (ver `OverrideKey`). */
  field: string;
}

export interface BomRow {
  /** 0 = conjunto raiz. */
  level: number;
  kind: BomRowKind;
  drawingNumber: string | null;
  position: string | null;
  revision: string | null;
  description: string | null;
  quantityTotal: number | null;
  unitWeightKg: number | null;
  totalWeightKg: number | null;
  /** Motivos de conferência por coluna (célula amarela + comentário). */
  checks: Partial<Record<BomColumn, string>>;
  /** Desenho que originou a linha (o próprio item, quando existe no lote). */
  documentId: string | null;
  /** Linha da lista de materiais do pai que chamou este item. */
  parentRow: { documentId: string; rowIndex: number } | null;
  /** Origem de cada célula (o peso total é calculado e não tem origem). */
  sources: Partial<Record<BomColumn, CellSource>>;
}

export type IssueSeverity = "high" | "medium" | "info";

export interface BomIssue {
  severity: IssueSeverity;
  drawing: string;
  message: string;
  documentId: string | null;
}

export interface ReportDrawing {
  documentId: string;
  fileName: string;
  drawingNumber: string | null;
  revision: string | null;
  title: string | null;
  role: "root" | "assembly" | "part" | "detail_in_note" | "unreferenced" | "duplicate";
  readMode: ReadMode;
  pageCount: number | null;
  checks: number;
}

export interface BomResult {
  rows: BomRow[];
  issues: BomIssue[];
  drawings: ReportDrawing[];
  summary: {
    drawingsRead: number;
    rootAssemblies: number;
    bomLines: number;
    linesToCheck: number;
    cellsToCheck: number;
    detailDrawings: number;
    unreferencedDrawings: number;
    itemsWithoutDrawing: number;
  };
}

const MAX_DEPTH = 25;

const label = (r: DrawingRecord) => r.drawingNumber.value ?? r.fileName;

const mul = (a: number | null, b: number | null) =>
  a === null || b === null ? null : Math.round(a * b * 1e6) / 1e6;

/**
 * Monta a BOM hierárquica a partir dos desenhos do lote.
 * Desenhos com o mesmo número: vale a revisão mais recente; os demais ficam no relatório.
 */
export function buildBom(records: readonly DrawingRecord[]): BomResult {
  const issues: BomIssue[] = [];
  const issue = (severity: IssueSeverity, r: DrawingRecord | string, message: string) =>
    issues.push({
      severity,
      drawing: typeof r === "string" ? r : label(r),
      message,
      documentId: typeof r === "string" ? null : r.documentId,
    });

  // 1. Índice por número de desenho (com escolha de revisão entre duplicados).
  const byKey = new Map<string, DrawingRecord>();
  const byLooseKey = new Map<string, DrawingRecord[]>();
  const duplicates = new Set<string>();
  const sorted = [...records].sort((a, b) => a.fileName.localeCompare(b.fileName));
  for (const r of sorted) {
    if (r.drawingNumber.value === null) {
      issue("high", r, `Número do desenho não identificado (arquivo ${r.fileName})`);
      continue;
    }
    const key = drawingKey(r.drawingNumber.value);
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, r);
      continue;
    }
    const ra = prev.revision.value ?? "";
    const rb = r.revision.value ?? "";
    const keepNew = compareRevisions(rb, ra) > 0;
    const kept = keepNew ? r : prev;
    const dropped = keepNew ? prev : r;
    byKey.set(key, kept);
    duplicates.add(dropped.documentId);
    issue(
      ra === rb ? "medium" : "high",
      kept,
      ra === rb
        ? `Desenho em duplicidade no lote (${prev.fileName} e ${r.fileName}); usado ${kept.fileName}`
        : `Mesmo desenho com revisões diferentes (${ra || "?"} e ${rb || "?"}); usada a revisão ${kept.revision.value ?? "?"}`,
    );
  }
  for (const r of byKey.values()) {
    const lk = looseDrawingKey(r.drawingNumber.value!);
    byLooseKey.set(lk, [...(byLooseKey.get(lk) ?? []), r]);
  }

  /** Resolve o código citado numa lista de materiais para um desenho do lote. */
  const resolve = (code: string | null): { record: DrawingRecord | null; approximate: boolean } => {
    if (code === null) return { record: null, approximate: false };
    const exact = byKey.get(drawingKey(code));
    if (exact) return { record: exact, approximate: false };
    const loose = byLooseKey.get(looseDrawingKey(code));
    if (loose && loose.length === 1) return { record: loose[0]!, approximate: true };
    return { record: null, approximate: false };
  };

  // 2. Quem é chamado pela lista de materiais de quem.
  const calledBy = new Map<string, Set<string>>();
  for (const r of byKey.values()) {
    for (const row of r.rows) {
      const { record: child } = resolve(row.componentNumber.value);
      if (child && child.documentId !== r.documentId) {
        calledBy.set(child.documentId, (calledBy.get(child.documentId) ?? new Set()).add(r.documentId));
      }
    }
  }
  const noteRefs = new Set<string>();
  for (const r of records) for (const n of r.noteReferences) noteRefs.add(looseDrawingKey(n));

  // 3. Raízes: conjuntos com lista de materiais que ninguém chama.
  const unique = [...byKey.values()];
  const roots = unique.filter((r) => r.hasComponentTable && !calledBy.has(r.documentId));

  const rows: BomRow[] = [];
  const emitted = new Set<string>();
  const roleOf = new Map<string, ReportDrawing["role"]>();

  const pushDrawingChecks = (r: DrawingRecord, checks: BomRow["checks"]) => {
    if (r.drawingNumber.check) checks.drawingNumber = r.drawingNumber.check;
    if (r.revision.check) checks.revision = r.revision.check;
  };

  const walk = (parent: DrawingRecord, level: number, multiplier: number | null, path: string[]) => {
    for (const row of parent.rows) {
      const qtyTotal = mul(multiplier, row.quantity.value);
      const checks: BomRow["checks"] = {};
      if (row.quantity.check) checks.quantity = row.quantity.check;
      else if (multiplier === null) checks.quantity = "Quantidade do conjunto pai indefinida";
      if (row.position.check) checks.position = row.position.check;
      if (row.description.check) checks.description = row.description.check;

      const { record: child, approximate } = resolve(row.componentNumber.value);
      if (child && child.documentId === parent.documentId) {
        issue("high", parent, `Item ${row.position.value ?? row.rowIndex + 1} da lista de materiais cita o próprio desenho`);
      }

      if (child && child.documentId !== parent.documentId) {
        pushDrawingChecks(child, checks);
        if (row.componentNumber.check) checks.drawingNumber = row.componentNumber.check;
        if (approximate) {
          checks.drawingNumber = `Código na lista "${row.componentNumber.value}" difere do desenho "${child.drawingNumber.value}" (só em separadores)`;
        }
        const listedRev = row.revision.value;
        const drawingRev = child.revision.value;
        if (listedRev && drawingRev && compareRevisions(listedRev, drawingRev) !== 0) {
          checks.revision = `Lista de materiais de ${label(parent)} cita rev. ${listedRev}; o desenho está na rev. ${drawingRev}`;
          issue("high", child, checks.revision);
        }
        // Peso: o do desenho do filho prevalece; o da lista serve de conferência.
        let unit = child.unitWeightKg.value;
        let unitCheck = child.unitWeightKg.check;
        const listed = row.weightKg.value;
        if (unit === null && listed !== null) {
          unit = listed;
          unitCheck = row.weightKg.check ?? "Peso tirado da lista de materiais do conjunto (o desenho não traz)";
        } else if (unit !== null && listed !== null && Math.abs(unit - listed) > Math.max(0.01, unit * 0.01)) {
          unitCheck = `Peso no desenho ${unit} kg × na lista de materiais ${listed} kg`;
          issue("medium", child, `${unitCheck} (lista de ${label(parent)})`);
        }
        if (unitCheck) checks.unitWeight = unitCheck;

        const description = row.description.value ?? child.title.value;
        if (row.description.value === null && child.title.value !== null) {
          if (child.title.check) checks.description = child.title.check;
          else delete checks.description;
        }

        const fromRow = (col: string): CellSource => ({ documentId: parent.documentId, field: `rows.${row.rowIndex}.${col}` });
        const fromChild = (field: string): CellSource => ({ documentId: child.documentId, field });
        const sources: BomRow["sources"] = {
          drawingNumber: approximate || row.componentNumber.check ? fromRow("componentNumber") : fromChild("drawingNumber"),
          position: fromRow("itemPosition"),
          revision: drawingRev !== null ? fromChild("revision") : fromRow("revision"),
          description: row.description.value !== null ? fromRow("description") : fromChild("title"),
          quantity: fromRow("quantity"),
          unitWeight: child.unitWeightKg.value !== null ? fromChild("weight") : fromRow("weight"),
        };

        const cycle = path.includes(child.documentId);
        rows.push({
          level,
          kind: child.hasComponentTable ? "assembly" : "part",
          drawingNumber: child.drawingNumber.value,
          position: row.position.value,
          revision: drawingRev ?? listedRev,
          description,
          quantityTotal: qtyTotal,
          unitWeightKg: unit,
          totalWeightKg: mul(qtyTotal, unit),
          checks,
          documentId: child.documentId,
          parentRow: { documentId: parent.documentId, rowIndex: row.rowIndex },
          sources,
        });
        emitted.add(child.documentId);
        if (!roleOf.has(child.documentId)) roleOf.set(child.documentId, child.hasComponentTable ? "assembly" : "part");
        if (cycle) {
          issue("high", child, `Ciclo na hierarquia: ${[...path, child.documentId].map((id) => label(records.find((x) => x.documentId === id)!)).join(" → ")}`);
          checks.drawingNumber = "Ciclo: este conjunto já aparece acima na hierarquia";
        } else if (level >= MAX_DEPTH) {
          issue("high", child, "Hierarquia profunda demais; níveis abaixo foram omitidos");
        } else {
          walk(child, level + 1, qtyTotal, [...path, child.documentId]);
        }
      } else {
        // Item sem desenho no lote: comercial (parafuso, rolamento…) ou desenho faltando.
        const code = row.componentNumber.value;
        checks.drawingNumber =
          row.componentNumber.check ??
          (code ? `Desenho ${code} não está no lote (item comercial ou desenho faltando)` : "Item sem código de desenho (item comercial?)");
        if (row.revision.check) checks.revision = row.revision.check;
        if (row.weightKg.check && row.weightKg.value !== null) checks.unitWeight = row.weightKg.check;
        else if (row.weightKg.value === null) checks.unitWeight = "Peso não informado na lista de materiais";
        rows.push({
          level,
          kind: "no_drawing",
          drawingNumber: code,
          position: row.position.value,
          revision: row.revision.value,
          description: row.description.value,
          quantityTotal: qtyTotal,
          unitWeightKg: row.weightKg.value,
          totalWeightKg: mul(qtyTotal, row.weightKg.value),
          checks,
          documentId: null,
          parentRow: { documentId: parent.documentId, rowIndex: row.rowIndex },
          sources: Object.fromEntries(
            (
              [
                ["drawingNumber", "componentNumber"],
                ["position", "itemPosition"],
                ["revision", "revision"],
                ["description", "description"],
                ["quantity", "quantity"],
                ["unitWeight", "weight"],
              ] as const
            ).map(([col, field]) => [col, { documentId: parent.documentId, field: `rows.${row.rowIndex}.${field}` }]),
          ),
        });
      }
      const last = rows[rows.length - 1]!;
      if (last.totalWeightKg === null && !last.checks.totalWeight) {
        last.checks.totalWeight = "Falta quantidade ou peso unitário para calcular";
      }
    }
  };

  const emitRoot = (r: DrawingRecord, kind: BomRowKind, defaultQuantity: number | null, extra?: string) => {
    const checks: BomRow["checks"] = {};
    pushDrawingChecks(r, checks);
    if (r.title.check) checks.description = r.title.check;
    if (r.unitWeightKg.check) checks.unitWeight = r.unitWeightKg.check;
    // Quantidade definida na conferência prevalece (ex.: desenho avulso no lote).
    const quantity = r.rootQuantity ? r.rootQuantity.value : defaultQuantity;
    if (r.rootQuantity?.check) checks.quantity = r.rootQuantity.check;
    else if (extra && !r.rootQuantity) checks.quantity = extra;
    const total = mul(quantity, r.unitWeightKg.value);
    if (total === null) checks.totalWeight = checks.totalWeight ?? "Falta quantidade ou peso unitário para calcular";
    rows.push({
      level: 0,
      kind,
      drawingNumber: r.drawingNumber.value,
      position: null,
      revision: r.revision.value,
      description: r.title.value,
      quantityTotal: quantity,
      unitWeightKg: r.unitWeightKg.value,
      totalWeightKg: total,
      checks,
      documentId: r.documentId,
      parentRow: null,
      sources: {
        drawingNumber: { documentId: r.documentId, field: "drawingNumber" },
        revision: { documentId: r.documentId, field: "revision" },
        description: { documentId: r.documentId, field: "title" },
        quantity: { documentId: r.documentId, field: "quantity" },
        unitWeight: { documentId: r.documentId, field: "weight" },
      },
    });
    emitted.add(r.documentId);
  };

  for (const root of roots.sort((a, b) => label(a).localeCompare(label(b)))) {
    emitRoot(root, "assembly", 1);
    roleOf.set(root.documentId, "root");
    walk(root, 1, 1, [root.documentId]);
  }

  // 4. Desenhos que nenhuma lista de materiais alcançou.
  for (const r of unique.sort((a, b) => label(a).localeCompare(label(b)))) {
    if (emitted.has(r.documentId)) continue;
    if (noteRefs.has(looseDrawingKey(r.drawingNumber.value!))) {
      roleOf.set(r.documentId, "detail_in_note");
      continue;
    }
    if (calledBy.has(r.documentId)) {
      // Chamado apenas dentro de um ciclo sem raiz: entra como raiz para não sumir.
      emitRoot(r, r.hasComponentTable ? "assembly" : "part", 1);
      roleOf.set(r.documentId, "root");
      issue("high", r, "Conjunto chamado apenas dentro de um ciclo; tratado como raiz");
      walk(r, 1, 1, [r.documentId]);
      continue;
    }
    roleOf.set(r.documentId, "unreferenced");
    emitRoot(r, "unreferenced", null, "Desenho não chamado por nenhuma lista de materiais do lote: quantidade a definir");
    issue("medium", r, "Desenho não é chamado por nenhum conjunto do lote nem citado em notas");
  }

  // 5. Avisos marcados como conferidos na revisão humana deixam de ser amarelos.
  const acksByDoc = new Map(records.map((r) => [r.documentId, new Set(r.acks ?? [])]));
  for (const row of rows) {
    for (const col of Object.keys(row.checks) as BomColumn[]) {
      const src = row.sources[col];
      if (src && acksByDoc.get(src.documentId)?.has(src.field)) delete row.checks[col];
    }
    if (row.checks.totalWeight && row.totalWeightKg !== null) delete row.checks.totalWeight;
  }

  // 6. Referências de nota que não estão no lote (informativo).
  const allKeys = new Set(records.map((r) => (r.drawingNumber.value ? looseDrawingKey(r.drawingNumber.value) : "")));
  for (const r of records) {
    for (const n of r.noteReferences) {
      if (!allKeys.has(looseDrawingKey(n))) issue("info", r, `Cita em nota o desenho de detalhe ${n}, que não está no lote`);
    }
  }
  for (const r of records) for (const msg of r.readIssues) issue("info", r, `Leitura: ${msg}`);
  for (const row of rows) {
    if (row.kind === "no_drawing" && row.drawingNumber) {
      const parent = records.find((x) => x.documentId === row.parentRow?.documentId);
      if (parent) issue("medium", parent, `Item ${row.position ?? "?"} (${row.drawingNumber}) sem desenho no lote`);
    }
  }

  const checksByDoc = new Map<string, number>();
  for (const row of rows) {
    const n = Object.keys(row.checks).length;
    if (n > 0 && row.documentId) checksByDoc.set(row.documentId, (checksByDoc.get(row.documentId) ?? 0) + n);
  }
  const drawings: ReportDrawing[] = sorted.map((r) => ({
    documentId: r.documentId,
    fileName: r.fileName,
    drawingNumber: r.drawingNumber.value,
    revision: r.revision.value,
    title: r.title.value,
    role: duplicates.has(r.documentId) ? "duplicate" : (roleOf.get(r.documentId) ?? "unreferenced"),
    readMode: r.readMode,
    pageCount: r.pageCount,
    checks: checksByDoc.get(r.documentId) ?? 0,
  }));

  const order: Record<IssueSeverity, number> = { high: 0, medium: 1, info: 2 };
  issues.sort((a, b) => order[a.severity] - order[b.severity] || a.drawing.localeCompare(b.drawing));

  return {
    rows,
    issues,
    drawings,
    summary: {
      drawingsRead: records.length,
      rootAssemblies: roots.length,
      bomLines: rows.length,
      linesToCheck: rows.filter((r) => Object.keys(r.checks).length > 0).length,
      cellsToCheck: rows.reduce((n, r) => n + Object.keys(r.checks).length, 0),
      detailDrawings: drawings.filter((d) => d.role === "detail_in_note").length,
      unreferencedDrawings: drawings.filter((d) => d.role === "unreferenced").length,
      itemsWithoutDrawing: rows.filter((r) => r.kind === "no_drawing").length,
    },
  };
}
