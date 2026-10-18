import { useState } from "react";
import { BomTable } from "./BomTable";
import { DemoCta } from "./DemoCta";
import { DocumentsTable } from "./DocumentsTable";
import { DEMO_PDF_DOCUMENT_ID, demoDocuments } from "./data";
import { ExtractedFields } from "./ExtractedFields";
import { ProjectFrame } from "./ProjectFrame";
import { panelId, StepNav, steps, tabId } from "./StepNav";

const copy = [
  { title: "Todos os desenhos do projeto em um só lugar.", text: "Organize os documentos técnicos em um ambiente próprio e acompanhe o processamento de cada arquivo." },
  { title: "Informações técnicas organizadas e verificáveis.", text: "O MECABOM foi concebido para extrair dados dos desenhos, organizar os campos identificados e sinalizar informações que precisam de revisão." },
  { title: "Dos desenhos para uma lista de materiais organizada.", text: "Visualize conjuntos, subconjuntos e componentes, confira quantidades e materiais e exporte informações estruturadas quando os dados disponíveis permitirem." },
] as const;

/** Demonstração interativa em 3 etapas. Dados 100% ilustrativos (veja data.ts). */
export function ProductDemo() {
  const [step, setStep] = useState(0);
  const [selectedId, setSelectedId] = useState(DEMO_PDF_DOCUMENT_ID);
  const known = demoDocuments.some((d) => d.id === selectedId);
  const current = copy[step]!;

  return (
    <section id="demonstracao" className="section section--dark on-dark pd" aria-labelledby="pd-titulo">
      <div className="wrap">
        <div className="section-head">
          <p className="pd-kicker">Inteligência artificial aplicada à engenharia</p>
          <h2 id="pd-titulo" className="h2">Do desenho mecânico à BOM. Veja como funciona.</h2>
          <p className="lead">
            Entenda como o MECABOM organiza documentos técnicos, extrai informações dos desenhos e auxilia na construção de listas de
            materiais estruturadas e rastreáveis.
          </p>
        </div>

        <StepNav active={step} onSelect={setStep} />

        <div role="tabpanel" id={panelId(step)} aria-labelledby={tabId(step)} className="pd-panel" tabIndex={-1}>
          <div className="pd-panel__head">
            <h3>{current.title}</h3>
            <p>{current.text}</p>
          </div>
          <ProjectFrame activeTab={step as 0 | 1 | 2}>
            {step === 0 && <DocumentsTable selectedId={known ? selectedId : DEMO_PDF_DOCUMENT_ID} onSelect={setSelectedId} onOpenPreview={() => setStep(1)} />}
            {step === 1 && <ExtractedFields documentId={selectedId} onSelect={setSelectedId} />}
            {step === 2 && <BomTable />}
          </ProjectFrame>
          <div className="pd-next">
            {step > 0 && <button type="button" className="btn btn--ghost" onClick={() => setStep(step - 1)}>Voltar: {steps[step - 1]!.title}</button>}
            {step < steps.length - 1 && <button type="button" className="btn btn--primary" onClick={() => setStep(step + 1)}>Próxima etapa: {steps[step + 1]!.title}</button>}
          </div>
        </div>

        <DemoCta />
      </div>
    </section>
  );
}
