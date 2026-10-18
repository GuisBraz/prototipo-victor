# SETUP — Instalação, Firebase e execução local

Requisitos: Node.js 22+, npm 10+, Java 11+ (para o emulador do Firestore), conta Google.

## 1. Instalar e conferir

```bash
git clone https://github.com/sofirlogistics-rgb/MECABOM-.git mecabom
cd mecabom
npm install
npm run build:shared      # compila packages/shared (necessário antes do typecheck/build dos demais)
npm run typecheck
npm run lint
npm test                  # testes unitários (shared, functions, web)
```

## 2. Testar as regras de segurança (emulador)

```bash
npm run test:rules
```

Baixa o emulador do Firestore na primeira execução (precisa de internet e Java). Estes testes incluem "usuário não lê projeto de outra organização".

**Resultado verificado em 14/10/2026** (Windows, Node 24.17, Temurin 25): 14 de 14 testes passaram. As mensagens `PERMISSION_DENIED` no console durante a execução são esperadas (os testes provocam as negações de propósito), e o aviso `sun.misc.Unsafe` do emulador do Storage é inofensivo.

## 3. Rodar localmente com emuladores (sem nuvem, sem custo)

1. `cp apps/web/.env.example apps/web/.env.local` e deixe só estas linhas:
   ```
   VITE_FIREBASE_PROJECT_ID=demo-mecabom
   VITE_USE_EMULATORS=true
   ```
2. `npm run build:shared && npm run build -w @mecabom/functions` (compila o pacote compartilhado e gera o bundle das functions em `functions/bundle/`, que é o que o emulador carrega).
3. Em um terminal: `npm run emulators`.
4. Em outro: `npm run dev -w @mecabom/web` e abra http://localhost:5173.

## 4. Criar o banco de dados de verdade (Firebase) — passo a passo

**Estado em 17/10/2026 (feito pelo usuário no console):** projeto Firebase **`mecabom`** (ID `mecabom`) no plano **Blaze**, conta de faturamento "Pagamento do Firebase" (`01BD48-60A742-8F3527`, ativada com pagamento antecipado de R$ 200 via Pix, que vira crédito de uso). Orçamento "MECABOM mensal" de **R$ 50/mês** com alertas por e-mail em 50/90/100% (gasto real); só avisa, não bloqueia. Storage `gs://mecabom.firebasestorage.app` e Firestore `(default)` edição Standard, ambos em **`southamerica-east1`**, com as regras padrão fechadas (`if false`). **As regras e índices do repositório ainda não foram publicados, nenhuma function foi publicada e o Authentication ainda não foi configurado (passos 3, 6, 7 e 8 abaixo).** A CLI do Firebase neste computador está logada em outra conta Google, sem acesso ao projeto: antes do deploy, rode `npx firebase login` com a conta dona do `mecabom`.

> **Atenção, decisão irreversível:** a **localização do Firestore não pode ser alterada** depois de criada. A sugestão documentada é `southamerica-east1` (São Paulo). Se escolher outra, atualize `REGION` em `functions/src/config.ts` e `FUNCTIONS_REGION` em `apps/web/src/firebase.ts` para a mesma região.

1. Acesse https://console.firebase.google.com e clique em **Adicionar projeto** (use a conta que será dona do projeto). Nome sugerido: `mecabom-dev`. Crie **um projeto por ambiente** (dev, depois staging/prod).
2. **Plano:** as Cloud Functions de 2ª geração exigem o plano **Blaze** (pago por uso, com cota gratuita). Configure **alerta de orçamento** em Google Cloud → Faturamento → Orçamentos e alertas.
3. **Authentication** → Começar → habilitar **E-mail/senha**.
4. **Firestore Database** → Criar banco de dados → edição **Standard** → **localização `southamerica-east1`** → iniciar em **modo de produção** (as regras do repositório substituem o padrão).
5. **Storage** → Começar (modo de produção). Não é usado na Fase 1.
6. **Configurações do projeto → Seus apps → Web (`</>`)**: registre o app e copie a configuração para `apps/web/.env.local` (modelo em `apps/web/.env.example`). Esses valores são públicos; a proteção está nas regras e nas functions.
7. Instale e autentique a CLI **no seu computador**: `npx firebase login`, depois `npx firebase use --add` e selecione o projeto.
8. Publique **somente com sua autorização explícita** (o Claude não faz deploy):
   ```bash
   npm run build:shared && npm run build -w @mecabom/functions
   npx firebase deploy --only firestore:rules,firestore:indexes,storage
   npx firebase deploy --only functions
   ```
   O deploy das functions usa `functions/bundle/` (ver seção 6); o `predeploy` do `firebase.json` recompila o pacote compartilhado e o bundle automaticamente.

## 5. Fase 2a — upload de documentos: o que foi e o que não foi executado

**Executado (ambiente de desenvolvimento do Claude, 14/10/2026):** `typecheck`, `lint`, build do web e das functions; testes unitários (shared 17, functions 10 de validação de PDF + 7 de domínio, web 5), incluindo a validação de PDF contra os 46 PDFs reais de exemplo (aceitos) e contra PDF com senha, vazio, sem páginas, corrompido, texto disfarçado de PDF e acima dos limites.

