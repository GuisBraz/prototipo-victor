import { useId, useState } from "react";

interface FaqItem { q: string; a: string; list?: readonly string[]; after?: string }

const savingsAreas = [
  "Horas de trabalho da engenharia: menos tempo abrindo desenhos individualmente, procurando informações e transcrevendo dados para planilhas. Economia potencial: horas de trabalho operacional.",
  "Montagem manual das listas BOM: reduz o trabalho de reunir códigos, descrições, quantidades, materiais e referências em uma lista consolidada. Economia potencial: tempo de preparação e consolidação das listas.",
  "Retrabalho e correções: identificar campos ausentes, referências divergentes e inconsistências antes de usar os dados pode reduzir correções posteriores. Economia potencial: horas gastas corrigindo erros e refazendo atividades.",
  "Compras incorretas ou incompletas: uma BOM mais organizada e rastreável ajuda a identificar componentes ausentes, quantidades divergentes e referências a desenhos desatualizados antes das solicitações de compra. Benefício potencial: menos compras equivocadas, urgências e correções de pedidos.",
  "Conferência de revisões: destacar divergências ajuda a perceber quando um desenho foi atualizado e quando a BOM precisa ser reavaliada. Benefício potencial: menor risco de usar documentação desatualizada.",
  "Busca e organização documental: pesquisar desenhos por código, descrição, revisão e projeto em uma área centralizada, em vez de pastas e planilhas dispersas. Economia potencial: tempo de busca e conferência.",
  "Tempo de preparação dos projetos: processar documentos em lote e reaproveitar a estrutura do projeto pode acelerar etapas administrativas antes da fabricação, do planejamento e das compras. Benefício potencial: maior agilidade no fluxo de trabalho.",
] as const;

const items: FaqItem[] = [
  { q: "O sistema consegue ler qualquer desenho mecânico?", a: "A plataforma é projetada para analisar diferentes tipos de desenhos, mas a qualidade dos resultados depende do conteúdo, da legibilidade e do padrão documental. Documentos incompletos ou ambíguos podem precisar de revisão." },
  { q: "A IA garante uma BOM sem erros?", a: "Não. A inteligência artificial pode cometer erros de interpretação. O sistema deve validar os dados, sinalizar inconsistências e permitir conferência humana, principalmente antes da aprovação de informações utilizadas em processos industriais." },
  { q: "O que acontece quando o PDF não informa o peso ou o material?", a: "O campo deve ser marcado como não identificado, sem inventar ou preencher automaticamente uma informação que não consta no documento." },
  { q: "Consigo enviar vários PDFs de uma vez?", a: "A experiência prevista permite o envio em lote, com acompanhamento individual do processamento de cada arquivo." },
  { q: "Posso adicionar desenhos depois de criar o projeto?", a: "Sim. O fluxo previsto permite adicionar documentos a projetos existentes, relacionar novos registros e identificar possíveis conflitos ou revisões." },
  { q: "A plataforma gera BOM hierárquica?", a: "A geração depende da existência de referências e quantidades suficientes para identificar as relações entre conjuntos, subconjuntos e componentes." },
  { q: "Posso exportar para Excel?", a: "A funcionalidade prevista permite exportar listas de materiais para Excel e CSV, após as validações e aprovações necessárias." },
  { q: "Como são protegidos os desenhos industriais?", a: "A arquitetura prevê controle de acesso, armazenamento protegido e tratamento seguro dos documentos. Os requisitos finais de segurança, retenção e compartilhamento deverão ser definidos conforme a implementação e a política de cada empresa." },
  {
    q: "Quanto a empresa pode economizar?",
    a: "Não há um percentual ou valor em reais que possa ser garantido: depende do volume de desenhos, da qualidade dos documentos e do processo atual de cada empresa. Ao adotar o MECABOM, a economia potencial está nestas áreas:",
    list: savingsAreas,
    after: "Cada ganho é potencial. As informações extraídas continuam exigindo conferência humana antes de serem usadas.",
  },
  { q: "Como posso conhecer a plataforma?", a: "Esta página apresenta a plataforma com telas demonstrativas. A demonstração interativa mostra o caminho do PDF à BOM com dados ilustrativos, e o investimento está na seção Orçamento." },
];

export function Faq() {
  const uid = useId();
  const [open, setOpen] = useState<number | null>(null);
  return (
    <section id="faq" className="section section--gray" aria-labelledby="faq-titulo">
      <div className="wrap split">
        <div className="split__lead">
          <h2 id="faq-titulo" className="h2">Perguntas frequentes</h2>
        </div>
        <div className="faq">
          {items.map((it, i) => {
            const isOpen = open === i;
            return (
              <div key={it.q} className="faq__item">
                <h3>
                  <button type="button" aria-expanded={isOpen} aria-controls={`${uid}-p${i}`} id={`${uid}-b${i}`} onClick={() => setOpen(isOpen ? null : i)}>
                    <span>{it.q}</span>
                    <span className="faq__icon" aria-hidden="true" />
                  </button>
                </h3>
                <div id={`${uid}-p${i}`} role="region" aria-labelledby={`${uid}-b${i}`} hidden={!isOpen} className="faq__panel">
                  <p>{it.a}</p>
                  {it.list && <ol className="faq__list">{it.list.map((t) => <li key={t}>{t}</li>)}</ol>}
                  {it.after && <p>{it.after}</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
