import { useId, useState } from "react";
import { Icon } from "../components/Icon";
import { bomTotals, lineTotalGrams, pendingLines, visibleBomLines, type StateFilter } from "./bom";
import { BOM_NOTICE, demoBom, demoBomVersion, STATE_LABEL, type ValidationState } from "./data";
import { downloadBlob } from "./download";
import { EXPORT_BASENAME, toCsv, toXlsx } from "./exportBom";
import { formatKg, formatKgUnit } from "./format";
import { StateBadge } from "./StateBadge";

const FILTERS: { value: StateFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "validated", label: STATE_LABEL.validated },
  { value: "check", label: STATE_LABEL.check },
  { value: "not_found", label: STATE_LABEL.not_found },
];

export function BomTable() {
  const uid = useId();
  const [query, setQuery] = useState("");
  const [state, setState] = useState<StateFilter>("all");
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [message, setMessage] = useState("");

  const rows = visibleBomLines(demoBom, { query, state, collapsed });
  const totals = bomTotals(demoBom);
  const pending = pendingLines(demoBom);
  const countOf = (f: StateFilter) => (f === "all" ? demoBom.length : totals.byState[f as ValidationState]);
  const filtering = query.trim() !== "" || state !== "all";

  const toggle = (item: string) =>
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(item)) n.delete(item); else n.add(item);
      return n;
    });

  const exportAs = (kind: "xlsx" | "csv") => {
    if (kind === "xlsx") {
      downloadBlob(`${EXPORT_BASENAME}.xlsx`, toXlsx(demoBom), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    } else {
      downloadBlob(`${EXPORT_BASENAME}.csv`, toCsv(demoBom), "text/csv;charset=utf-8");
    }
    setMessage(`Arquivo demonstrativo ${EXPORT_BASENAME}.${kind} gerado no seu navegador com os dados fictícios desta tabela.`);
  };

  return (
    <div className="pd-bom">
      <div className="pd-bom__top">
        <dl className="pd-version" aria-label="Versão da lista">
          <div><dt>Versão</dt><dd>{demoBomVersion.number} · {demoBomVersion.label}</dd></div>
          <div><dt>Base</dt><dd>{demoBomVersion.basis}</dd></div>
          <div><dt>Situação</dt><dd>{demoBomVersion.approval}</dd></div>
        </dl>
        <div className="pd-bom__export">
          <button type="button" className="pd-btn" onClick={() => exportAs("xlsx")}><Icon name="download" size={14} /> Exportar XLSX (demonstrativo)</button>
          <button type="button" className="pd-btn" onClick={() => exportAs("csv")}><Icon name="download" size={14} /> Exportar CSV (demonstrativo)</button>
        </div>
      </div>
      <p className="pd-hint" role="status">{message || `${demoBomVersion.note} Os arquivos exportados usam apenas os dados fictícios mostrados aqui.`}</p>

      <div className="pd-toolbar">
        <div className="pd-search">
          <label htmlFor={`${uid}-q`} className="visually-hidden">Pesquisar por código ou descrição</label>
          <Icon name="search" size={16} />
          <input id={`${uid}-q`} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Pesquisar código ou descrição" autoComplete="off" />
        </div>
        <div className="pd-filters" role="group" aria-label="Filtrar por estado">
          {FILTERS.map((f) => (
            <button key={f.value} type="button" className="pd-chip" aria-pressed={state === f.value} onClick={() => setState(f.value)}>
              {f.label} <span>{countOf(f.value)}</span>
            </button>
          ))}
        </div>
      </div>

      <table className="pd-table pd-table--bom">
        <caption className="visually-hidden">Lista de materiais demonstrativa de CJ-001</caption>
        <thead>
          <tr>
            <th scope="col">Item</th>
            <th scope="col">Código</th>
            <th scope="col">Descrição</th>
            <th scope="col" className="num">Qtd.</th>
            <th scope="col">Un.</th>
            <th scope="col">Material</th>
            <th scope="col" className="num">Peso unit.</th>
            <th scope="col" className="num">Peso total</th>
            <th scope="col">Estado</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr className="pd-none"><td colSpan={9}>Nenhum item corresponde à pesquisa ou ao filtro.</td></tr>
          )}
          {rows.map((l) => {
            const total = lineTotalGrams(l);
            const isAsm = l.kind === "assembly";
            const open = !collapsed.has(l.item);
            return (
              <tr key={l.item} className={isAsm ? "is-assembly" : "is-component"}>
                <td data-label="Item" className="pd-item">
                  {isAsm ? (
                    <button type="button" className="pd-toggle" aria-expanded={open && !filtering} aria-label={`${open ? "Recolher" : "Expandir"} ${l.code}`} disabled={filtering} onClick={() => toggle(l.item)}>
                      <span aria-hidden="true" className={open ? "pd-caret is-open" : "pd-caret"} />
                      {l.item}
                    </button>
                  ) : (
                    <span className="pd-indent">{l.item}</span>
                  )}
                </td>
                <th scope="row" data-label="Código" className="pd-code">
                  <span className="pd-kind">{isAsm ? "Conjunto" : "Componente"}</span>
                  {l.code}
                </th>
                <td data-label="Descrição">{l.description}</td>
                <td data-label="Qtd." className="num">{l.quantity}</td>
                <td data-label="Un.">{l.unit}</td>
                <td data-label="Material">{l.material ?? "Não identificado"}</td>
                <td data-label="Peso unit." className="num">{formatKgUnit(l.unitWeightGrams)}</td>
                <td data-label="Peso total" className="num">{total === null ? "—" : `${formatKg(total)} kg`}</td>
                <td data-label="Estado"><StateBadge state={l.state} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="pd-totals">
        <h4>Totais</h4>
        <ul>
          <li><strong>{totals.assemblies}</strong> conjunto e <strong>{totals.components}</strong> componentes</li>
          <li><strong>{totals.pieces}</strong> peças somando as quantidades dos componentes</li>
          <li>
            Peso parcial dos componentes: <strong>{formatKg(totals.partialWeightGrams)} kg</strong>
            {totals.weightedToCheck > 0 && ` (inclui ${totals.weightedToCheck} item em “Conferir”)`}
          </li>
          <li>Peso do conjunto CJ-001: <strong>não identificado</strong>, pois o desenho não o define; o total acima não o substitui.</li>
        </ul>
      </div>

      <div className="pd-pending">
        <h4>Pendências ({pending.length})</h4>
        <ul>
          {pending.map((l) => (
            <li key={l.item}><strong>{l.code}</strong> <StateBadge state={l.state} /> {l.pendingNote}</li>
          ))}
        </ul>
      </div>

      <p className="pd-notice"><Icon name="alert" size={16} /> {BOM_NOTICE}</p>
    </div>
  );
}
