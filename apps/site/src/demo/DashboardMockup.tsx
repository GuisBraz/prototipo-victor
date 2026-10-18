import { useState } from "react";
import { brand } from "../config/brand";
import { demoBom, demoDrawings, demoProject, fieldStateLabel, statusLabel, type FieldState } from "./data";
import { DrawingSketch } from "./DrawingSketch";

export function StateTag({ state }: { state: FieldState }) {
  return <span className={`tag tag--${state}`}>{fieldStateLabel[state]}</span>;
}

/** Mockup do painel feito com HTML/CSS reais. Dados demonstrativos, derivados de demo/data.ts. */
export function DashboardMockup() {
  const [active, setActive] = useState<number | null>(null);
  const total = demoDrawings.length;
  const processed = demoDrawings.filter((d) => d.status === "processed").length;
  const toReview = demoDrawings.filter((d) => d.status === "review").length;

  return (
    <figure className="mock" aria-label={`Painel demonstrativo do ${brand.name}`}>
      <div className="mock__chrome">
        <span className="mock__dots" aria-hidden="true">
          <i /><i /><i />
        </span>
        <span className="mock__title">{demoProject.name}</span>
        <span className="demo-chip">Dados demonstrativos</span>
      </div>

      <div className="mock__kpis">
        <div><strong>{total}</strong><span>desenhos cadastrados</span></div>
        <div><strong>{processed}</strong><span>processados</span></div>
        <div className="is-alert"><strong>{toReview}</strong><span>pendente de revisão</span></div>
      </div>

      <div className="mock__split">
        <div className="mock__sheet">
          <DrawingSketch active={active} onActive={setActive} />
        </div>
        <table className="mock__table mock__table--bom">
          <caption className="visually-hidden">Prévia da BOM demonstrativa</caption>
          <thead>
            <tr><th scope="col">Item</th><th scope="col">Descrição</th><th scope="col">Qtd.</th><th scope="col">Situação</th></tr>
          </thead>
          <tbody>
            {demoBom.map((r) => (
              <tr
                key={r.balloon}
                className={active === r.balloon ? "is-active" : undefined}
                onMouseEnter={() => setActive(r.balloon)}
                onMouseLeave={() => setActive(null)}
              >
                <td><span className="bal">{r.balloon}</span></td>
                <td style={{ paddingLeft: `${8 + r.level * 10}px` }}>
                  <span className="mono">{r.number}</span>
                  <span className="sub">{r.description}</span>
                </td>
                <td>{r.quantity}</td>
                <td><StateTag state={r.state} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <table className="mock__table mock__table--drawings">
        <caption className="visually-hidden">Desenhos do projeto demonstrativo</caption>
        <thead>
          <tr><th scope="col">Desenho</th><th scope="col">Rev.</th><th scope="col">Tipo</th><th scope="col">Processamento</th></tr>
        </thead>
        <tbody>
          {demoDrawings.map((d) => (
            <tr key={d.number}>
              <td><span className="mono">{d.number}</span><span className="sub">{d.description}</span></td>
              <td>{d.revision}</td>
              <td>{d.kind}</td>
              <td><span className={`status status--${d.status}`}>{statusLabel[d.status]}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
