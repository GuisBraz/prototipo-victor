import { useRef, useState, type DragEvent } from "react";
import { PROCESSING_ERROR_MESSAGES_PT, hasAtLeastRole } from "@mecabom/shared";
import { friendlyError } from "../errors";
import { reprocessDocument, uploadPdf, type DocumentRow } from "../documents";
import { formatBytes } from "../uploadRules";
import { useOrganizations } from "../organizations";
import { filesFromDrop, runPool, splitPdfs } from "../uploadQueue";

/** Envios simultâneos ao servidor (o limite de sessões pendentes por usuário é 20). */
const UPLOAD_CONCURRENCY = 3;

interface Attempt {
  id: number;
  fileName: string;
  state: "waiting" | "sending" | "accepted" | "duplicate" | "rejected" | "error";
  message?: string;
}

function readingStatus(r: DocumentRow): { label: string; tone: "ok" | "busy" | "bad" | "idle"; detail?: string } {
  const job = r.job;
  if (r.document.status === "rejected") return { label: "Rejeitado", tone: "bad" };
  if (!job) return { label: "Recebido", tone: "idle" };
  switch (job.status) {
    case "queued":
      return { label: "Na fila para leitura", tone: "busy" };
    case "running":
      return { label: "Lendo com IA…", tone: "busy" };
    case "succeeded":
      return { label: "Lido", tone: "ok" };
    case "failed":
      return {
        label: "Falhou",
        tone: "bad",
        detail: job.errorCode ? (PROCESSING_ERROR_MESSAGES_PT[job.errorCode] ?? PROCESSING_ERROR_MESSAGES_PT.internal) : undefined,
      };
    default:
      return { label: "Cancelado", tone: "idle" };
  }
}

