import { collection, onSnapshot, orderBy, query, type Timestamp } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { ref, uploadBytes } from "firebase/storage";
import { useEffect, useState } from "react";
import {
  REJECTION_MESSAGES_PT,
  documentSchema,
  jobSchema,
  paths,
  type FinalizeUploadInput,
  type FinalizeUploadResult,
  type PdfDocument,
  type ProcessingJob,
  type ReprocessDocumentInput,
  type RequestUploadInput,
} from "@mecabom/shared";
import { firestore, functions, storage } from "./firebase";
import { prevalidateFile } from "./uploadRules";

export interface DocumentRow {
  id: string;
  document: PdfDocument;
  job: ProcessingJob | null;
  createdAt: Date | null;
}

function toDate(value: unknown): Date | null {
  return value && typeof (value as Timestamp).toDate === "function"
    ? (value as Timestamp).toDate()
    : null;
}

/** Documentos do projeto com o job correspondente (id do job = id do documento). */
export function useDocuments(organizationId: string | null, projectId: string | undefined) {
  const key = organizationId && projectId ? `${organizationId}/${projectId}` : null;
  const [docs, setDocs] = useState<{ key: string; rows: Map<string, DocumentRow>; error: boolean } | null>(null);
  const [jobs, setJobs] = useState<{ key: string; byId: Map<string, ProcessingJob> } | null>(null);

  useEffect(() => {
    if (!organizationId || !projectId || !key) return;
    return onSnapshot(
      query(collection(firestore, paths.documents(organizationId, projectId)), orderBy("createdAt", "desc")),
      (snap) => {
        const rows = new Map<string, DocumentRow>();
        for (const d of snap.docs) {
          const parsed = documentSchema.safeParse(d.data());
          if (parsed.success) {
            rows.set(d.id, { id: d.id, document: parsed.data, job: null, createdAt: toDate(d.data().createdAt) });
          }
        }
        setDocs({ key, rows, error: false });
      },
      () => setDocs({ key, rows: new Map(), error: true }),
    );
  }, [organizationId, projectId, key]);

  useEffect(() => {
    if (!organizationId || !projectId || !key) return;
    return onSnapshot(
      collection(firestore, paths.jobs(organizationId, projectId)),
      (snap) => {
        const byId = new Map<string, ProcessingJob>();
        for (const d of snap.docs) {
          const parsed = jobSchema.safeParse(d.data());
          if (parsed.success) byId.set(d.id, parsed.data);
        }
        setJobs({ key, byId });
      },
      () => setJobs({ key, byId: new Map() }),
    );
  }, [organizationId, projectId, key]);

  const currentDocs = key && docs?.key === key ? docs : null;
  const currentJobs = key && jobs?.key === key ? jobs : null;
  const rows = currentDocs
    ? [...currentDocs.rows.values()].map((r) => ({ ...r, job: currentJobs?.byId.get(r.id) ?? null }))
    : [];
  return { rows, loading: key !== null && currentDocs === null, error: currentDocs?.error ?? false };
}

const requestUploadCall = httpsCallable<RequestUploadInput, { uploadId: string; storagePath: string }>(
  functions,
  "requestUpload",
);
const finalizeUploadCall = httpsCallable<FinalizeUploadInput, FinalizeUploadResult>(
  functions,
  "finalizeUpload",
);
const reprocessCall = httpsCallable<ReprocessDocumentInput, { documentId: string }>(
  functions,
  "reprocessDocument",
);

export type UploadOutcome =
  | { kind: "accepted"; documentId: string }
  | { kind: "duplicate"; documentId: string }
  | { kind: "rejected"; message: string };

/** Envia um PDF: sessão no servidor → upload ao Storage → validação e registro no servidor. */
export async function uploadPdf(
  organizationId: string,
  projectId: string,
  file: File,
): Promise<UploadOutcome> {
  const problem = prevalidateFile(file);
  if (problem) return { kind: "rejected", message: problem };

  const { uploadId, storagePath } = (
    await requestUploadCall({ organizationId, projectId, fileName: file.name, sizeBytes: file.size })
  ).data;
  await uploadBytes(ref(storage, storagePath), file, { contentType: "application/pdf" });
  const result = (await finalizeUploadCall({ organizationId, projectId, uploadId })).data;

  if (result.status === "rejected") {
    return { kind: "rejected", message: REJECTION_MESSAGES_PT[result.reason] };
  }
  return { kind: result.status, documentId: result.documentId };
}

export async function reprocessDocument(
  organizationId: string,
  projectId: string,
  documentId: string,
): Promise<void> {
  await reprocessCall({ organizationId, projectId, documentId });
}
