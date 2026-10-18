# ARCHITECTURE — MECABOM

> Status: **proposta da Fase 0**. Nada abaixo está implementado.

## 1. Estado do repositório

Vazio (sem commits). Portanto não há convenções a preservar nem código a migrar. A estrutura abaixo é a recomendação inicial. Referência visual: mockups de interface fornecidos pelo usuário (painel, projeto/upload, conferência do desenho, lista de materiais) — usados como guia de layout; **os números dos mockups são ilustrativos e não podem aparecer na aplicação sem dados reais**.

## 2. Avaliação da arquitetura preferencial e ajustes recomendados

| Tema | Proposta original | Avaliação / ajuste |
|---|---|---|
| Frontend | React + TS (Vite) | Mantido. Repositório vazio, então Vite é adequado (SPA autenticada, sem SEO). |
| Backend | Cloud Functions 2ª gen + Cloud Run + Cloud Tasks | Mantido, com divisão clara: **Functions** para API leve (callables, triggers pequenos); **Cloud Run** para o worker de PDF (binários de rasterização, mais memória/tempo). Functions 2ª geração já roda sobre Cloud Run, mas um serviço próprio dá controle de imagem, CPU, memória e timeout. |
| Fila | Cloud Tasks | Mantido: controla concorrência, retentativa com backoff e deduplicação por nome de tarefa. |
| Banco | Firestore | Mantido, com cuidados: limite de 1 MiB por documento (ver melhoria 3 no §2 e `DATA_MODEL.md`) e índices por consulta. |
| Storage | Cloud Storage | Mantido; PDFs privados, acesso por URL assinada de curta duração emitida após autorização no servidor. |
| IA | Anthropic API | Mantido; **só no worker/backend**, modelo configurável. |
| Autorização | Rules + servidor | Mantido: Rules como defesa em profundidade; operações críticas (aprovar, publicar, exportar) só via backend. |

### Melhorias propostas
1. **Motor de BOM como pacote puro** (`packages/bom-engine`), sem Firebase nem IA: entrada = relações/quantidades já validadas; saída = BOM + pendências. Testável de forma exaustiva e independente do modelo.
2. **Schemas Zod compartilhados** (`packages/shared`) usados no frontend, nas functions e no worker; mesma definição valida entrada do cliente e saída da IA.
3. **Evidências fora do documento principal**: resultados de extração podem ser grandes; guardar campos em subcoleção/arquivo JSON no Storage referenciado, não inline em `Drawing`.
4. **Idempotência por construção**: id do job determinístico (hash de `documentId + pipelineVersion + promptVersion + modelId`), upserts por chave natural, nome de task único no Cloud Tasks.
5. **Aprovação como transação de servidor** que congela a versão da BOM.

## 3. Estrutura do repositório (monorepo, npm workspaces)

```
mecabom/
├─ apps/
│  └─ web/                    # React + TS + Vite
├─ functions/                 # Firebase Functions 2ª gen (API callable, triggers leves)
├─ services/
│  └─ worker/                 # Cloud Run: processamento de PDF + chamada à Anthropic
├─ packages/
│  ├─ shared/                 # schemas Zod, tipos, enums de status, constantes
│  └─ bom-engine/             # cálculo de BOM, detecção de ciclos, pendências (puro)
├─ firebase/
│  ├─ firestore.rules
│  ├─ firestore.indexes.json
│  └─ storage.rules
├─ docs/                      # esta documentação
├─ firebase.json
├─ .env.example
└─ package.json               # workspaces
```

Decisão: **npm workspaces** (sem ferramenta extra) até haver necessidade comprovada de Turborepo/Nx.

## 4. Stack do frontend (a adicionar só quando usada)

React 18+, TypeScript estrito, React Router, TanStack Query (dados), TanStack Table (tabelas com filtro/ordenação/paginação), React Hook Form + Zod (formulários), pdf.js para visualizar PDF e destacar região de origem, Radix UI/shadcn-ui + Tailwind (componentes acessíveis). Testes: Vitest + Testing Library. Cada dependência é adicionada na fase em que for necessária, não antecipadamente.

## 5. Visão de componentes

```
Navegador (React)
   │  login (Firebase Auth)           ┌─────────────────────────┐
   ├──────────────────────────────►   │ Firebase Auth           │
   │  callables (autorizados)         └─────────────────────────┘
   ├──────────────────────────────►  Functions 2ª gen ──► Firestore
   │  upload (URL assinada)                 │  (cria Document + Job,
   ├──────────────────────────────►  Storage│   enfileira task)
   │                                        ▼
   │                                 Cloud Tasks (concorrência, retry, dedupe)
   │                                        ▼
   │                                 Worker (Cloud Run)
   │                                   ├─ lê PDF do Storage
   │                                   ├─ texto nativo / rasterização
   │                                   ├─ Anthropic API (chave via Secret Manager)
   │                                   ├─ valida schema + regras
   │                                   └─ grava ExtractionResult, Drawing, pendências
   └─ leitura em tempo real (Firestore, restrita por Rules)
```

Segredos: **Secret Manager** (não variáveis de frontend, não repositório). Nenhum SDK da Anthropic no `apps/web`.

## 6. Fluxo resumido de upload e processamento

1. Cliente pede upload a uma callable; o servidor valida membro/projeto/papel e retorna URL assinada de curta duração para caminho controlado pelo servidor.
2. Após o upload, trigger/callable finaliza: valida **conteúdo real** (assinatura `%PDF`, parse, nº de páginas, tamanho), calcula hash, detecta duplicidade, cria `Document`.
3. Cria `ProcessingJob` e enfileira task (nome determinístico).
4. Worker executa as etapas independentes descritas em `AI_PIPELINE.md`, atualizando `currentStep` e estado.
5. Resultado fica em revisão; nada é "publicado" sem validação humana/regras.

## 7. Decisões técnicas (resumo)

| ID | Decisão | Alternativas | Justificativa |
|---|---|---|---|
| D1 | Monorepo npm workspaces | Repos separados; Turborepo | Simplicidade; tipos compartilhados |
| D2 | Worker em Cloud Run | Só Functions | Binários, memória, timeout longos |
| D3 | Sub-coleções sob `organizations/{orgId}` | Coleções globais com `orgId` | Rules mais simples e menos propensas a erro; consultas entre organizações não são necessárias (ver `DATA_MODEL.md`) |
| D4 | Zod compartilhado | JSON Schema manual | Um só contrato para tipos, formulários e validação da IA |
| D5 | BOM engine puro | Lógica nas functions | Testabilidade e independência da IA |
| D6 | Callables para ações críticas | Escrita direta pelo cliente | Autorização e auditoria no servidor |
| D7 | Região única GCP | Multi-região | Simplicidade; região final **pendente** (PRD P2) |

## 8. Ambientes

`dev` (emuladores locais: Auth, Firestore, Storage, Functions), `staging` e `prod` como projetos Firebase separados. Chaves e segredos distintos por ambiente. **Nenhum deploy para produção sem autorização explícita.** Plano Blaze necessário para Functions 2ª gen / Cloud Tasks (PRD P8).

## 9. Observabilidade

Logs estruturados (sem segredos, sem conteúdo técnico desnecessário), contabilização de uso por job, alertas de erro e de orçamento. Dashboards de custo ficam para a Fase 5.
