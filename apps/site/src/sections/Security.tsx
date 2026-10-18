import { brand } from "../config/brand";

const principles = [
  { term: "Inteligência artificial especializada no fluxo", text: "Utilização da API da Anthropic Claude para auxiliar na interpretação dos documentos." },
  { term: "Processamento estruturado", text: "Os resultados são submetidos a validações e regras de negócio antes de serem utilizados." },
  { term: "Gestão documental", text: "Os arquivos são organizados por projeto, com referências e histórico." },
  { term: "Controle de acesso", text: "A arquitetura prevê autenticação, permissões e proteção dos documentos." },
  { term: "Revisão humana", text: "Informações ambíguas ou conflitantes poderão ser encaminhadas para validação." },
  { term: "Histórico de versões", text: "O objetivo é preservar o histórico e impedir a substituição silenciosa de dados anteriormente aprovados." },
];

export function Security() {
  return (
    <section id="seguranca" className="section section--deep" aria-labelledby="seg-titulo">
      <div className="wrap">
        <div className="section-head">
          <h2 id="seg-titulo" className="h2">Tecnologia aplicada com foco em controle e rastreabilidade.</h2>
        </div>
        <dl className="spec">
          {principles.map((p) => (
            <div key={p.term}><dt>{p.term}</dt><dd>{p.text}</dd></div>
          ))}
        </dl>
        <p className="note spec__note">
          Transparência: a análise dos documentos usa um serviço externo de IA, e os requisitos finais de segurança, retenção e
          compartilhamento serão definidos com cada empresa. O {brand.name} ainda não possui certificações ou atestados de
          conformidade, e nenhum deles é alegado aqui.
        </p>
      </div>
    </section>
  );
}