/** Envio de desenhos (arquivos ou pasta inteira) e acompanhamento da leitura. */
export function DocumentsSection({ projectId, rows, loading, error }: { projectId: string; rows: DocumentRow[]; loading: boolean; error: boolean }) {
  const { current } = useOrganizations();
  const organizationId = current?.organizationId ?? null;
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [ignored, setIgnored] = useState<string[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const nextId = useRef(1);
  const filesRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement | null>(null);

  const canUpload = current ? hasAtLeastRole(current.role, "reviewer") : false;

  const update = (id: number, patch: Partial<Attempt>) =>
    setAttempts((list) => list.map((a) => (a.id === id ? { ...a, ...patch } : a)));

  async function handleFiles(all: File[]) {
    if (!organizationId || all.length === 0) return;
    const { pdfs, ignored: other } = splitPdfs(all);
    setIgnored(other.map((f) => f.name));
    const batch = pdfs.map((file) => ({ id: nextId.current++, file }));
    setAttempts((list) => [...batch.map(({ id, file }) => ({ id, fileName: file.name, state: "waiting" as const })), ...list]);
    await runPool(batch, UPLOAD_CONCURRENCY, async ({ id, file }) => {
      update(id, { state: "sending" });
      try {
        const outcome = await uploadPdf(organizationId, projectId, file);
        update(id, {
          state: outcome.kind,
          message:
            outcome.kind === "rejected"
              ? outcome.message
              : outcome.kind === "duplicate"
                ? "Já enviado antes neste projeto; nada foi duplicado."
                : undefined,
        });
      } catch (e) {
        update(id, { state: "error", message: friendlyError(e) });
      }
    });
    if (filesRef.current) filesRef.current.value = "";
    if (folderRef.current) folderRef.current.value = "";
  }

  async function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (!canUpload) return;
    await handleFiles(await filesFromDrop(e.dataTransfer));
  }

  async function reprocess(ids: string[]) {
    if (!organizationId) return;
    setActionError(null);
    await runPool(ids, 3, async (documentId) => {
      try {
        await reprocessDocument(organizationId, projectId, documentId);
      } catch (e) {
        setActionError(friendlyError(e));
      }
    });
  }

  const count = (s: Attempt["state"]) => attempts.filter((a) => a.state === s).length;
  const inFlight = count("waiting") + count("sending");
  const problems = attempts.filter((a) => a.state === "rejected" || a.state === "error");

  const reading = rows.filter((r) => r.job?.status === "queued" || r.job?.status === "running").length;
  const done = rows.filter((r) => r.job?.status === "succeeded").length;
  const failed = rows.filter((r) => r.job?.status === "failed");
  const visible = showAll ? rows : rows.slice(0, 25);

  return (
    <section className="card">
      <div className="row">
        <h2 style={{ margin: 0 }}>1. Desenhos</h2>
        <span className="spacer" />
        {rows.length > 0 && (
          <span className="muted">
            {rows.length} desenho(s) · {done} lido(s) · {reading} em leitura · {failed.length} com falha
          </span>
        )}
      </div>

      {canUpload ? (
        <div
          className={`dropzone${dragging ? " over" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => void onDrop(e)}
        >
          <p style={{ margin: 0, fontWeight: 600 }}>Arraste aqui os desenhos em PDF ou uma pasta inteira</p>
          <p className="muted" style={{ margin: "4px 0 12px" }}>PDF digital ou escaneado, até 30 MB e 100 páginas cada. DWG ainda não é lido.</p>
          <div className="row" style={{ justifyContent: "center" }}>
            <button className="btn" onClick={() => filesRef.current?.click()}>Selecionar arquivos</button>
            <button className="btn" onClick={() => folderRef.current?.click()}>Selecionar pasta</button>
          </div>
          <input
            ref={filesRef}
            type="file"
            accept="application/pdf,.pdf"
            multiple
            hidden
            onChange={(e) => void handleFiles([...(e.target.files ?? [])])}
          />
          <input
            ref={(el) => {
              folderRef.current = el;
              // Atributos não padronizados para escolher uma pasta (Chrome, Edge, Firefox).
              el?.setAttribute("webkitdirectory", "");
              el?.setAttribute("directory", "");
            }}
            type="file"
            multiple
            hidden
            onChange={(e) => void handleFiles([...(e.target.files ?? [])])}
          />
        </div>
      ) : (
        <p className="muted">Seu papel não permite enviar documentos.</p>
      )}

      {attempts.length > 0 && (
        <p className="muted" style={{ margin: "12px 0 0" }}>
          Envio: {count("accepted")} recebido(s) · {count("duplicate")} duplicado(s) · {problems.length} com problema
          {inFlight > 0 ? ` · enviando ${inFlight}…` : ""}
        </p>
      )}
      {ignored.length > 0 && (
        <p className="muted" style={{ margin: "4px 0 0" }}>
          {ignored.length} arquivo(s) que não são PDF foram ignorados{ignored.length <= 5 ? `: ${ignored.join(", ")}` : ""}.
        </p>
      )}
      {problems.length > 0 && (
        <ul className="problems">
          {problems.map((a) => (
            <li key={a.id}>
              <strong>{a.fileName}</strong>: {a.message}
            </li>
          ))}
        </ul>
      )}

      {actionError && <p className="error">{actionError}</p>}
      {error && <p className="error">Não foi possível carregar os documentos.</p>}
      {loading && <p className="muted">Carregando…</p>}

      {rows.length > 0 && (
        <>
          {failed.length > 0 && canUpload && (
            <p style={{ margin: "12px 0 0" }}>
              <button className="btn" onClick={() => void reprocess(failed.map((r) => r.id))}>
                Reprocessar {failed.length} com falha
              </button>
            </p>
          )}
          <table style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th>Arquivo</th>
                <th>Páginas</th>
                <th>Tamanho</th>
                <th>Leitura</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const st = readingStatus(r);
                const jobStatus = r.job?.status;
                const canReprocess = canUpload && jobStatus !== undefined && jobStatus !== "queued" && jobStatus !== "running";
                return (
                  <tr key={r.id}>
                    <td>{r.document.fileName}</td>
                    <td>{r.document.pageCount}</td>
                    <td>{formatBytes(r.document.sizeBytes)}</td>
                    <td>
                      <span className={`badge ${st.tone}`}>{st.label}</span>
                      {st.detail && <div className="muted small">{st.detail}</div>}
                    </td>
                    <td>
                      {canReprocess && (
                        <button className="btn link" onClick={() => void reprocess([r.id])}>
                          Ler de novo
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length > 25 && (
            <button className="btn link" onClick={() => setShowAll((v) => !v)}>
              {showAll ? "Mostrar menos" : `Mostrar todos os ${rows.length}`}
            </button>
          )}
        </>
      )}
    </section>
  );
}
