import type { ReactNode } from "react";
import { demoProject } from "./data";

const sidebar = ["Visão geral", "Projetos", "Documentos", "Desenhos", "BOM", "Relatórios", "Configurações"] as const;
const projectTabs = ["Documentos", "Desenhos", "BOM", "Histórico"] as const;

/**
 * Moldura do "software": barra lateral e cabeçalho do projeto.
 * Menu e abas são apenas ilustrativos (não são botões, para não parecerem funcionar sem funcionar);
 * a aba destacada acompanha a etapa escolhida.
 */
export function ProjectFrame({ activeTab, children }: { activeTab: 0 | 1 | 2; children: ReactNode }) {
  return (
    <div className="pd-frame">
      <aside className="pd-side" aria-label="Menu do software (ilustração)">
        <p className="pd-side__brand">MECABOM</p>
        <ul>
          {sidebar.map((s) => (
            <li key={s} aria-current={s === "Projetos" ? "true" : undefined} className={s === "Projetos" ? "is-on" : undefined}>{s}</li>
          ))}
        </ul>
      </aside>
      <div className="pd-main">
        <header className="pd-proj">
          <div>
            <h3 className="pd-proj__name">{demoProject.code} — {demoProject.name}</h3>
            <p className="pd-proj__status"><span className="pd-dot" aria-hidden="true" />{demoProject.status}</p>
          </div>
          <span className="demo-chip pd-proj__chip">Dados ilustrativos</span>
          <ul className="pd-tabs" aria-label="Abas do projeto (ilustração)">
            {projectTabs.map((t, i) => (
              <li key={t} aria-current={i === activeTab ? "true" : undefined} className={i === activeTab ? "is-on" : undefined}>{t}</li>
            ))}
          </ul>
        </header>
        <div className="pd-body">{children}</div>
      </div>
    </div>
  );
}
