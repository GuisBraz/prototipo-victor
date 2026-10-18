import { Icon, type IconName } from "../components/Icon";
import { anchors, brand } from "../config/brand";

const gains: { icon: IconName; title: string; text: string }[] = [
  { icon: "clock", title: "Tempo de leitura", text: "Redução potencial do trabalho repetitivo necessário para localizar e registrar informações." },
  { icon: "table", title: "Montagem de BOM", text: "Menor necessidade de transcrever manualmente dados e consolidar componentes." },
  { icon: "alert", title: "Retrabalho", text: "Possibilidade de identificar campos ausentes, divergências e referências inconsistentes antes da utilização dos dados." },
  { icon: "folder", title: "Organização", text: "Menor dispersão das informações e maior facilidade para localizar documentos e consultar o histórico." },
];

export function Savings() {
  return (
    <section id="reducao-de-custos" className="section section--white" aria-labelledby="ganhos-titulo">
      <div className="wrap">
        <div className="section-head">
          <h2 id="ganhos-titulo" className="h2">Menos tempo em tarefas repetitivas. Mais capacidade para a engenharia.</h2>
          <p className="lead">
            A organização e a leitura manual de grandes volumes de desenhos podem consumir horas de trabalho especializado. Ao
            automatizar partes desse fluxo, o {brand.name} busca reduzir o esforço operacional e liberar a equipe para atividades
            de maior valor.
          </p>
        </div>
        <ul className="gains">
          {gains.map((g) => (
            <li key={g.title} className="gain">
              <Icon name={g.icon} size={28} />
              <h3>{g.title}</h3>
              <p>{g.text}</p>
            </li>
          ))}
        </ul>
        <p className="gains__statement">
          Os ganhos não são prometidos em números: dependem dos desenhos e do processo de cada empresa e podem ser acompanhados com indicadores.{" "}
          Veja <a href={anchors.demo}>como o fluxo funciona</a> na demonstração.
        </p>
      </div>
    </section>
  );
}
