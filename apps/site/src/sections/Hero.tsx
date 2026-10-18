import { anchors } from "../config/brand";
import { Icon, type IconName } from "../components/Icon";
import { DashboardMockup } from "../demo/DashboardMockup";

const pillars: { icon: IconName; text: string }[] = [
  { icon: "scan", text: "Leitura assistida por IA" },
  { icon: "trace", text: "Informações rastreáveis" },
  { icon: "table", text: "BOM estruturada e exportável" },
];

export function Hero() {
  return (
    <section id="topo" className="section section--gray hero" aria-labelledby="hero-title">
      <div className="wrap hero__grid">
        <div className="hero__copy">
          <p className="hero__kicker">Inteligência artificial aplicada à engenharia mecânica</p>
          <h1 id="hero-title" className="hero__title">
            Dos desenhos mecânicos à BOM. Com muito menos trabalho manual.
          </h1>
          <p className="lead">
            Centralize seus projetos, extraia informações técnicas de PDFs e transforme desenhos mecânicos em listas de
            materiais estruturadas, com rastreabilidade, validação e controle de revisões.
          </p>
          <div className="hero__actions">
            <a className="btn btn--primary" href={anchors.budget}>Ver orçamento</a>
            <a className="btn btn--ghost" href={anchors.platform}>Conhecer a plataforma</a>
          </div>
          <ul className="hero__pillars">
            {pillars.map((p) => (
              <li key={p.text}>
                <Icon name={p.icon} size={22} />
                <span>{p.text}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="hero__demo">
          <DashboardMockup />
          <p className="note hero__note">Passe o mouse (ou use Tab) sobre os balões do desenho e sobre os itens da BOM: a ligação entre os dois é o que a plataforma preserva.</p>
        </div>
      </div>
    </section>
  );
}
