# DATA_MODEL — MECABOM

> Status: **proposta da Fase 0**. Os tipos reais serão definidos em `packages/shared` (Zod) na Fase 1/2; este documento é a especificação de referência.

## 1. Decisão: subcoleções sob a organização

Opções avaliadas:

- **Coleções globais** com `organizationId` em cada documento: permite consulta entre organizações, mas toda Rule precisa verificar `organizationId`; um esquecimento vaza dados.
- **Subcoleções sob `organizations/{orgId}`** (recomendado): o caminho já carrega o tenant; Rules ficam curtas (`isMember(orgId)`); não há necessidade de consultar entre organizações.

Mantemos mesmo assim `organizationId` redundante nos documentos para validação em Rules de escrita, filtros em *collection group* quando necessário e auditoria.

## 2. Estrutura

```
users/{uid}                                  # perfil mínimo; lista de organizações (membership espelhada)
organizations/{orgId}
  ├─ members/{uid}
  ├─ projects/{projectId}
  │    ├─ documents/{documentId}
  │    ├─ drawings/{drawingId}
  │    ├─ jobs/{jobId}
  │    ├─ extractions/{extractionId}          # metadados + evidências (ver §4)
  │    ├─ issues/{issueId}                    # pendências / inconsistências
  │    ├─ bomVersions/{bomVersionId}
  │    │    └─ items/{itemId}
  │    └─ ...
  └─ auditEvents/{eventId}
```

Contadores agregados (ex.: "documentos aguardando revisão") serão mantidos de forma incremental por transação/trigger, ou lidos por `count()` agregado — **nunca** inventados. Indicadores do painel só aparecem com dado real.

## 3. Entidades

Convenções: `createdAt`/`updatedAt` = timestamp de servidor; ids = ids do Firestore salvo indicação; enums como string literal.

### Organization
`id, name, status(active|suspended), settings{ limits, aiProcessingConsent{acceptedBy, acceptedAt, termsVersion}, approvalRules }, createdAt, updatedAt`

O **aceite de processamento por IA externa** é obrigatório antes do primeiro processamento (requisito de segurança).

### Member
`userId, organizationId, role(viewer|reviewer|approver|admin), permissions?, status(active|invited|disabled), createdAt`

Papéis via campo `role`; `permissions` granulares ficam para depois (futuro).

### Project
`id, organizationId, code, name, description, status(active|archived), ownerId, settings, createdAt, updatedAt`

Unicidade de `code` por organização garantida por transação/documento-índice.

### Document (arquivo recebido)
`id, organizationId, projectId, fileName, storagePath, contentHash(sha256), mimeType, sizeBytes, pageCount, status(uploaded|validated|rejected|queued|processing|processed|failed), duplicateOf?, folderId?, createdBy, createdAt`

- Unicidade lógica: `(projectId, contentHash)`, garantida por documento-índice `documentHashes/{hash}` dentro de transação.
- **Decisão da Fase 2:** um arquivo duplicado **não cria um segundo `Document`**. A sessão de upload registra `status: duplicate` + `documentId` do original, o arquivo enviado é descartado e a auditoria guarda `document.duplicate_detected`. Isso evita registros e arquivos redundantes; o campo `duplicateOf` não é usado.
- Só entram como `Document` arquivos aprovados na validação (assinatura `%PDF`, leitura real, sem senha, páginas e tamanho dentro do limite). Rejeições ficam apenas na sessão de upload (`status: rejected` + `rejectionCode`).
- Organização em "pastas" é **metadado** (`folderId`/caminho lógico), sem relação com diretório físico.

### Upload (sessão de envio) — Fase 2
`organizations/{orgId}/projects/{projectId}/uploads/{uploadId}`: `createdBy, fileName(sanitizado), declaredSizeBytes, storagePath(definido pelo servidor), status(pending|accepted|duplicate|rejected), rejectionCode?, documentId?, expiresAt, createdAt`. Escrita só pelo servidor; o criador lê a própria sessão. Sessões pendentes vencem em 30 min.

### ProcessingJob
`id(determinístico = id do documento), organizationId, projectId, documentId, status(queued|running|succeeded|failed|cancelled), currentStep, attempts(da execução atual), runCount(execuções; sobe a cada reprocessamento), modelId, promptVersion, pipelineVersion, startedAt, completedAt, errorCode, errorMessage(sem dados sensíveis), usage{inputTokens, outputTokens, calls}, createdAt`

### ExtractionResult
Um por job bem-sucedido (ou parcial). Contém, por campo, a estrutura abaixo. Para controlar o limite de 1 MiB, o payload completo pode ser salvo como JSON no Storage e referenciado (`payloadPath`), mantendo no Firestore o resumo e os estados.

