import { useRef, useState, type KeyboardEvent } from "react";
import { Icon, type IconName } from "../components/Icon";
import { featureDemos } from "../demo/FeatureDemos";

/** Abas acessíveis (setas, Home e End). Cada aba mostra uma demonstração diferente. */
export function Features() {
  const [active, setActive] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const select = (i: number) => {
    const n = (i + featureDemos.length) % featureDemos.length;
    setActive(n);
    tabs.current[n]?.focus();
  };
  const onKey = (e: KeyboardEvent, i: number) => {
    if (e.key === "ArrowDown" || e.key === "ArrowRight") { e.preventDefault(); select(i + 1); }
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft") { e.preventDefault(); select(i - 1); }
    else if (e.key === "Home") { e.preventDefault(); select(0); }
    else if (e.key === "End") { e.preventDefault(); select(featureDemos.length - 1); }
  };
  const current = featureDemos[active]!;

  return (
    <section id="funcionalidades" className="section section--white" aria-labelledby="func-titulo">
      <div className="wrap">
        <div className="section-head">
          <h2 id="func-titulo" className="h2">Mais do que ler PDFs: organize todo o fluxo documental do projeto.</h2>
          <p className="lead">Escolha uma capacidade para ver como ela deve funcionar. As telas usam dados demonstrativos e as capacidades estão em desenvolvimento.</p>
        </div>
        <div className="features">
          <div role="tablist" aria-label="Funcionalidades" aria-orientation="vertical" className="features__tabs">
            {featureDemos.map((f, i) => (
              <button
                key={f.id}
                ref={(el) => { tabs.current[i] = el; }}
                role="tab"
                id={`tab-${f.id}`}
                aria-selected={i === active}
                aria-controls={`painel-${f.id}`}
                tabIndex={i === active ? 0 : -1}
                onClick={() => setActive(i)}
                onKeyDown={(e) => onKey(e, i)}
              >
                <Icon name={f.icon as IconName} size={20} />
                <span>{f.title}</span>
              </button>
            ))}
          </div>
          <div role="tabpanel" id={`painel-${current.id}`} aria-labelledby={`tab-${current.id}`} className="features__panel" tabIndex={0}>
            <div className="features__meta">
              <span className="demo-chip">Demonstração ilustrativa</span>
              <span className="demo-chip">Em desenvolvimento</span>
            </div>
            <h3>{current.title}</h3>
            <p>{current.text}</p>
            <div className="features__stage">{current.demo}</div>
          </div>
        </div>
      </div>
    </section>
  );
}
