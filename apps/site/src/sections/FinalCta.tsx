import { anchors } from "../config/brand";

export function FinalCta() {
  return (
    <section className="section section--deep final on-dark" aria-labelledby="final-titulo">
      <div className="wrap">
        <h2 id="final-titulo" className="h2 final__title">Sua equipe merece dedicar menos tempo à transcrição e mais tempo à engenharia.</h2>
        <p className="lead">
          Conheça uma nova forma de organizar desenhos mecânicos, estruturar listas de materiais e dar mais rastreabilidade às
          informações dos seus projetos.
        </p>
        <div className="final__actions">
          <a className="btn btn--primary" href={anchors.budget}>Ver orçamento</a>
          <a className="btn btn--ghost" href={anchors.demo}>Ver a demonstração</a>
        </div>
      </div>
    </section>
  );
}
