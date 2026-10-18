import { TraceabilityDemo } from "../demo/TraceabilityDemo";

export function Traceability() {
  return (
    <section id="rastreabilidade" className="section section--gray" aria-labelledby="rastro-titulo">
      <div className="wrap">
        <div className="section-head">
          <h2 id="rastro-titulo" className="h2">Cada informação precisa ter uma origem verificável.</h2>
          <p className="lead">Selecione um campo para ver de onde ele veio. O campo pendente aparece com a região do documento destacada.</p>
        </div>
        <TraceabilityDemo />
        <p className="note trace__support">
          A inteligência artificial auxilia a extração. Regras de validação e revisão humana ajudam a evitar que informações
          incompletas ou conflitantes sejam tratadas como dados confirmados. A tela é uma demonstração ilustrativa criada com
          componentes web, sem reconhecimento visual real.
        </p>
      </div>
    </section>
  );
}
