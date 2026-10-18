/**
 * Marca e condições comerciais do site de apresentação — ÚNICO lugar a editar.
 * O nome é provisório: trocar `name` atualiza título, textos, rodapé e metadados.
 *
 * Regra: nada de dado inventado. Os valores abaixo foram informados pelo responsável pelo projeto.
 */
export const brand = {
  name: "MECABOM",
  shortName: "MECABOM",
  tagline: "Dos desenhos mecânicos à BOM",
  description:
    "Plataforma de inteligência artificial para ler desenhos mecânicos em PDF, extrair informações técnicas com rastreabilidade e estruturar listas de materiais (BOM).",
  locale: "pt-BR",
} as const;

/** Condições informadas pelo responsável pelo projeto. Valores em reais (BRL). */
export const pricing = {
  /** Valor do projeto, pago uma vez. */
  projectBRL: 13000,
  /** Valor mensal, devido após o pagamento do projeto. */
  monthlyBRL: 300,
} as const;

export const navLinks = [
  { label: "Visão geral", href: "#visao-geral" },
  { label: "Como funciona", href: "#como-funciona" },
  { label: "Demonstração", href: "#demonstracao" },
  { label: "Funcionalidades", href: "#funcionalidades" },
  { label: "Custos", href: "#reducao-de-custos" },
  { label: "Segurança", href: "#seguranca" },
  { label: "Orçamento", href: "#orcamento" },
  { label: "FAQ", href: "#faq" },
] as const;

/** Âncoras usadas pelos botões. */
export const anchors = {
  budget: "#orcamento",
  demo: "#demonstracao",
  platform: "#visao-geral",
} as const;
