/**
 * Dados DEMONSTRATIVOS da seção "Do desenho mecânico à BOM" — fonte única das três etapas.
 *
 * Tudo aqui é fictício e precisa coincidir com o desenho `public/demos/CJ-001.pdf`
 * (gerado por `scripts/gerar-cj-001.py`). Se mudar um, mude o outro.
 * Nada daqui vem de leitura real de documentos.
 */

export type ValidationState = "validated" | "check" | "not_found";
export const STATE_LABEL: Record<ValidationState, string> = {
  validated: "Validado",
  check: "Conferir",
  not_found: "Não identificado",
};

export type ProcessingStatus = "processed" | "review_pending" | "queued";
export const PROCESSING_LABEL: Record<ProcessingStatus, string> = {
  processed: "Processado",
  review_pending: "Revisão pendente",
  queued: "Na fila",
};

export type DocumentKind = "Conjunto" | "Peça";

export interface DemoDocument {
  readonly id: string;
  readonly file: string;
  readonly drawingNumber: string;
  readonly kind: DocumentKind;
  readonly revision: string;
  readonly status: ProcessingStatus;
}

export const demoProject = {
  code: "PR-2026-018",
  name: "Linha de produção",
  status: "Em andamento",
} as const;

export const demoDocuments: readonly DemoDocument[] = [
  { id: "CJ-001", file: "CJ-001.pdf", drawingNumber: "CJ-001", kind: "Conjunto", revision: "A", status: "processed" },
  { id: "PC-101", file: "PC-101.pdf", drawingNumber: "PC-101", kind: "Peça", revision: "B", status: "processed" },
  { id: "PC-102", file: "PC-102.pdf", drawingNumber: "PC-102", kind: "Peça", revision: "A", status: "processed" },
  { id: "PC-103", file: "PC-103.pdf", drawingNumber: "PC-103", kind: "Peça", revision: "B", status: "review_pending" },
  { id: "CJ-002", file: "CJ-002.pdf", drawingNumber: "CJ-002", kind: "Conjunto", revision: "A", status: "queued" },
  { id: "PC-104", file: "PC-104.pdf", drawingNumber: "PC-104", kind: "Peça", revision: "A", status: "processed" },
  { id: "PC-105", file: "PC-105.pdf", drawingNumber: "PC-105", kind: "Peça", revision: "A", status: "processed" },
  { id: "EG-001", file: "EG-001.pdf", drawingNumber: "EG-001", kind: "Peça", revision: "A", status: "processed" },
];

export interface DemoPdf {
  readonly url: string;
  readonly filename: string;
  readonly alt: string;
}

const base = import.meta.env.BASE_URL;
/** Documentos que têm PDF de exemplo no site (os demais só ilustram a lista). */
export const demoPdfs: Readonly<Record<string, DemoPdf>> = {
  "CJ-001": {
    url: `${base}demos/CJ-001.pdf`,
    filename: "CJ-001.pdf",
    alt: "Desenho mecânico fictício CJ-001: vistas frontal, superior, lateral e isométrica, com legenda e lista de peças.",
  },
  "EG-001": {
    url: `${base}demos/EG-001.pdf`,
    filename: "EG-001.pdf",
    alt: "Desenho de uma engrenagem (EG-001): vistas, seção A-A, detalhe do dente, dados técnicos, notas e legenda.",
  },
};
export const DEMO_PDF_DOCUMENT_ID = "CJ-001";

export interface ExtractedField {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly state: ValidationState;
  /** Explica o estado ou a origem do valor. */
  readonly note?: string;
}

/** Campos do CJ-001, como constam no PDF demonstrativo. */
const fieldsCj001: readonly ExtractedField[] = [
  { key: "drawingNumber", label: "Número do desenho", value: "CJ-001", state: "validated", note: "Legenda, campo “Nº do desenho”." },
  { key: "revision", label: "Revisão", value: "A", state: "validated", note: "Legenda, campo “Revisão”." },
  { key: "description", label: "Descrição", value: "Conjunto principal", state: "validated", note: "Legenda, campo “Título”: CONJUNTO PRINCIPAL DE SUPORTE." },
  { key: "kind", label: "Tipo de documento", value: "Conjunto mecânico", state: "validated", note: "Legenda, campo “Tipo”." },
  {
    key: "material",
    label: "Material",
    value: "Conforme especificação do conjunto",
    state: "check",
    note: "O conjunto remete à lista de materiais; o material não é o de um componente individual.",
  },
  { key: "weight", label: "Peso", value: "Não identificado", state: "not_found", note: "O desenho não define o peso do conjunto." },
  { key: "quantity", label: "Quantidade", value: "1", state: "validated", note: "Legenda, campo “Quantidade”." },
  { key: "sourcePage", label: "Página de origem", value: "1 de 1", state: "validated", note: "Documento de página única." },
];

