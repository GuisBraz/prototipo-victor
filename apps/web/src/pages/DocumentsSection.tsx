import { useRef, useState } from "react";
import { hasAtLeastRole, type DocumentStatus, type JobStatus } from "@mecabom/shared";
import { friendlyError } from "../errors";
import { reprocessDocument, uploadPdf, useDocuments, type UploadOutcome } from "../documents";
import { formatBytes } from "../uploadRules";
import { useOrganizations } from "../organizations";

const DOCUMENT_STATUS_PT: Record<DocumentStatus, string> = {
  uploaded: "Recebido",
  validated: "Validado",
  rejected: "Rejeitado",
  queued: "Na fila",
  processing: "Processando",
  processed: "Processado",
  failed: "Falhou",
};

const JOB_STATUS_PT: Record<JobStatus, string> = {
  queued: "Aguardando processamento",
  running: "Em execução",
  succeeded: "Concluído",
  failed: "Falhou",
  cancelled: "Cancelado",
};

interface Attempt {
  id: number;
  fileName: string;
  state: "sending" | UploadOutcome["kind"] | "error";
  message?: string;
}

/** Envio e lista de PDFs do projeto. O processamento por IA entra nas próximas etapas da Fase 2. */
export function DocumentsSection({ projectId }: { projectId: string }) {
  const { current } = useOrganizations();
  const organizationId = current?.organizationId ?? null;
  const { rows, loading, error } = useDocuments(organizationId, projectId);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [reprocessError, setReprocessError] = useState<string | null>(null);
  const nextId = useRef(1);
  const inputRef = useRef<HTMLInputElement>(null);

  const canUpload = current ? hasAtLeastRole(current.role, "reviewer") : false;

  const update = (id: number, patch: Partial<Attempt>) =>
    setAttempts((list) => list.map((a) => (a.id === id ? { ...a, ...patch } : a)));

  async function handleFiles(files: FileList | null) {
    if (!files || !organizationId) return;
    for (const file of Array.from(files)) {
      const id = nextId.current++;
      setAttempts((list) => [{ id, fileName: file.name, state: "sending" }, ...list]);
      try {
        const outcome = await uploadPdf(organizationId, projectId, file);
        update(id, {
          state: outcome.kind,
          message:
            outcome.kind === "rejected"
              ? outcome.message
              : outcome.kind === "duplicate"
                ? "Este arquivo já foi enviado antes neste projeto; nada foi duplicado."
                : undefined,
        });
      } catch (e) {
        // Falha de um arquivo não interrompe os demais.
        update(id, { state: "error", message: friendlyError(e) });
      }
    }
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleReprocess(documentId: string) {
    if (!organizationId) return;
    setReprocessError(null);
    try {
      await reprocessDocument(organizationId, projectId, documentId);
    } catch (e) {
      setReprocessError(friendlyError(e));
    }
  }

  const stateLabel = (a: Attempt) =>
    ({
      sending: "Enviando…",
      accepted: "Recebido e na fila",
      duplicate: "Duplicado",
      rejected: "Rejeitado",
      error: "Erro",
    })[a.state];

  return (
    <section className="card">
      <h2>Documentos</h2>

      {canUpload ? (
        <div className="row" style={{ marginBottom: 12 }}>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            multiple
            onChange={(e) => void handleFiles(e.target.files)}
          />
          <span className="muted">PDF de até 30 MB e 100 páginas. O arquivo é verificado no servidor.</span>
        </div>
      ) : (
        <p className="muted">Seu papel não permite enviar documentos.</p>
      )}

      {attempts.length > 0 && (
        <ul className="muted" style={{ paddingLeft: 18 }}>
          {attempts.map((a) => (
            <li key={a.id}>
              <strong>{a.fileName}</strong> — {stateLabel(a)}
              {a.message ? `: ${a.message}` : ""}
            </li>
          ))}
        </ul>
      )}

      {reprocessError && <p className="error">{reprocessError}</p>}
      {error && <p className="error">Não foi possível carregar os documentos.</p>}
      {loading && <p className="muted">Carregando…</p>}

      {!loading && !error && rows.length === 0 && (
        <p className="muted">Nenhum documento enviado ainda.</p>
      )}

      {rows.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Arquivo</th>
              <th>Páginas</th>
              <th>Tamanho</th>
              <th>Situação</th>
              <th>Enviado em</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const jobStatus = r.job?.status;
              const canReprocess =
                canUpload && jobStatus !== undefined && jobStatus !== "queued" && jobStatus !== "running";
              return (
                <tr key={r.id}>
                  <td>{r.document.fileName}</td>
                  <td>{r.document.pageCount}</td>
                  <td>{formatBytes(r.document.sizeBytes)}</td>
                  <td>
                    {DOCUMENT_STATUS_PT[r.document.status]}
                    {jobStatus ? <span className="muted"> · {JOB_STATUS_PT[jobStatus]}</span> : null}
                  </td>
                  <td>{r.createdAt ? r.createdAt.toLocaleString("pt-BR") : "—"}</td>
                  <td>
                    {canReprocess && (
                      <button className="btn link" onClick={() => void handleReprocess(r.id)}>
                        Reprocessar
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
