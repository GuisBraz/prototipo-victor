import { brand } from "../config/brand";
import { Icon, type IconName } from "../components/Icon";

const pillars: { icon: IconName; title: string; text: string }[] = [
  { icon: "folder", title: "Centralização", text: "Todos os PDFs e registros de um projeto ficam organizados em uma área própria." },
  { icon: "scan", title: "Extração inteligente", text: "O sistema identifica informações relevantes dos desenhos, utilizando extração de texto, OCR quando necessário e análise multimodal por IA." },
  { icon: "shield", title: "Validação técnica", text: "Os dados são organizados, conferidos e sinalizados quando existem ambiguidades ou informações ausentes." },
  { icon: "tree", title: "BOM e rastreabilidade", text: "Os resultados podem ser estruturados em uma lista hierárquica ou consolidada, conforme as informações disponíveis nos documentos." },
];

const loose = ["desenho_a.pdf", "legenda_rev.pdf", "conjunto_final.pdf", "peca_07.pdf", "planilha_bom.xlsx"];

function ChaosToOrder() {
  return (
    <figure className="c2o" aria-label="Ilustração: arquivos dispersos se transformam em registros estruturados">
      <div className="c2o__loose" aria-hidden="true">
        {loose.map((n, i) => (
          <span key={n} className={`c2o__file c2o__file--${i}`}><Icon name="file" size={16} />{n}</span>
        ))}
      </div>
      <svg className="c2o__arrow" width="56" height="24" viewBox="0 0 56 24" aria-hidden="true">
        <path d="M2 12h48M42 5l8 7-8 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <table className="c2o__table">
        <caption className="visually-hidden">Registro estruturado de exemplo</caption>
        <thead><tr><th scope="col">Campo</th><th scope="col">Valor</th><th scope="col">Origem</th></tr></thead>
        <tbody>
          <tr><td>Desenho</td><td>DEMO-1200</td><td>pág. 1, legenda</td></tr>
          <tr><td>Revisão</td><td>C</td><td>pág. 1, legenda</td></tr>
          <tr><td>Material</td><td>Aço carbono</td><td>pág. 1, tabela</td></tr>
          <tr><td>Peso</td><td><span className="tag tag--missing">Não identificado</span></td><td>—</td></tr>
        </tbody>
      </table>
      <figcaption className="note">Ilustração com dados demonstrativos.</figcaption>
    </figure>
  );
}

export function Solution() {
  return (
    <section id="visao-geral" className="section section--gray" aria-labelledby="solucao-titulo">
      <div className="wrap">
        <div className="section-head">
          <h2 id="solucao-titulo" className="h2">Uma plataforma para organizar documentos e transformar desenhos em dados utilizáveis.</h2>
          <p className="lead">
            O {brand.name} combina leitura assistida por inteligência artificial, validação de informações técnicas e regras de
            software para apoiar a criação e o controle de listas de materiais.
          </p>
        </div>
        <ChaosToOrder />
        <ul className="pillars">
          {pillars.map((p) => (
            <li key={p.title}>
              <Icon name={p.icon} size={26} />
              <div>
                <h3>{p.title}</h3>
                <p>{p.text}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
