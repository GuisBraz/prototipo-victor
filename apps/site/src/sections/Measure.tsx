import { Icon } from "../components/Icon";

const metrics = [
  "Tempo médio para analisar um desenho",
  "Tempo total para preparar uma BOM",
  "Quantidade de campos corrigidos manualmente",
  "Percentual de desenhos com informações extraídas com sucesso",
  "Percentual de campos que precisam de revisão humana",
  "Quantidade de inconsistências identificadas",
  "Custo estimado por desenho processado",
  "Horas de trabalho consumidas por projeto",
];

const distinctions = [
  { term: "Precisão da extração", text: "Quanto do que foi lido confere com o que está no documento." },
  { term: "Completude dos dados", text: "Quantos campos esperados constam nos desenhos e foram preenchidos." },
  { term: "Qualidade da BOM", text: "Se as relações e quantidades formam uma lista consistente, sem referências ausentes ou conflitos." },
];

export function Measure() {
  return (
    <section id="medicao" className="section section--gray" aria-labelledby="medir-titulo">
      <div className="wrap split">
        <div className="split__lead">
          <h2 id="medir-titulo" className="h2">Resultados que podem ser medidos, não apenas prometidos.</h2>
          <p className="lead">
            Comparar o processo atual com o processo assistido pelo software, em uma amostra representativa de desenhos,
            permite avaliar o ganho real para cada empresa.
          </p>
        </div>
        <div>
          <h3 className="measure__h">O que pode ser acompanhado</h3>
          <ul className="checklist">
            {metrics.map((m) => (<li key={m}><Icon name="check" size={20} /><span>{m}</span></li>))}
          </ul>
          <h3 className="measure__h">Três medidas que não devem ser confundidas</h3>
          <dl className="distinct">
            {distinctions.map((d) => (<div key={d.term}><dt>{d.term}</dt><dd>{d.text}</dd></div>))}
          </dl>
        </div>
      </div>
    </section>
  );
}
