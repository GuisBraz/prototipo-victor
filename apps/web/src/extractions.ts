import { collection, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { useEffect, useMemo, useState } from "react";
import {
  ACK_PREFIX,
  buildBom,
  drawingRecordFromExtraction,
  extractionOutputSchema,
  paths,
  type BomResult,
  type CellSource,
  type DrawingOverrides,
  type ExtractionOutput,
  type ReadMode,
  type SaveReviewInput,
} from "@mecabom/shared";
import { firestore, functions } from "./firebase";

/** Leitura por IA de um documento, com as correções da conferência. */
export interface ExtractionDoc {
  documentId: string;
  fileName: string;
  pageCount: number | null;
  output: ExtractionOutput;
  overrides: DrawingOverrides;
  readMode: ReadMode;
  modelId: string;
  promptVersion: string;
}

/** Leituras do projeto em tempo real (escritas só pelo servidor). */
export function useExtractions(organizationId: string | null, projectId: string | undefined) {
  const key = organizationId && projectId ? `${organizationId}/${projectId}` : null;
  const [state, setState] = useState<{ key: string; byId: Map<string, ExtractionDoc>; error: boolean } | null>(null);

  useEffect(() => {
    if (!organizationId || !projectId || !key) return;
    return onSnapshot(
      collection(firestore, paths.extractions(organizationId, projectId)),
      (snap) => {
        const byId = new Map<string, ExtractionDoc>();
        for (const d of snap.docs) {
          const data = d.data();
          const output = extractionOutputSchema.safeParse(data.output);
          if (!output.success) continue;
          const overrides: DrawingOverrides = {};
          for (const [k, v] of Object.entries((data.overrides ?? {}) as Record<string, { value?: unknown }>)) {
            overrides[k] = { value: typeof v?.value === "string" ? v.value : null };
          }
          byId.set(d.id, {
            documentId: d.id,
            fileName: String(data.fileName ?? d.id),
            pageCount: typeof data.pageCount === "number" ? data.pageCount : null,
            output: output.data,
            overrides,
            readMode: data.readMode === "digital" || data.readMode === "scanned" ? data.readMode : "unknown",
            modelId: String(data.modelId ?? ""),
            promptVersion: String(data.promptVersion ?? ""),
          });
        }
        setState({ key, byId, error: false });
      },
      () => setState({ key, byId: new Map(), error: true }),
    );
  }, [organizationId, projectId, key]);

  const current = key && state?.key === key ? state : null;
  return {
    byId: current?.byId ?? new Map<string, ExtractionDoc>(),
    loading: key !== null && current === null,
    error: current?.error ?? false,
  };
}

/** BOM calculada no navegador pelo mesmo motor determinístico do pacote compartilhado. */
export function useBom(byId: Map<string, ExtractionDoc>): BomResult {
  return useMemo(
    () =>
      buildBom(
        [...byId.values()].map((x) =>
          drawingRecordFromExtraction({
            documentId: x.documentId,
            fileName: x.fileName,
            extraction: x.output,
            overrides: x.overrides,
            readMode: x.readMode,
            pageCount: x.pageCount,
          }),
        ),
      ),
    [byId],
  );
}

const saveReviewCall = httpsCallable<SaveReviewInput, { ok: true }>(functions, "saveReview");

export async function saveReview(input: Omit<SaveReviewInput, "clear"> & { clear?: boolean }): Promise<void> {
  await saveReviewCall({ ...input, clear: input.clear ?? false });
}

export interface FieldEvidence {
  rawValue: string | null;
  page: number | null;
  snippet: string | null;
  note: string | null;
}

/** Valor lido pela IA e evidência (página e trecho) do campo de origem de uma célula. */
export function evidenceFor(x: ExtractionDoc | undefined, source: CellSource): FieldEvidence | null {
  if (!x) return null;
  const field = source.field.startsWith(ACK_PREFIX) ? source.field.slice(ACK_PREFIX.length) : source.field;
  const m = /^rows\.(\d+)\.(\w+)$/.exec(field);
  if (m) {
    const row = x.output.componentTable.rows[Number(m[1])];
    if (!row) return null;
    const col = m[2] as keyof typeof row;
    const raw = row[col];
    return { rawValue: typeof raw === "string" ? raw : null, page: row.page, snippet: row.snippet, note: row.note };
  }
  if (field === "quantity") return { rawValue: null, page: null, snippet: null, note: null };
  const tb = x.output.titleBlock[field as keyof ExtractionOutput["titleBlock"]];
  if (!tb) return null;
  return { rawValue: tb.rawValue, page: tb.page, snippet: tb.snippet, note: tb.note };
}

/** Valor atual (corrigido ou lido) de um campo, para preencher o formulário de correção. */
export function currentValue(x: ExtractionDoc | undefined, source: CellSource): string {
  const override = x?.overrides[source.field];
  if (override) return override.value ?? "";
  return evidenceFor(x, source)?.rawValue ?? "";
}
