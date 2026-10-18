import { useMemo, useState } from "react";
import {
  ACK_PREFIX,
  AI_EXTRACTION_CONFIG,
  hasAtLeastRole,
  type BomColumn,
  type BomResult,
  type BomRow,
  type IssueSeverity,
} from "@mecabom/shared";
import { useAuth } from "../auth";
import { friendlyError } from "../errors";
import { currentValue, evidenceFor, saveReview, type ExtractionDoc } from "../extractions";
import { useOrganizations } from "../organizations";

const COLUMNS: { key: BomColumn; label: string; numeric?: boolean }[] = [
  { key: "drawingNumber", label: "Desenho" },
  { key: "position", label: "Posição" },
  { key: "revision", label: "Rev." },
  { key: "description", label: "Descrição do item" },
  { key: "quantity", label: "Qte total", numeric: true },
  { key: "unitWeight", label: "Peso unit. (kg)", numeric: true },
  { key: "totalWeight", label: "Peso total (kg)", numeric: true },
];

const SEVERITY_PT: Record<IssueSeverity, string> = { high: "Alta", medium: "Média", info: "Info" };

const num = (v: number | null, digits: number) =>
  v === null ? "" : v.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: digits });

function cellText(row: BomRow, col: BomColumn): string {
  switch (col) {
    case "drawingNumber":
      return row.drawingNumber ?? "";
    case "position":
      return row.position ?? "";
    case "revision":
      return row.revision ?? "";
    case "description":
      return row.description ?? "";
    case "quantity":
      return num(row.quantityTotal, 3);
    case "unitWeight":
      return num(row.unitWeightKg, 3);
    case "totalWeight":
      return num(row.totalWeightKg, 2);
  }
}

interface Selected {
  rowIndex: number;
  col: BomColumn;
}

