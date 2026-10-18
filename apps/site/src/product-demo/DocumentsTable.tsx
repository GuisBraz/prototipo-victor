import { useId, useRef, useState, type ChangeEvent } from "react";
import { Icon } from "../components/Icon";
import { summarizeDocuments } from "./bom";
import { demoDocuments, demoPdfs, PROCESSING_LABEL, type ProcessingStatus } from "./data";
import { formatBytes } from "./format";

interface LocalFile { name: string; size: number }

export function DocumentsTable({
  selectedId,
  onSelect,
  onOpenPreview,
}: {
  selectedId: string;
  onSelect: (id: string) => void;
  onOpenPreview: () => void;
}) {
  const sum = summarizeDocuments();
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [local, setLocal] = useState<LocalFile[]>([]);
  const selected = demoDocuments.find((d) => d.id === selectedId);

  const onFiles = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).map((f) => ({ name: f.name, size: f.size }));
    setLocal(files);
    e.target.value = "";
  };

  return (
    <div className="pd-docs">
      <ul className="pd-kpis" aria-label="Resumo demonstrativo do projeto">
        <li><strong>{sum.registered}</strong> desenhos cadastrados</li>
        <li><strong>{sum.processed}</strong> processados</li>
        <li><strong>{sum.reviewPending}</strong> aguardando revisão</li>
        <li><strong>{sum.queued}</strong> na fila</li>
      </ul>

      <div className="pd-toolbar">
        <input id={inputId} ref={input} type="file" accept="application/pdf,.pdf" multiple hidden onChange={onFiles} />
        <button type="button" className="pd-btn" onClick={() => input.current?.click()}>
          <Icon name="plus" size={16} /> Adicionar arquivos
        </button>
        <p className="pd-hint">Seleção apenas ilustrativa: nada é enviado, lido ou processado.</p>
      </div>

      {local.length > 0 && (
        <div className="pd-local" role="status">
          <p>
            <strong>Selecionado neste navegador, sem envio e sem processamento:</strong>
          </p>
          <ul>
            {local.map((f, i) => (
              <li key={`${f.name}-${i}`}>{f.name} <span>({formatBytes(f.size)})</span></li>
            ))}
          </ul>
          <button type="button" className="pd-link" onClick={() => setLocal([])}>Limpar seleção</button>
        </div>
      )}

      <table className="pd-table pd-table--docs">
        <caption className="visually-hidden">Documentos do projeto (dados ilustrativos). Escolha uma linha para selecionar o documento.</caption>
        <thead>
          <tr>
            <th scope="col">Arquivo</th>
            <th scope="col">Nº do desenho</th>
            <th scope="col">Tipo</th>
            <th scope="col">Revisão</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {demoDocuments.map((d) => {
            const on = d.id === selectedId;
            return (
              <tr key={d.id} className={on ? "is-selected" : undefined} onClick={() => onSelect(d.id)}>
                <th scope="row" data-label="Arquivo">
                  <button type="button" className="pd-rowbtn" aria-pressed={on} onClick={(e) => { e.stopPropagation(); onSelect(d.id); }}>
                    <Icon name="file" size={16} /> {d.file}
                  </button>
                </th>
                <td data-label="Nº do desenho">{d.drawingNumber}</td>
                <td data-label="Tipo">{d.kind}</td>
                <td data-label="Revisão">{d.revision}</td>
                <td data-label="Status"><ProcessingBadge status={d.status} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="pd-foot">
        <p className="pd-hint" aria-live="polite">
          Documento selecionado: <strong>{selected?.file}</strong>
          {selected && !demoPdfs[selected.id] && " — nesta demonstração só o CJ-001 e o EG-001 têm PDF de exemplo."}
        </p>
        <button type="button" className="pd-btn pd-btn--primary" onClick={onOpenPreview}>
          Abrir prévia e campos
        </button>
      </div>
    </div>
  );
}

function ProcessingBadge({ status }: { status: ProcessingStatus }) {
  return <span className={`pd-proc pd-proc--${status}`}>{PROCESSING_LABEL[status]}</span>;
}