**Executado com emuladores (Windows, Node 24.17, Temurin 25, 14/10/2026):**
- `npm run test:functions` — 46 passaram, 1 pulado (validação opcional com os PDFs reais, que exige `samples/`). Inclui `uploads.integration.test.ts` (sessões, duplicado, corrida de duplo envio, rejeições, reprocessamento, isolamento entre organizações). Na primeira execução 4 testes falharam porque os dois arquivos de integração rodavam em paralelo e cada um apaga o banco do emulador antes de cada teste; o script `test` das functions agora usa `--no-file-parallelism`, e a suíte passou em duas execuções seguidas.
- `npm run test:rules` — 25 de 25, incluindo regras de documentos/jobs/uploads e de **Storage** (upload só na sessão aberta pelo servidor, limite de tamanho/tipo, sem leitura direta).

**Teste manual no navegador (usuário, 14/10/2026, `npm run emulators` + `npm run dev -w @mecabom/web`) — passou:**
- PDF real (1 página, 177 KB) → documento criado, "Na fila · Aguardando processamento". O emulador de Functions encontrou o bucket padrão do Storage sem ajuste.
- Mesmo PDF de novo → "Duplicado: Este arquivo já foi enviado antes neste projeto; nada foi duplicado."; nenhum documento novo.
- Texto renomeado para `.pdf` → "Rejeitado: O arquivo não é um PDF válido."; nenhum documento novo.

**Teste opcional com os desenhos reais (17/10/2026):** os 46 PDFs do zip "desenhos - treinamento IA" foram extraídos para `samples/` (ignorada pelo Git; o TIFF ficou de fora) e `functions/src/pdf.test.ts` passou 10 de 10, sem testes pulados: **todos os 46 PDFs foram aceitos** pela validação do servidor. Para repetir: `npm run build:shared` e `npx vitest run --root functions src/pdf.test.ts`.

**Limites atuais (configuração central em `packages/shared/src/documents.ts`):** 30 MB, 100 páginas, 2000 documentos por projeto, 20 envios pendentes por usuário/projeto. Decisão P3 ainda aberta: ajustar após medir os seus desenhos.

**Em produção (futuro):** as Storage Rules consultam o Firestore (`firestore.get`); o serviço de Rules do Storage precisa de permissão de leitura no Firestore (o console do Firebase oferece conceder ao publicar as regras). O bucket padrão e as Functions exigem o plano Blaze.

## 6. Pendências conhecidas

- **Deploy das functions:** empacotamento com esbuild implementado (seção 7). Verificado localmente: o bundle carrega isolado após `npm install` só com as dependências geradas, e as callables respondem no emulador de Functions. **Nenhum deploy real foi feito ainda.**
- **Testes de Rules e de integração das functions:** passam com emuladores (ver seção 5).
- **Lint:** ESLint configurado (`npm run lint`), passa sem erros.
- **CI:** `.github/workflows/ci.yml` com lint, typecheck, testes unitários, build do web, testes de Rules e testes das functions. **Verificado no GitHub em 14/10/2026:** a execução #8 (commit `d8435ce`) passou nos três jobs (`verify`, `rules`, `functions`), e as execuções anteriores (#1–#7) também passaram. As actions foram atualizadas para v5 (a v4 roda em Node 20, obsoleto). Atenção: `ubuntu-latest` passa a ser Ubuntu 26 a partir de 19/10/2026.
- **Atualização de pacotes:** `firebase-functions` foi atualizado para a série 7; compila, passa na tipagem e nos testes unitários. Conferido no emulador em 14/10/2026: `createOrganization` e `createProject` responderam 200 carregadas do bundle, e chamada sem login retornou 401.
- **App Check:** não ativado.
- **Cadastro aberto:** qualquer pessoa com o link pode criar conta e organização (limitado a 5 organizações por usuário). Antes de uso real, decidir entre convite/lista de e-mails permitidos.
- **Auditoria de dependências:** `npm audit` aponta vulnerabilidades transitivas nas bibliotecas do Firebase e do React Router (ver SECURITY.md). Acompanhar atualizações; não foi usado `--force`.

## 7. Empacotamento das functions (esbuild)

O Cloud Build instala as dependências das functions a partir do npm e não enxerga o workspace `@mecabom/shared`. Por isso `npm run build -w @mecabom/functions` executa `functions/build.mjs`, que:

- embute `@mecabom/shared` e as bibliotecas JavaScript puras (`zod`, `pdf-lib`) em `functions/bundle/index.js`;
- mantém só `firebase-admin` e `firebase-functions` como dependências externas;
- gera `functions/bundle/package.json` com as **versões exatas instaladas** dessas duas bibliotecas (as mesmas usadas nos testes);
- falha se algum outro import externo escapar do bundle.

`functions/bundle/` é gerado (não versionado) e é a `source` das functions no `firebase.json`. A tipagem continua sendo verificada por `tsc` (`npm run typecheck`). O CI também gera o bundle.
