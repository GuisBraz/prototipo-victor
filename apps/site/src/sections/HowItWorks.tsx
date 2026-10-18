import { Icon, type IconName } from "../components/Icon";
import { useInView } from "../lib/useInView";

const steps: { icon: IconName; title: string; text: string }[] = [
  { icon: "folder", title: "Crie seu projeto", text: "Cadastre o projeto industrial e mantenha seus documentos em um ambiente próprio." },
  { icon: "upload", title: "Envie os PDFs", text: "Adicione vários desenhos de uma só vez. A plataforma registra os documentos e organiza seu processamento." },
  { icon: "scan", title: "A IA analisa os desenhos", text: "O sistema identifica informações como códigos, descrições, revisões, materiais, pesos, quantidades e referências, quando disponíveis." },
  { icon: "check", title: "Confira os resultados", text: "Visualize os dados extraídos, confira sua origem e resolva as pendências identificadas." },
  { icon: "table", title: "Gere sua BOM", text: "Organize os componentes, visualize relações entre conjuntos, acompanhe os estados de validação e exporte os resultados." },
];

export function HowItWorks() {
  const { ref, seen } = useInView<HTMLOListElement>(0.2);
  return (
    <section id="como-funciona" className="section section--dark" aria-labelledby="como-titulo">
      <div className="wrap">
        <div className="section-head">
          <h2 id="como-titulo" className="h2">Da pasta de desenhos à lista de materiais, em um fluxo organizado.</h2>
        </div>
        <ol ref={ref} className={`steps${seen ? " is-seen" : ""}`}>
          {steps.map((s, i) => (
            <li key={s.title} style={{ ["--i" as string]: i }}>
              <span className="steps__num">{i + 1}</span>
              <Icon name={s.icon} size={28} />
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </li>
          ))}
        </ol>
        <p className="note steps__note">
          A qualidade e a completude da BOM dependem das informações presentes nos documentos. Relações ausentes, campos
          ambíguos e conflitos devem ser revisados antes da aprovação.
        </p>
      </div>
    </section>
  );
}