/** Desenho da engrenagem, lido da legenda, das notas e da tabela de dados técnicos do próprio desenho. */
const fieldsEg001: readonly ExtractedField[] = [
  { key: "drawingNumber", label: "Número do desenho", value: "EG-001", state: "validated", note: "Legenda, campo “Desenho nº”." },
  { key: "revision", label: "Revisão", value: "A", state: "validated", note: "Legenda, campo “Rev.”." },
  { key: "description", label: "Descrição", value: "Engrenagem", state: "validated", note: "Legenda, título do desenho." },
  {
    key: "kind",
    label: "Tipo de documento",
    value: "Peça",
    state: "check",
    note: "A legenda não informa o tipo; o desenho representa uma única peça.",
  },
  { key: "material", label: "Material", value: "Aço carbono SAE 1045", state: "validated", note: "Legenda, campo “Material”, e nota 1." },
  { key: "weight", label: "Peso", value: "Não identificado", state: "not_found", note: "O desenho não informa o peso." },
  { key: "quantity", label: "Quantidade", value: "Não identificado", state: "not_found", note: "O desenho não informa a quantidade." },
  {
    key: "project",
    label: "Projeto na legenda",
    value: "PR-2025-014",
    state: "check",
    note: "Diferente do projeto aberto (PR-2026-018): confirme se o desenho pertence a este projeto.",
  },
  { key: "sourcePage", label: "Página de origem", value: "1 de 1", state: "validated", note: "Documento de página única." },
];

/** Campos por documento. Quem não está aqui não tem leitura demonstrativa. */
export const extractedFieldsByDocument: Readonly<Record<string, readonly ExtractedField[]>> = {
  "CJ-001": fieldsCj001,
  "EG-001": fieldsEg001,
};

export type BomKind = "assembly" | "component";

export interface BomLine {
  /** Numeração hierárquica: "1", "1.1"… */
  readonly item: string;
  readonly code: string;
  readonly description: string;
  readonly kind: BomKind;
  /** Item do qual esta linha é filha (conjunto), se houver. */
  readonly parentItem: string | null;
  readonly quantity: number;
  readonly unit: "un";
  /** `null` = o desenho não informa. */
  readonly material: string | null;
  /** Peso unitário em gramas inteiros (evita erro de ponto flutuante); `null` = não informado. */
  readonly unitWeightGrams: number | null;
  readonly state: ValidationState;
  /** Motivo da pendência, mostrado em "Pendências". */
  readonly pendingNote?: string;
}

export const demoBom: readonly BomLine[] = [
  {
    item: "1", code: "CJ-001", description: "Conjunto principal", kind: "assembly", parentItem: null,
    quantity: 1, unit: "un", material: "Conforme especificação do conjunto", unitWeightGrams: null, state: "check",
    pendingNote: "Material e peso do conjunto não são definidos no desenho; dependem da lista de materiais.",
  },
  { item: "1.1", code: "PC-101", description: "Base de fixação", kind: "component", parentItem: "1", quantity: 2, unit: "un", material: "Aço carbono", unitWeightGrams: 12_500, state: "validated" },
  { item: "1.2", code: "PC-102", description: "Suporte lateral", kind: "component", parentItem: "1", quantity: 4, unit: "un", material: "Aço carbono", unitWeightGrams: 8_200, state: "validated" },
  {
    item: "1.3", code: "PC-103", description: "Tampa", kind: "component", parentItem: "1", quantity: 1, unit: "un",
    material: "Aço inoxidável", unitWeightGrams: 5_100, state: "check",
    pendingNote: "O desenho abrevia o material como “AÇO INOX.”; confirmar a especificação.",
  },
  { item: "1.4", code: "PC-104", description: "Eixo", kind: "component", parentItem: "1", quantity: 1, unit: "un", material: "Aço carbono", unitWeightGrams: 2_800, state: "validated" },
];

export const demoBomVersion = {
  label: "Rascunho demonstrativo",
  number: "v0.1",
  basis: "CJ-001, revisão A",
  approval: "Não aprovada",
  note: "Em uma lista aprovada a versão fica congelada; esta é apenas ilustrativa.",
} as const;

export const BOM_NOTICE =
  "A estrutura da BOM depende das relações e quantidades identificadas nos documentos. Informações ambíguas ou incompletas precisam de conferência antes da aprovação.";

export const DEMO_DISCLAIMER =
  "Demonstração ilustrativa: os dados desta seção são fictícios e não são o resultado de uma leitura real feita durante esta visita.";
