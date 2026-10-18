/** Configuração centralizada das functions. Nada aqui é segredo. */

/**
 * Região das functions. Decisão pendente (PRD P2); `southamerica-east1` é a
 * suposição documentada. Deve coincidir com a região do Firestore escolhida.
 */
export const REGION = "southamerica-east1";

/** Limite de organizações que um mesmo usuário pode criar/pertencer (proteção contra abuso). */
export const MAX_ORGANIZATIONS_PER_USER = 5;

/** Limite de projetos por organização na Fase 1 (proteção contra abuso de custo). */
export const MAX_PROJECTS_PER_ORGANIZATION = 500;

/**
 * Versões do pipeline gravadas nos jobs (reprodutibilidade de resultados).
 * Sobem quando prompt/modelo/etapas mudarem; a Fase 2a ainda não chama IA.
 */
export const PIPELINE_VERSION = "0.1.0-intake";