```ts
type FieldStatus =
  | "validated"            // identificado e validado
  | "unvalidated"          // identificado, ainda não validado
  | "ambiguous"
  | "not_found"
  | "conflicting"          // conflita com outros documentos
  | "manually_corrected"
  | "approved";

type ExtractionMethod = "native_text" | "ocr" | "ai_visual" | "system_rule";

interface Evidence {
  page: number;
  snippet?: string;                 // trecho de texto
  region?: { x: number; y: number; w: number; h: number }; // coordenadas normalizadas 0..1
}

interface ExtractedField<T> {
  rawValue: string | null;          // exatamente como aparece no documento
  normalizedValue: T | null;        // valor normalizado pelo sistema
  unit?: string;
  method: ExtractionMethod;
  evidence: Evidence[];
  status: FieldStatus;
  isInference: boolean;             // diferencia indicado explicitamente de inferido
  notes?: string;                   // ambiguidade/conflito
  history: Array<{ at: string; by: string; from: unknown; to: unknown; justification?: string }>;
}
```

Regra: `not_found` e `ambiguous` **nunca** são preenchidos com valor inventado nem com zero. A confiança relatada pelo modelo, se existir, é armazenada apenas como dado auxiliar e **não** altera o status por si só; a prioridade de revisão é calculada pelo sistema (evidência, conflitos, regras de negócio).

### Drawing (identidade técnica)
`id, organizationId, projectId, drawingNumber, revision, title, description, documentType(part|assembly|subassembly|general_assembly|fabrication|detail|reference|other|unknown), sheet, totalSheets, material, materialStandard, weight, weightUnit, weightScope(unit|assembly|unknown), sourceDocumentId, extractionResultId, validationStatus, supersededBy?, createdAt, updatedAt`

- Chave natural: `(projectId, drawingNumber, revision)`. Mesmo número com revisões diferentes = **desenhos distintos** ligados por número; nunca sobrescrever.
- Campos técnicos (`material`, `weight`, …) espelham `ExtractedField` (valor atual + status); o histórico fica na extração/auditoria.
- `weightScope` impede confundir peso de peça com peso de conjunto.

### ComponentReference (relação extraída)
Subcoleção ou lista em `Drawing`: `parentDrawingId, childDrawingNumber, childDrawingId?, itemPosition, quantity, quantityUnit, quantityBasis(per_assembly|per_project|unknown), evidence, status`

`childDrawingId` vazio = **referência sem documento** ⇒ gera `Issue`.

### Issue (pendência/inconsistência)
`id, type(missing_reference|ambiguous_quantity|conflicting_value|cycle|duplicate|missing_field|…), severity(blocking|warning|info), subject{type,id}, message, status(open|resolved|dismissed), resolvedBy?, resolution?, createdAt`

`blocking` impede aprovação, conforme regras configuráveis (`approvalRules`).

### BomVersion
`id, organizationId, projectId, versionNumber, kind(hierarchical|consolidated|partial), status(building|pending_review|in_review|approved|superseded), sourceDocuments[], basedOnVersion?, completeness{ level, openBlockingIssues }, createdBy, approvedBy?, createdAt, approvedAt?, replacedBy?`

- `approved` ⇒ **imutável** (Rules proíbem escrita; servidor também recusa). Mudanças criam nova versão.
- `completeness.level`: `catalog_only | partial | complete` — resultado de avaliar se há informação suficiente (ver `BOM_RULES.md`).

### BomItem
`id, bomVersionId, itemNumber, level, parentItemId, drawingId, componentNumber, revision, description, documentType, quantityPerParent, quantityTotal, unit, quantityBasis, unitWeight, totalWeight, material, validationStatus, sourceReferences[]`

- `quantityTotal` e `totalWeight` são **calculados pelo motor**, nunca digitados por IA; `null` quando faltam dados.
- `sourceReferences` liga cada quantidade à sua origem (documento, página, linha de tabela).

### AuditEvent
`id, organizationId, projectId?, actorId, action, subject{type,id}, before?, after?, justification?, at, requestId`

Escrita só pelo servidor; leitura restrita a administradores. Eventos obrigatórios: correção de campo, aprovação, criação de versão, exclusão, reprocessamento, exportação, mudança de papel.

## 4. Índices e consultas previstas (a criar apenas quando implementadas)

- Documentos do projeto por `status`, `createdAt desc`.
- Drawings por `drawingNumber` + `revision`.
- Issues abertas por `severity`.
- Itens de BOM por `bomVersionId` + `level`/`parentItemId`.

Índices são criados em `firestore.indexes.json` junto com a consulta correspondente.

## 5. Rules (princípios)

- Negar por padrão.
- Leitura: membro ativo da organização (`organizations/{orgId}/members/{uid}` existe e `status == active`).
- Escrita pelo cliente: apenas campos permitidos (ex.: rascunhos de revisão); **aprovação, publicação, BOM e auditoria somente pelo servidor**.
- BOM `approved`: sem escrita.
- Testes de Rules obrigatórios no emulador (acesso cross-org negado).

## 6. Compatibilidade e migração

Todo documento persistido leva `schemaVersion`. Mudanças de schema precisam ser retrocompatíveis ou acompanhadas de migração versionada. Dados de demonstração, quando existirem, serão marcados explicitamente (`isDemo: true`) e nunca misturados com dados reais.
