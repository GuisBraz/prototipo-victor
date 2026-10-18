import { Icon, type IconName } from "../components/Icon";

const problems: { icon: IconName; title: string; text: string }[] = [
  { icon: "file", title: "Leitura individual de desenhos", text: "O trabalho de localizar códigos, descrições, materiais e pesos pode consumir tempo da equipe." },
  { icon: "table", title: "Consolidação manual da BOM", text: "A compilação de componentes e quantidades exige atenção e pode gerar retrabalho." },
  { icon: "folder", title: "Informações dispersas", text: "Desenhos, revisões, planilhas e registros podem ficar espalhados em diferentes locais." },
  { icon: "alert", title: "Inconsistências difíceis de detectar", text: "Referências ausentes, revisões divergentes e campos não preenchidos podem passar despercebidos." },
  { icon: "refresh", title: "Alterações de projeto", text: "A chegada de desenhos atualizados pode exigir novas conferências e análises de impacto." },
  { icon: "trace", title: "Falta de rastreabilidade", text: "Sem um processo estruturado, pode ser difícil descobrir de qual desenho veio determinada informação." },
];

export function Problem() {
  return (
    <section id="problema" className="section section--white" aria-labelledby="problema-titulo">
      <div className="wrap split">
        <div className="split__lead">
          <h2 id="problema-titulo" className="h2">Projetos complexos não deveriam depender de processos manuais repetitivos.</h2>
          <p className="lead">
            Em muitos fluxos de engenharia, a organização de desenhos e a montagem de listas de materiais exigem a abertura de
            diversos PDFs, a busca de informações nas legendas, a conferência de revisões e a consolidação de dados em planilhas.
          </p>
        </div>
        <ul className="ruled-grid">
          {problems.map((p) => (
            <li key={p.title}>
              <span className="ruled-grid__icon"><Icon name={p.icon} /></span>
              <h3>{p.title}</h3>
              <p>{p.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
