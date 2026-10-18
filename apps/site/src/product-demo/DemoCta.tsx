import { anchors } from "../config/brand";

export function DemoCta() {
  return (
    <div className="pd-cta">
      <div>
        <h3>Pronto para conhecer a plataforma?</h3>
        <p>Descubra como o MECABOM pode se encaixar no fluxo documental da sua empresa.</p>
      </div>
      <a className="btn btn--primary" href={anchors.budget}>Solicitar demonstração</a>
    </div>
  );
}
