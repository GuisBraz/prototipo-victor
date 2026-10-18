# ROADMAP — MECABOM

Cada fase tem critérios de aceitação verificáveis. Uma fase só é "concluída" quando seus testes foram **executados** e passam. Dependências entre fases são respeitadas.

## Estado atual

- Repositório criado e vazio. Fase 0 (documentação) em andamento.
- Nenhuma integração, tela ou código de processamento existe ainda.

## Fase 0 — Análise e planejamento (esta)

**Entregáveis:** `docs/PRD.md`, `ARCHITECTURE.md`, `DATA_MODEL.md`, `AI_PIPELINE.md`, `BOM_RULES.md`, `SECURITY.md`, `ROADMAP.md`.

**Aceite:** documentos coerentes entre si; decisões em aberto listadas; riscos listados; usuário revisou o escopo do MVP.

## Fase 1 — Fundação (EM ANDAMENTO: base criada; ver `docs/SETUP.md`, "Pendências conhecidas")

Escopo: monorepo, frontend (React + TS + Vite), Firebase Auth, organização/membros/projetos, autorização, Rules iniciais, Emulator Suite, logs e erros, testes básicos, `.env.example`, CI de lint/typecheck/test.

**Aceite:**
- App roda localmente com emuladores, **sem** chave da Anthropic.
- Usuário só lista/abre projetos da própria organização; teste de Rules prova negação cross-org (cenário 15).
- `typecheck`, `lint` e testes passam no CI.
- Nenhum segredo em código ou bundle (verificação automatizada).

## Fase 2 — Documentos e processamento

**Andamento:** 2a (upload, validação no servidor, hash/duplicidade, Documento + Job na fila, reprocessamento, regras e tela de envio) implementada; ver `docs/SETUP.md` §5 para o que já foi executado. 2b (worker/fila de execução, texto nativo, integração Anthropic, `ExtractionResult`, retentativas, uso por job) **pendente** — a integração com a IA depende da conta/chave da API e do plano Blaze.

Escopo: upload, Storage, metadados, hash/duplicidade, fila (Cloud Tasks), worker, extração de texto nativo, integração Anthropic no backend, `ExtractionResult`, falhas e reprocessamento.

**Aceite:**
- PDF enviado vira `Document` + `ProcessingJob`; progresso visível.
- Duplicado detectado; reprocessar não duplica registros (cenários 8, 17).
- Falha de um PDF não afeta os outros (14); falha temporária da API tem retentativa limitada (13).
- Uso (tokens/chamadas) gravado por job.
- Arquivo inválido/ malformado/ grande demais é rejeitado no backend.

## Fase 3 — Validação e leitura técnica

Escopo: cadastro de `Drawing`, campos com evidência, tela de conferência com PDF, edição/validação, ambiguidades, cruzamento inicial entre desenhos.

**Aceite:**
- Estados de campo distintos (validado, não validado, ambíguo, ausente, conflitante, corrigido, aprovado).
- Correção grava histórico e justificativa.
- Mesmo nº de desenho com revisões diferentes tratado sem sobrescrever (9, 12).
- **Primeira medição** da base de referência (precisão por campo) registrada em `docs/` antes de seguir.

## Fase 4 — Geração da BOM

Escopo: relações conjunto→componente, BOM hierárquica, consolidada, regras de quantidade/peso, referências ausentes, versionamento, aprovação, exportação XLSX/CSV.

**Aceite:**
- Cálculo hierárquico correto em casos de teste (18); ciclo bloqueado (19).
- Aprovada é imutável; edição cria nova versão (20).
- Referência sem desenho aparece como pendência (11).
- Exportação traz versão e estado de aprovação; ausentes não viram zero.
- Sem tabela de componentes ⇒ sistema não inventa composição (catálogo/lista parcial).

## Fase 5 — Confiabilidade e evolução

Escopo: comparação de revisões, relatórios de inconsistência, auditoria completa, avaliação em documentos reais anonimizados, custos e falhas, desempenho, multi-organização.

**Aceite:** relatório de qualidade por campo e por relação; comparação de revisões indica itens afetados sem substituir BOM aprovada.

## Sequência imediata (após aprovação do usuário)

1. Confirmar decisões P2, P3, P7 do PRD.
2. Iniciar Fase 1 (estrutura do monorepo).
3. Em paralelo: usuário reúne 10–20 PDFs reais anonimizados (variados: digitais, escaneados, conjuntos com tabela, peças).

## Riscos

| # | Risco | Impacto | Mitigação |
|---|---|---|---|
| R1 | Erro silencioso de extração (peso, quantidade, revisão) | BOM errada em uso industrial | Evidência por campo, regras determinísticas, revisão humana, bloqueio de aprovação com pendências |
| R2 | Desenhos grandes/complexos: legenda e tabela difíceis de ler | Baixa precisão | Rasterização por região, prompts específicos, avaliação por campo, ajuste de modelo |
| R3 | Custo de IA fora de controle | Orçamento | Limites, contabilização por job, escolha do caminho por tipo de PDF, modelo configurável |
| R4 | Limites de tempo/memória de Cloud Functions | Falha em PDFs grandes | Worker em Cloud Run para processamento pesado |
| R5 | Prompt injection via texto no PDF | Manipulação de saída | Conteúdo tratado como dado; saída validada por schema; sem ferramentas expostas ao modelo |
| R6 | Vazamento de dados industriais para IA | Confidencialidade | Aviso e aceite da organização, segredos só no backend, revisão dos termos de dados aplicáveis |
| R7 | Regras do Firestore mal escritas | Acesso cruzado entre organizações | Testes de Rules no emulador, autorização também no servidor |
| R8 | Falta de PDFs reais para avaliar | MVP sem prova de qualidade | Coleta de amostras como pré-requisito da Fase 3 |
| R9 | Custo do Firebase (plano Blaze) | Surpresa na fatura | Alertas de orçamento no GCP, limites por organização |
| R10 | Modelo da Anthropic mudar/ser descontinuado | Quebra | Modelo em configuração central, testes de contrato do schema |
