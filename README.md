# MECABOM

Plataforma web para ler desenhos mecânicos industriais em PDF com apoio de IA e gerar listas de materiais (BOM) rastreáveis, com revisão humana, versionamento e exportação.

> **Status: alfa (18/10/2026).** Fluxo completo implementado: envio de desenhos em PDF (arquivos ou pasta), leitura por IA (Claude Opus 5.5, com ampliação de regiões para folhas grandes e PDFs escaneados), montagem da BOM hierárquica pai → filho pela lista de materiais, conferência das células duvidosas (amarelo) e exportação na planilha **Controle de Avanço** (.xlsx) com aba de relatório. **Ainda não:** leitura real testada com a chave da API, medição de precisão, DWG e deploy. Veja `docs/SETUP.md` §3a.

## Como funciona

1. Crie um projeto (um lote de desenhos).
2. Arraste os PDFs ou uma pasta inteira. Cada desenho é validado e entra na fila de leitura.
3. A IA lê a legenda (desenho, revisão, descrição, peso) e a lista de materiais de cada desenho, com evidência (página e trecho). O que não é seguro vira "conferir".
4. O motor de regras (sem IA) monta a hierarquia: o conjunto (pai) chama os filhos pela lista de materiais; desenhos citados só em notas ficam fora da BOM. QTE TOTAL = produto das quantidades na árvore; PESO TOTAL = QTE × PESO UNIT.
5. Confira as células amarelas (corrigir ou marcar como conferido) e baixe a planilha: colunas B–H preenchidas, o restante fica para o programador; aba "Relatório" com inconsistências e desenhos aplicados.

## Documentação

| Documento | Conteúdo |
|---|---|
| [docs/PRD.md](docs/PRD.md) | Problema, escopo do MVP, requisitos, premissas e decisões em aberto |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Arquitetura recomendada, estrutura do monorepo, decisões técnicas |
| [docs/DATA_MODEL.md](docs/DATA_MODEL.md) | Entidades, estados de campo, evidências, regras de acesso |
| [docs/AI_PIPELINE.md](docs/AI_PIPELINE.md) | Pipeline de leitura dos PDFs com a API da Anthropic |
| [docs/BOM_RULES.md](docs/BOM_RULES.md) | Regras de cálculo, revisões, versionamento e aprovação da BOM |
| [docs/SECURITY.md](docs/SECURITY.md) | Requisitos de segurança e checklist de produção |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Fases, critérios de aceitação e riscos |
| [docs/SETUP.md](docs/SETUP.md) | Instalação, emuladores e criação do banco no Firebase |

## Segurança

Nunca versione chaves, tokens ou arquivos `.env` reais. A chave da Anthropic existe apenas no backend.
