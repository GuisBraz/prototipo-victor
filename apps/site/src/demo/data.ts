/**
 * Dados DEMONSTRATIVOS usados apenas nas ilustrações do site.
 * Não representam clientes, projetos reais nem desempenho do produto.
 * Os totais exibidos nos mockups são sempre derivados destas listas.
 */
export type DrawingStatus = "processed" | "processing" | "queued" | "review";

export interface DemoDrawing {
  number: string;
  description: string;
  revision: string;
  kind: string;
  status: DrawingStatus;
}

export const demoProject = { name: "Transportador de correia (exemplo)", code: "DEMO-01" };

export const demoDrawings: DemoDrawing[] = [
  { number: "DEMO-1000", description: "Conjunto do transportador", revision: "B", kind: "Conjunto", status: "processed" },
  { number: "DEMO-1100", description: "Estrutura lateral", revision: "A", kind: "Subconjunto", status: "processed" },
  { number: "DEMO-1110", description: "Suporte do rolete", revision: "A", kind: "Peça", status: "review" },
  { number: "DEMO-1200", description: "Tambor de acionamento", revision: "C", kind: "Subconjunto", status: "processing" },
  { number: "DEMO-1210", description: "Eixo do tambor", revision: "A", kind: "Peça", status: "queued" },
];

export const statusLabel: Record<DrawingStatus, string> = {
  processed: "Processado",
  processing: "Processando",
  queued: "Na fila",
  review: "Revisar",
};

export type FieldState = "validated" | "check" | "missing";

export const fieldStateLabel: Record<FieldState, string> = {
  validated: "Validado",
  check: "Conferir",
  missing: "Não identificado",
};

export interface DemoBomRow {
  balloon: number;
  level: number;
  number: string;
  description: string;
  quantity: string;
  material: string;
  state: FieldState;
}

export const demoBom: DemoBomRow[] = [
  { balloon: 1, level: 0, number: "DEMO-1000", description: "Conjunto do transportador", quantity: "1", material: "—", state: "validated" },
  { balloon: 2, level: 1, number: "DEMO-1200", description: "Tambor de acionamento", quantity: "1", material: "Aço carbono", state: "validated" },
  { balloon: 3, level: 2, number: "DEMO-1210", description: "Eixo do tambor", quantity: "1", material: "Não identificado", state: "missing" },
  { balloon: 4, level: 1, number: "DEMO-1110", description: "Suporte do rolete", quantity: "Conferir", material: "Aço carbono", state: "check" },
];
