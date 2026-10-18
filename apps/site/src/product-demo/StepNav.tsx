import { useRef, type KeyboardEvent } from "react";

export interface StepDef {
  id: string;
  number: string;
  title: string;
  text: string;
}

export const steps: readonly StepDef[] = [
  { id: "receber", number: "01", title: "Receber PDFs", text: "Organize os desenhos dentro de um projeto e acompanhe o processamento dos documentos." },
  { id: "extrair", number: "02", title: "Extrair dados", text: "A IA auxilia na identificação das informações técnicas, enquanto regras de validação ajudam a identificar pendências." },
  { id: "bom", number: "03", title: "Gerar BOM", text: "Visualize componentes e relações entre conjuntos, confira as informações e exporte a lista de materiais." },
];

export const tabId = (i: number) => `pd-tab-${steps[i]!.id}`;
export const panelId = (i: number) => `pd-panel-${steps[i]!.id}`;

/** Três controles de navegação (abas acessíveis: setas, Home e End). */
export function StepNav({ active, onSelect }: { active: number; onSelect: (i: number) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const go = (i: number) => {
    const n = (i + steps.length) % steps.length;
    onSelect(n);
    refs.current[n]?.focus();
  };
  const onKey = (e: KeyboardEvent, i: number) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); go(i + 1); }
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); go(i - 1); }
    else if (e.key === "Home") { e.preventDefault(); go(0); }
    else if (e.key === "End") { e.preventDefault(); go(steps.length - 1); }
  };
  return (
    <div role="tablist" aria-label="Etapas da demonstração" className="pd-steps">
      {steps.map((s, i) => (
        <button
          key={s.id}
          ref={(el) => { refs.current[i] = el; }}
          role="tab"
          type="button"
          id={tabId(i)}
          aria-selected={i === active}
          aria-controls={panelId(i)}
          tabIndex={i === active ? 0 : -1}
          className="pd-step"
          onClick={() => onSelect(i)}
          onKeyDown={(e) => onKey(e, i)}
        >
          <span className="pd-step__title"><span className="pd-step__num">{s.number}</span> — {s.title}</span>
          <span className="pd-step__text">{s.text}</span>
        </button>
      ))}
    </div>
  );
}
