# BOM_RULES — Regras da lista de materiais

> Status: **especificação da Fase 0**. Será implementada em `packages/bom-engine` (TypeScript puro, sem IA nem Firebase) na Fase 4.

## 1. Princípio

A IA **extrai**. O motor **calcula e valida**. O humano **aprova**. O motor nunca recebe texto livre da IA: só relações, quantidades e campos já com status e evidência.

## 2. Entrada do motor

- `Drawing[]` (identidade, revisão, tipo, material, peso e escopo do peso).
- `ComponentReference[]` (pai → filho, posição, quantidade, unidade, base da quantidade, evidência, status).
- Configuração do projeto (política de revisões, desenho raiz, regras de bloqueio).

Somente referências com status utilizável (validadas, corrigidas ou aprovadas — configurável) entram no cálculo definitivo; as demais geram pendência e podem aparecer apenas em modo **rascunho**, claramente marcado.

## 3. Nível de completude (decidido antes de montar)

| Nível | Condição | Resultado |
|---|---|---|
| `catalog_only` | Há desenhos, mas nenhuma tabela de componentes/relação utilizável | Catálogo de desenhos; **sem BOM** |
| `partial` | Há relações para parte dos conjuntos; existem conjuntos sem composição ou referências sem desenho | BOM parcial, com pendências visíveis |
| `complete` | Todo conjunto da raiz tem composição e todas as referências resolvem a desenhos | BOM completa elegível a aprovação |

Regra: **não inventar composição** a partir de nome de arquivo, aparência visual ou suposição. Conjunto sem tabela de componentes ⇒ pendência `missing_composition`.

## 4. Tipos de BOM

- **Hierárquica:** árvore raiz → subconjuntos → peças, com `quantityPerParent`.
- **Consolidada:** lista plana por componente com `quantityTotal` e lista de conjuntos que o usam.

## 5. Regras obrigatórias

| # | Regra | Implementação |
|---|---|---|
| B1 | Quantidade por conjunto ≠ quantidade total | campos separados; total só calculado pelo motor |
| B2 | Peso unitário ≠ peso total do conjunto | `weightScope` obrigatório; escopo desconhecido ⇒ não usar em soma |
| B3 | Material de conjunto não é herdado pelos componentes | material só do próprio desenho/linha |
| B4 | Mesmo número de desenho não duplica componente | agrupamento por `(drawingNumber, revision)` na consolidação |
| B5 | Revisões diferentes seguem a política do projeto | padrão: usar a revisão **mais recente aprovada**; ver §6 |
| B6 | Ausente ≠ zero | `null` propaga; total com parcela ausente ⇒ `null` + pendência |
| B7 | Relação sem evidência suficiente é sinalizada | `Issue` `ambiguous_relation`, bloqueia aprovação (configurável) |
| B8 | Referência sem documento é pendência | `Issue` `missing_reference`; item entra marcado "sem desenho" |
| B9 | Ciclos e relações impossíveis são bloqueados | detecção por DFS; ex.: A contém B contém A; pai igual ao filho |
| B10 | Toda quantidade calculada é rastreável | `sourceReferences` encadeadas até documento/página/linha |
| B11 | Não calcular peso a partir de dimensões | proibido até funcionalidade validada |
| B12 | Quantidade de peças desenhadas na folha ≠ quantidade para montar | só a quantidade da **tabela de componentes/lista** vale como `per_assembly` |

## 6. Revisões

- Chave de desenho: `(drawingNumber, revision)`.
- Política padrão (configurável): a BOM referencia, para cada número, a revisão **mais recente aprovada**; se houver revisão mais nova **não aprovada**, o motor marca o item com aviso "revisão mais recente pendente".
- Se o conjunto cita explicitamente uma revisão, essa citação prevalece e diferenças geram aviso.
- Nunca sobrescrever revisão anterior; nova revisão ⇒ novo registro.
- Comparação automática de revisões: pós-MVP; hoje apenas sinalizar impacto.

## 7. Cálculo de quantidades

Para cada folha da árvore: `quantityTotal = Π quantityPerParent` ao longo do caminho do raiz, **somando** caminhos distintos na consolidação. Se qualquer fator for `null`/ambíguo, o resultado é `null` e a pendência aponta o fator faltante. Quantidades com unidades incompatíveis (ex.: `un` e `m`) não são somadas; geram pendência.

## 8. Versionamento e aprovação

Estados: `building → pending_review → in_review → approved → superseded`.

- `approved` é **imutável** (Rules + servidor). Mudanças criam nova versão `building` baseada na anterior.
- Novos desenhos disparam recálculo em **nova versão**, com diff de impacto; nunca alteram a aprovada.
- Aprovação exige papel `approver` e ausência de pendências `blocking` (regra configurável de forma controlada, com auditoria da configuração).
- Exportação operacional indica **número da versão e estado de aprovação**; rascunhos exportados são marcados "NÃO APROVADO".

## 9. Pendências geradas pelo motor

`missing_composition`, `missing_reference`, `ambiguous_relation`, `ambiguous_quantity`, `missing_weight`, `missing_material`, `unit_mismatch`, `cycle_detected`, `newer_revision_pending`, `conflicting_value`. Cada uma com severidade (`blocking|warning|info`), objeto afetado e caminho até a origem.

## 10. Testes obrigatórios do motor

1. Árvore simples (quantidades multiplicadas).
2. Peça usada em dois conjuntos (soma na consolidada, uso listado).
3. Subconjunto reutilizado em níveis diferentes.
4. Ciclo direto e indireto bloqueados.
5. Quantidade ausente ⇒ total `null` + pendência.
6. Referência sem desenho ⇒ pendência, item marcado.
7. Mesmo número, revisões diferentes.
8. Unidades incompatíveis.
9. Conjunto sem composição ⇒ nível `partial`; nada inventado.
10. Reprocessar não duplica itens (idempotência).
11. Alterar BOM aprovada ⇒ erro; nova versão criada.
12. Peso: escopo desconhecido não entra em somas.