export function BomSection(props: {
  projectId: string;
  projectName: string;
  projectCode: string;
  bom: BomResult;
  extractions: Map<string, ExtractionDoc>;
  pendingReadings: number;
}) {
  const { bom, extractions } = props;
  const { user } = useAuth();
  const { current } = useOrganizations();
  const canReview = current ? hasAtLeastRole(current.role, "reviewer") : false;
  const [onlyChecks, setOnlyChecks] = useState(false);
  const [selected, setSelected] = useState<Selected | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [showIssues, setShowIssues] = useState(false);

  const rows = useMemo(
    () => bom.rows.map((row, i) => ({ row, i })).filter(({ row }) => !onlyChecks || Object.keys(row.checks).length > 0),
    [bom.rows, onlyChecks],
  );

  async function download() {
    setDownloading(true);
    setDownloadError(null);
    try {
      // ExcelJS só é carregado quando a pessoa baixa a planilha.
      const { TEMPLATE_URL, buildControleXlsx, exportFileName } = await import("../export/controleWorkbook");
      const template = await (await fetch(TEMPLATE_URL)).arrayBuffer();
      const now = new Date();
      const bytes = await buildControleXlsx(template, bom, {
        projectName: `${props.projectCode} — ${props.projectName}`,
        generatedAt: now,
        generatedBy: user?.email ?? "usuário",
        modelId: AI_EXTRACTION_CONFIG.modelId,
        promptVersion: AI_EXTRACTION_CONFIG.promptVersion,
      });
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = exportFileName(props.projectCode, now);
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      setDownloadError(`Não foi possível gerar a planilha. ${friendlyError(e)}`);
    } finally {
      setDownloading(false);
    }
  }

  const s = bom.summary;
  const sel = selected ? bom.rows[selected.rowIndex] : undefined;

  return (
    <section className="card">
      <div className="row">
        <h2 style={{ margin: 0 }}>2. BOM e conferência</h2>
        <span className="spacer" />
        <button className="btn primary" disabled={downloading || bom.rows.length === 0} onClick={() => void download()}>
          {downloading ? "Gerando…" : "Baixar planilha + relatório (.xlsx)"}
        </button>
      </div>
      {downloadError && <p className="error">{downloadError}</p>}
      {props.pendingReadings > 0 && (
        <p className="notice">
          {props.pendingReadings} desenho(s) ainda em leitura. A BOM se atualiza sozinha quando terminarem.
        </p>
      )}

      {bom.rows.length === 0 ? (
        <p className="muted">A BOM aparece aqui assim que os primeiros desenhos forem lidos.</p>
      ) : (
        <>
          <div className="stats" style={{ margin: "12px 0" }}>
            <div className="stat"><span className="muted">Desenhos lidos</span><strong>{s.drawingsRead}</strong></div>
            <div className="stat"><span className="muted">Linhas na BOM</span><strong>{s.bomLines}</strong></div>
            <div className="stat"><span className="muted">Células para conferir</span><strong className={s.cellsToCheck ? "warn" : ""}>{s.cellsToCheck}</strong></div>
            <div className="stat"><span className="muted">Inconsistências</span><strong>{bom.issues.filter((i) => i.severity !== "info").length}</strong></div>
          </div>
          <div className="row" style={{ marginBottom: 8 }}>
            <label className="inline">
              <input type="checkbox" checked={onlyChecks} onChange={(e) => setOnlyChecks(e.target.checked)} />
              Mostrar só linhas para conferir
            </label>
            <span className="spacer" />
            <span className="muted small">Clique numa célula amarela para conferir.</span>
          </div>

          <div className="bom-wrap">
            <table className="bom">
              <thead>
                <tr>
                  <th>N°</th>
                  {COLUMNS.map((c) => (
                    <th key={c.key} className={c.numeric ? "num" : ""}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ row, i }) => (
                  <tr key={i} className={row.kind === "assembly" ? "assembly" : ""}>
                    <td className="muted">{i + 1}</td>
                    {COLUMNS.map((c) => {
                      const check = row.checks[c.key];
                      const isSel = selected?.rowIndex === i && selected.col === c.key;
                      const indent = c.key === "drawingNumber" || c.key === "description" ? row.level * 16 : 0;
                      return (
                        <td
                          key={c.key}
                          className={`${c.numeric ? "num" : ""}${check ? " check" : ""}${isSel ? " selected" : ""}`}
                          style={indent ? { paddingLeft: 8 + indent } : undefined}
                          title={check ? `CONFERIR: ${check}` : undefined}
                          onClick={() => (check || row.sources[c.key]) && setSelected({ rowIndex: i, col: c.key })}
                        >
                          {cellText(row, c.key) || (check ? "—" : "")}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {sel && selected && (
            <ReviewPanel
              key={`${selected.rowIndex}-${selected.col}`}
              projectId={props.projectId}
              row={sel}
              col={selected.col}
              extractions={extractions}
              canReview={canReview}
              onClose={() => setSelected(null)}
            />
          )}

          <div style={{ marginTop: 16 }}>
            <button className="btn link" onClick={() => setShowIssues((v) => !v)}>
              {showIssues ? "Ocultar" : "Ver"} relatório de inconsistências ({bom.issues.length})
            </button>
            {showIssues && (
              <table style={{ marginTop: 8 }}>
                <thead>
                  <tr><th>Gravidade</th><th>Desenho</th><th>Ocorrência</th></tr>
                </thead>
                <tbody>
                  {bom.issues.map((it, k) => (
                    <tr key={k}>
                      <td><span className={`badge ${it.severity === "high" ? "bad" : it.severity === "medium" ? "busy" : "idle"}`}>{SEVERITY_PT[it.severity]}</span></td>
                      <td>{it.drawing}</td>
                      <td>{it.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </section>
  );
}

const COLUMN_LABEL: Record<BomColumn, string> = Object.fromEntries(COLUMNS.map((c) => [c.key, c.label])) as Record<BomColumn, string>;

function ReviewPanel(props: {
  projectId: string;
  row: BomRow;
  col: BomColumn;
  extractions: Map<string, ExtractionDoc>;
  canReview: boolean;
  onClose: () => void;
}) {
  const { row, col, extractions } = props;
  const { current } = useOrganizations();
  const source = row.sources[col];
  const x = source ? extractions.get(source.documentId) : undefined;
  const ev = source ? evidenceFor(x, source) : null;
  const check = row.checks[col];
  const [value, setValue] = useState(source ? currentValue(x, source) : "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const corrected = source ? x?.overrides[source.field] !== undefined : false;
  const acked = source ? x?.overrides[`${ACK_PREFIX}${source.field}`] !== undefined : false;
  const { projectId } = props;

  async function act(kind: "save" | "ack" | "clear") {
    if (!source || !current) return;
    setBusy(true);
    setErr(null);
    try {
      const base = { organizationId: current.organizationId, projectId, documentId: source.documentId };
      if (kind === "save") await saveReview({ ...base, field: source.field, value: value.trim() === "" ? null : value.trim() });
      if (kind === "ack") await saveReview({ ...base, field: `${ACK_PREFIX}${source.field}`, value: check ?? null });
      if (kind === "clear") {
        if (corrected) await saveReview({ ...base, field: source.field, value: null, clear: true });
        if (acked) await saveReview({ ...base, field: `${ACK_PREFIX}${source.field}`, value: null, clear: true });
      }
      props.onClose();
    } catch (e) {
      setErr(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="review-panel">
      <div className="row">
        <strong>
          {COLUMN_LABEL[col]} · {row.drawingNumber ?? row.description ?? "item"}
        </strong>
        <span className="spacer" />
        <button className="btn link" onClick={props.onClose}>Fechar</button>
      </div>
      {check ? <p className="check-msg">CONFERIR: {check}</p> : <p className="muted">Sem pendência nesta célula.</p>}
      {col === "totalWeight" ? (
        <p className="muted">O peso total é calculado (quantidade total × peso unitário). Corrija a quantidade ou o peso unitário.</p>
      ) : !source ? (
        <p className="muted">Este valor não vem de um campo lido.</p>
      ) : (
        <>
          <dl className="kv">
            <dt>Origem</dt>
            <dd>{x?.fileName ?? source.documentId}{ev?.page ? `, página ${ev.page}` : ""}</dd>
            <dt>Lido pela IA</dt>
            <dd>{ev?.rawValue ?? <span className="muted">não encontrado</span>}</dd>
            {ev?.snippet && (<><dt>Trecho</dt><dd><code>{ev.snippet}</code></dd></>)}
            {ev?.note && (<><dt>Observação</dt><dd>{ev.note}</dd></>)}
            {corrected && (<><dt>Corrigido para</dt><dd>{x?.overrides[source.field]?.value ?? "(vazio)"}</dd></>)}
          </dl>
          {props.canReview ? (
            <>
              <label>
                Valor correto
                <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Deixe vazio se o dado não existe no desenho" />
              </label>
              <div className="row" style={{ marginTop: 10, flexWrap: "wrap" }}>
                <button className="btn primary" disabled={busy} onClick={() => void act("save")}>Salvar correção</button>
                {check && (
                  <button className="btn" disabled={busy} onClick={() => void act("ack")} title="Mantém o valor e remove o amarelo">
                    Marcar como conferido
                  </button>
                )}
                {(corrected || acked) && (
                  <button className="btn link" disabled={busy} onClick={() => void act("clear")}>Desfazer conferência</button>
                )}
              </div>
              <p className="muted small" style={{ marginTop: 8 }}>
                A leitura original da IA é mantida; a correção fica registrada com seu nome e a data.
              </p>
            </>
          ) : (
            <p className="muted">Seu papel não permite corrigir.</p>
          )}
          {err && <p className="error">{err}</p>}
        </>
      )}
    </div>
  );
}
