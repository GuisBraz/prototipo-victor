# MECABOM Lite — protótipo sem custo

Site que lê um pacote de desenhos mecânicos em PDF e devolve a BOM organizada. É a versão de **escopo reduzido** do MECABOM: mesma identidade visual e mesmas regras de BOM (`docs/BOM_RULES.md`), mas **sem servidor, sem login, sem banco e sem IA paga**.

## Como abrir

- **Jeito recomendado:** dê dois cliques em `ABRIR.bat`. Ele sobe um servidor local com o Python e abre `http://localhost:8000` no navegador. Para encerrar, feche a janela minimizada "MECABOM Lite - servidor".
- **Sem Python:** abra `index.html` direto no Chrome ou no Edge. *Esse modo não foi testado; se o OCR falhar, use o `ABRIR.bat`.*
- **Para usar em outro computador ou compartilhar:** publique a pasta `prototipo/` no GitHub Pages (grátis). Mesmo publicado, os desenhos continuam sendo lidos só no navegador de quem usa.

Na primeira abertura é preciso ter internet para baixar as bibliotecas gratuitas (pdf.js, SheetJS, JSZip e, se marcado, Tesseract OCR). **Os desenhos nunca são enviados para lugar nenhum.**

## Como usar

1. Arraste PDFs, uma pasta ou um `.zip` para a área tracejada.
2. Confira as abas:
   - **Desenhos:** um por linha, com nº, revisão, título, material, peso, escala, cliente e a **quantidade no pacote**. Clique numa célula para corrigir e use o olho para ver a folha com a origem de cada valor marcada.
   - **BOM por desenho:** cada linha da lista de materiais, com qtd. × quantidade do desenho = **qtd. total**.
   - **BOM consolidada:** o que comprar/fabricar, somando itens iguais do pacote inteiro.
   - **Pendências:** o que conferir (pesos que não batem, posições faltando, desenhos citados que não vieram, revisões divergentes).
3. **Exportar Excel** gera um `.xlsx` com 5 abas: Resumo, Desenhos, BOM por desenho, BOM consolidada e Pendências.
4. **Campos lidos** permite ligar/desligar campos, incluir os rótulos dos seus carimbos (ex.: "Nº DES.", "CÓD. PEÇA") e criar campos novos.

## O que ele faz

| Etapa | Como |
|---|---|
| Ler o PDF | pdf.js extrai o texto **com posição** (funciona com folhas giradas 90°). |
| Carimbo | Procura rótulos (lista editável) e pega o valor ao lado ou abaixo. O nº do desenho é conferido com o nome do arquivo. |
| Lista de materiais | Acha a tabela pelas linhas de posição (1, 2, 2.1, 101…), com ou sem cabeçalho de texto. Detecta qtd., descrição, material/norma, referência e peso unitário/total (confere pela conta qual coluna é qual). |
| Hierarquia | Linha que cita outro desenho do pacote vira relação pai → filho, e a quantidade é multiplicada (soma por caminhos). |
| Quantidade do pacote | Lida de documentos auxiliares (ex.: ordem de serviço com "B4620MX21418 # 2 un.") ou digitada. Sem informação, vale 1 e isso é avisado. |
| Conferências | Soma dos pesos × peso do carimbo, peso total da linha × unitário × qtd., posições faltando, revisões repetidas, referências sem desenho. |
| OCR (opcional) | Tesseract.js no navegador, para folhas escaneadas ou carimbos em curvas. É lento (~30 s por folha) e só preenche códigos e números. |

**Regra herdada do MECABOM:** nada é inventado. O que não foi lido aparece como "não encontrado" ou "—", nunca como zero. Totais com alguma parcela ausente aparecem como **parcial**.

## Resultado com os desenhos de exemplo (testado em 15/10/2026)

- **Pacote Danieli** (13 desenhos + OM.pdf): 13/13 números corretos e revisões iguais às do nome do arquivo nos 9 que trazem revisão no nome, 61 linhas de lista, quantidades da OM aplicadas e flanges multiplicados pela hierarquia (ex.: B4620MX21188 = 2×4 + 1×2 = 10). Foram apontadas 2 linhas suspeitas no próprio desenho (pos. 112/109: qtd. 11 com peso total 1).
- **Pacote Rostag** (TC-2025-01-xx): listas lidas, inclusive sem cabeçalho de texto, com subitens 2.1, 2.2 etc. O carimbo está em curvas (fonte SHX), então o nº vem do nome do arquivo ou do OCR. Também foram apontados os desenhos citados que não vieram no pacote (01-03, 01-04, 01-06, 01-07).
- **Desenho COMAU** (32802691…): o carimbo não está em texto, então só o nº foi lido, pelo nome do arquivo.

## Limitações conhecidas

- Só **PDF**. DWG precisa ser exportado para PDF antes (ler DWG direto fica para depois).
- Leitura por **regras**: carimbos muito diferentes podem precisar de rótulos novos em "Campos lidos".
- O OCR gratuito erra em letra pequena; texto livre lido por OCR (título, material) é descartado de propósito.
- O consolidado junta itens com descrição e material **iguais**. Variações de escrita ("CH 1/2"" × "CHAPA 12,7") ainda não são unificadas.
- Nada fica salvo: ao fechar a aba, a leitura se perde (exporte o Excel). Só os campos configurados ficam guardados no navegador.

## Arquivos

```
prototipo/
  index.html      página
  styles.css      identidade visual (tokens de apps/site)
  js/extract.js   leitura do carimbo e da lista (funções puras, testáveis no Node)
  js/bom.js       hierarquia, quantidades, consolidação e conferências
  js/app.js       interface, visualizador, OCR e exportação
  ABRIR.bat       abre com servidor local do Python
```

`extract.js` e `bom.js` não dependem do navegador. Dá para reaproveitá-los no MECABOM completo (Fase 2b/4) como base do motor de BOM e da extração de texto nativo.
