# PRD — MECABOM (Plataforma Inteligente de Desenhos Mecânicos e BOM)

> Nome provisório. Status do documento: **Fase 0 — planejamento**. Nada aqui está implementado ainda.

## 1. Problema

Receber um projeto mecânico hoje significa abrir dezenas de PDFs, ler legendas, interpretar tabelas de materiais, identificar revisões, relacionar conjuntos com peças e montar a lista de materiais (BOM) à mão em planilha. O trabalho é repetitivo, lento e sujeito a erro silencioso.

## 2. Proposta

Uma plataforma web em que a empresa cria um projeto, anexa os PDFs, e o sistema:

1. extrai dados técnicos (texto nativo, OCR/visão e IA);
2. valida por regras determinísticas;
3. identifica relações conjunto → componentes;
4. monta a BOM somente quando há evidência suficiente;
5. leva tudo a uma revisão humana rastreável;
6. publica versões imutáveis da BOM e exporta XLSX/CSV.

**Princípio central:** a IA *extrai e interpreta*; o software *calcula e valida*; o humano *aprova*. Nenhum dado é inventado, e ausência é registrada como ausência.

## 3. Usuários e papéis (proposta inicial)

| Papel | Pode |
|---|---|
| Visualizador | Ver projetos, documentos, BOMs aprovadas |
| Engenheiro/Revisor | Criar projetos, subir PDFs, revisar e corrigir campos, propor BOM |
| Aprovador | Aprovar versões de BOM (regras de bloqueio configuráveis) |
| Administrador da organização | Gerir membros, limites e configurações |

Premissa registrada: começamos com **uma organização por instalação lógica**, mas o modelo já carrega `organizationId` em tudo (multi-tenant desde o início, sem UI de multi-organização no MVP).

## 4. Escopo do MVP

### Dentro
- Login (Firebase Auth), organização, membros e papéis básicos.
- Projetos (criar, listar, abrir).
- Upload de PDFs, validação real do arquivo, hash para duplicidade.
- Processamento assíncrono com fila, estados, retentativa e reprocessamento individual.
- Extração por IA do PDF (texto nativo quando existir; imagem/visão quando necessário) com saída estruturada validada.
- Campos com evidência (valor bruto, normalizado, página, método, status de validação).
- Tela de conferência: PDF ao lado dos campos, corrigir/confirmar com justificativa.
- Cadastro de desenhos identificados (número, revisão, título, tipo, material, peso).
- BOM hierárquica a partir de **tabelas de componentes lidas dos desenhos de conjunto**.
- BOM consolidada com quantidades calculadas pelo software e rastreáveis.
- Pendências: referências sem documento, quantidades ambíguas, ciclos, conflitos.
- Versionamento e aprovação da BOM (versão aprovada imutável).
- Exportação XLSX e CSV com versão e estado de aprovação.
- Auditoria dos eventos críticos.

### Fora do MVP (arquitetura preparada, não implementado)
- Comparação automática entre revisões (primeira prioridade pós-MVP).
- Templates configuráveis por empresa, permissões avançadas, dashboards de qualidade.
- Assistente conversacional, integração ERP/PLM, relatórios de custo, retenção/arquivamento.
- Cálculo de peso a partir de dimensões (proibido até haver funcionalidade validada).

## 5. Requisitos funcionais (resumo rastreável)

- **RF-01** Gerir projetos por organização.
- **RF-02** Upload múltiplo de PDF com validação de tipo real, tamanho e integridade.
- **RF-03** Detecção de duplicidade por hash de conteúdo, por projeto.
- **RF-04** Fila de processamento com estados, concorrência limitada, timeout, retentativa controlada.
- **RF-05** Falha em um PDF não interrompe os demais.
- **RF-06** Extração de: identificação, revisão, classificação, material, quantidades, peso e relações (ver `AI_PIPELINE.md`).
- **RF-07** Todo campo extraído possui evidência e estado de validação distinto (ver `DATA_MODEL.md`).
- **RF-08** Revisão humana com histórico de correções e justificativa.
- **RF-09** BOM hierárquica e consolidada com regras explícitas (ver `BOM_RULES.md`).
- **RF-10** BOM aprovada é imutável; mudanças geram nova versão.
- **RF-11** Novos desenhos entram no projeto existente sem reiniciar tudo; impactos são sinalizados.
- **RF-12** Exportação XLSX/CSV.
- **RF-13** Auditoria de alterações, aprovações, exclusões, reprocessamentos e exportações.

## 6. Requisitos não funcionais

- Segurança por padrão (ver `SECURITY.md`): chave da Anthropic apenas no backend; autorização no servidor e nas Rules.
- Confiabilidade: operações de processamento idempotentes; sem erro silencioso.
- Custo controlado: contabilização de uso por job; limites por projeto/organização.
- Manutenibilidade: TypeScript estrito; BOM independente da IA; configuração de modelo centralizada.
- Acessibilidade e responsividade básicas na UI.

## 7. Critérios de sucesso (a medir, não prometer)

Não há meta de precisão fixada nesta fase. Será criada uma **base de referência** com desenhos conferidos manualmente; a precisão **por campo** e a qualidade das **relações** serão medidas separadamente. A IA só será considerada apta para uso operacional com evidência empírica em desenhos reais e difíceis, não em exemplos escolhidos por serem fáceis.

## 8. Premissas e decisões em aberto

| # | Tema | Decisão adotada / pendência |
|---|---|---|
| P1 | Repositório vazio | Estrutura inicial proposta em `ARCHITECTURE.md` |
| P2 | Região do Firebase/GCP | **Decidido (17/10/2026): `southamerica-east1` (São Paulo).** Firestore `(default)` e bucket `mecabom.firebasestorage.app` criados nessa região no projeto `mecabom` (irreversível) |
| P3 | Tamanho máximo de PDF/páginas | Premissa: 50 MB e 50 páginas por arquivo no MVP; ajustável. A confirmar com PDFs reais |
| P4 | Aviso de envio a serviço externo de IA | Obrigatório no onboarding da organização (aceite registrado) |
| P5 | Modelo Claude padrão | **Padrão inicial (17/10/2026): Claude Opus 5.5 (`claude-opus-5-5`)**, definido pelo usuário, em `AI_EXTRACTION_CONFIG` (`packages/shared/src/extraction.ts`). Continua configurável; a confirmação para uso operacional depende da avaliação com o gabarito (AI_PIPELINE §8) |
| P6 | Padrão de revisão (letra/número) | Normalização configurável; MVP aceita texto livre normalizado |
| P7 | PDFs reais para avaliação | **Pendente**: o usuário precisa fornecer amostras (anonimizadas) |
| P8 | Plano Firebase | **Decidido (17/10/2026): Blaze ativo** no projeto `mecabom` (Cloud Functions 2ª geração e Cloud Tasks exigem). Alerta de orçamento de R$ 50/mês (só e-mail, não bloqueia gastos) |

## 9. Riscos principais

Ver `ROADMAP.md` (seção de riscos) e `SECURITY.md`.
