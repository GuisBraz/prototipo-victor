# MECABOM

Plataforma web para ler desenhos mecânicos industriais em PDF com apoio de IA e gerar listas de materiais (BOM) rastreáveis, com revisão humana, versionamento e exportação.

> **Status: Fase 1 (fundação) em andamento.** Existem: schemas compartilhados, regras do Firestore/Storage, functions de organização e projeto e um frontend com login, organização e projetos. **Não existem ainda:** upload de PDF, processamento, integração com a Anthropic e BOM. Veja `docs/SETUP.md`.

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
