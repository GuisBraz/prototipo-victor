# SECURITY — MECABOM

> Status: **requisitos e plano da Fase 0**. Nenhum controle está implementado ainda. Usar Firebase não torna o sistema seguro por si só: segurança depende da configuração e dos testes de **todas** as camadas.

## 1. Ativos e ameaças

Ativos: desenhos industriais (confidenciais), BOMs, dados de organizações, chave da Anthropic, contas de usuários.

Ameaças consideradas: acesso entre organizações; escalada de privilégio; vazamento de segredo; PDFs malformados/maliciosos; prompt injection no conteúdo; abuso de API e de custo; execução duplicada; perda de dados; indisponibilidade de serviços externos; alteração indevida de BOM aprovada.

## 2. Controles obrigatórios (mapa dos 18 requisitos do briefing)

| # | Requisito | Controle planejado | Verificação |
|---|---|---|---|
| 1 | Chave Anthropic nunca no frontend | SDK só no worker; chave no Secret Manager; sem variáveis `VITE_*` com segredo | Varredura automatizada do bundle e do repo no CI |
| 2 | Segredos em mecanismo seguro | Secret Manager por ambiente; `.env.example` só com valores fictícios | Revisão de CI (secret scanning) |
| 3 | Acesso autorizado no servidor e nas Rules | Toda callable verifica membro/papel/projeto; Rules como 2ª camada | Testes de integração e de Rules |
| 4 | Sem acesso entre organizações | Dados sob `organizations/{orgId}`; Rules por membership | Teste: usuário A negado em org B (Firestore, Storage, callables) |
| 5 | Autenticar ≠ autorizar | Papel e status do membro verificados em cada operação | Testes por papel |
| 6 | Rules restritivas | Negar por padrão; escrita cliente limitada a campos permitidos | Testes no emulador |
| 7 | Validar dados do cliente | Zod em toda fronteira (callables, formulários) | Testes unitários com entradas inválidas |
| 8 | Validar arquivos no backend | Assinatura `%PDF`, parse real, tamanho, páginas, rejeitar criptografados; nome de arquivo sanitizado; caminho no Storage gerado pelo servidor | Testes com PDFs malformados |
| 9 | Aprovação exige permissão | Callable `approveBom` verifica papel `approver` e pendências bloqueantes | Teste: reviewer não aprova |
| 10 | Proteção contra repetição/duplicação | Idempotência: id de job determinístico, nome único de task, upsert por chave natural | Teste de reprocessamento sem duplicar |
| 11 | Logs sem segredos | Logger estruturado com redação; não logar conteúdo de desenho nem chaves | Revisão + teste de redação |
| 12 | Auditoria de operações críticas | `AuditEvent` escrito só pelo servidor | Testes por ação |
| 13 | Backup e recuperação | Exportação agendada do Firestore e versionamento de objetos no Storage; procedimento de restauração testado | Simulação de restauração antes de produção |
| 14 | Dependências verificadas | Lockfile, `npm audit`, atualização regular, secret scanning | CI |
| 15 | Limites contra abuso | Rate limit por usuário/organização nas callables; limites de uso de IA; App Check (quando aplicável) | Testes e alertas |
| 16 | CORS restrito | Lista de origens permitidas por ambiente; nada de `*` | Teste de cabeçalhos |
| 17 | Downloads respeitam permissões | URL assinada de curta duração, emitida após autorização | Teste de acesso negado |
| 18 | Exclusões respeitam retenção/auditoria | Exclusão lógica por padrão; exclusão física só por política e com auditoria | Teste + política documentada |

## 3. Específico da IA

- **Prompt injection:** conteúdo do PDF é dado. Modelo sem ferramentas, sem acesso a segredos ou a dados fora do documento; saída restrita ao schema e validada. Texto "instrucional" no PDF não altera comportamento; pode gerar um sinal de revisão.
- **Consentimento:** a organização aceita o envio de documentos a serviço externo de IA antes do primeiro processamento; aceite registrado (quem, quando, versão dos termos).
- **Minimização:** enviar à API só as páginas/recortes necessários.
- **Custos:** limites por projeto/organização; alertas de orçamento no GCP.
- **Dados em schemas:** não colocar dado sensível em nomes de propriedades ou valores de enum do schema enviado (a documentação indica que schemas ficam em cache por até 24h).
- **Retenção de dados no provedor:** revisar com o cliente as condições de tratamento de dados da API antes de produção.

## 4. Modelo de papéis

`viewer < reviewer < approver < admin`. Papel armazenado em `members/{uid}`; mudanças de papel são auditadas. Operações sensíveis (aprovar, exportar BOM operacional, alterar regras de aprovação) só via backend.

## 5. Infraestrutura

- Projetos Firebase separados por ambiente (dev/staging/prod); sem dados reais em dev.
- Contas de serviço com **menor privilégio** (worker não precisa de acesso administrativo amplo).
- Storage privado; sem URLs públicas permanentes.
- Alertas: picos de erro, 4xx/5xx anormais, consumo de IA, custo.
- **Sem deploy em produção e sem migração de dados reais sem autorização explícita.**

## 6. Checklist antes de produção

- [ ] Rules testadas (incluindo cross-org) e revisadas por segunda pessoa.
- [ ] Varredura de segredos no repositório e no bundle: limpa.
- [ ] `npm audit` sem vulnerabilidades altas/críticas abertas.
- [ ] CORS e domínios autorizados revisados.
- [ ] App Check avaliado/ativado onde aplicável.
- [ ] Backup configurado e restauração testada.
- [ ] Limites de uso e alertas de custo configurados.
- [ ] Aceite de processamento por IA presente no fluxo.
- [ ] Teste de penetração básico (upload malformado, IDOR em callables).
- [ ] Política de retenção e exclusão documentada.

## 7. Riscos residuais (assumidos até evidência em contrário)

- Extração incorreta que passe pela revisão humana por descuido ⇒ mitigação: priorização de revisão, bloqueio por pendências, auditoria.
- Dependência de serviço externo de IA (disponibilidade/mudança de modelo) ⇒ mitigação: fila, retentativas, modelo configurável.

## 8. Auditoria de dependências (14/10/2026, Fase 1)

`npm audit --omit=dev` aponta vulnerabilidades **transitivas** (14: 4 altas, 10 moderadas) vindas dos SDKs do Firebase (`@grpc/grpc-js`, `uuid`, `google-gax`) e do `react-router`. `npm audit fix` sem `--force` não as resolve. Ação: acompanhar atualizações dos pacotes `firebase`, `firebase-admin`, `firebase-functions` e `react-router-dom`, reexecutar a auditoria a cada fase e **não** declarar o item 14 do checklist como concluído até a revisão. Ferramentas de desenvolvimento (`firebase-tools`) têm achados adicionais, fora do bundle de produção.
