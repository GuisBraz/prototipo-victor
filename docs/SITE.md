# Site de apresentação (`apps/site`)

Landing page de uma página só, em React + TypeScript + Vite, separada do app (`apps/web`). Serve para apresentar o MECABOM em reunião: não tem cadastro, formulário de contato nem chamada de venda. Não usa Firebase, não faz chamadas externas e não carrega fontes de CDN (Archivo vem de `@fontsource-variable/archivo`).

## Como rodar
```
npm install
npm run dev -w @mecabom/site        # abre em http://localhost:5174
npm run build -w @mecabom/site      # gera apps/site/dist
npm run preview -w @mecabom/site    # http://localhost:4174, serve o build
npm test -w @mecabom/site           # 22 testes (cálculo, componentes, animações, ausência de formulário, links internos)
```

## Onde editar
`apps/site/src/config/brand.ts`:
- `brand.name` — nome exibido (provisório).
- `pricing` — **R$ 13.000** (venda do projeto, valor único) e **R$ 300/mês** (após o pagamento do projeto), valores informados pelo responsável. A seção "Orçamento" mostra só isso; não há texto sobre o que o valor e a mensalidade incluem.
- `navLinks` e `anchors` — menu e destino dos botões ("Ver orçamento", "Conhecer a plataforma").

## Seções
Visão geral, problema, solução, como funciona, funcionalidades (abas interativas), rastreabilidade (interativa), redução de custos, demonstração interativa "Do desenho à BOM", como medir, segurança, orçamento, FAQ e encerramento.

## Animações de rolagem
Código em `src/lib/scrollFx.ts` e `src/styles/motion.css`:
- elementos entram com fade + deslocamento ao aparecer na tela (de baixo, da esquerda ou com leve zoom), com atraso escalonado entre irmãos;
- barra vermelha de progresso de leitura no topo; barra vermelha que cresce sob cada título de seção;
- paralaxe leve no topo (painel desce mais devagar que o texto);
- cabeçalho some ao descer e volta ao subir; o menu sublinha a seção que está na tela;
- "Como funciona" desenha a linha do processo; os valores do orçamento contam de 0 até R$ 13.000 e R$ 300 (o valor final sempre fica no texto para leitores de tela).
Quem usa "reduzir movimento" no sistema vê a página estática, com tudo visível e os valores direto.

## Removido em relação à primeira versão
Formulário de contato (nome, empresa, e-mail etc.), botões "Solicitar…", dados de contato e política de privacidade no rodapé, textos "não há preços publicados", metadados e imagem de compartilhamento (Open Graph). A página inclui `noindex`.

## Honestidade do conteúdo
Os dados dos painéis são fictícios e rotulados "Dados demonstrativos". A demonstração interativa (`src/product-demo/`) usa dados centralizados em `data.ts`, não chama IA nem backend e avisa que os campos são ilustrativos. Não há clientes, depoimentos, métricas de mercado ou certificações inventados.

## Pendências
- Decidir se a seção de orçamento deve detalhar o que está incluso no valor do projeto e na mensalidade.
- Nome comercial e logotipo finais (o símbolo atual é provisório).
- Hospedagem e endereço público, se a página for compartilhada (não definida; sem deploy sem autorização).
- Acessibilidade verificada só por testes automatizados e navegador, não com leitor de tela.

## Demonstração interativa (seção `#demonstracao`)
- Código: `apps/site/src/product-demo/` (`data.ts` = fonte única dos dados; `bom.ts`, `exportBom.ts`, `xlsx.ts` = lógica pura testada; componentes por etapa). Estilos: `src/styles/product-demo.css`.
- PDF de exemplo fictício: `apps/site/public/demos/CJ-001.pdf` (URL `/demos/CJ-001.pdf`, respeita o `base` do Vite), gerado por `python3 apps/site/scripts/gerar-cj-001.py` (ReportLab). **Os dados do script e de `data.ts` precisam coincidir.** Para trocar pelo PDF definitivo, substitua o arquivo e ajuste `data.ts` (campos, BOM) e o script.
- Segundo PDF: `apps/site/public/demos/EG-001.pdf` (desenho de engrenagem enviado pelo responsável; **fictício/próprio, não é desenho de cliente** — confirmado pelo usuário em 17/10/2026, por isso pode ficar no Git e no site; PNG convertido por `apps/site/scripts/png-para-pdf.py`, sem texto selecionável). Campos em `data.ts` (`extractedFieldsByDocument`); peso e quantidade ficam "Não identificado" porque o desenho não os informa.
- Visualizador: `pdfjs-dist` carregado sob demanda (só na etapa 2); zoom, ajuste, páginas, nova aba e download são reais.
- Exportação XLSX/CSV gera arquivo demonstrativo no navegador, com os dados fictícios mostrados. Peso do conjunto nunca é inventado; a soma mostrada é parcial, só de componentes com peso.
- O botão "Solicitar demonstração" aponta para `#orcamento` (o site não tem seção de contato).
