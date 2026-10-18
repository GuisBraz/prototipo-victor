import { demoDocuments, demoPdfs, extractedFieldsByDocument, DEMO_DISCLAIMER } from "./data";
import { PdfViewer } from "./PdfViewer";
import { StateBadge } from "./StateBadge";

/** Etapa 2: o PDF à esquerda e os campos conferíveis à direita. */
export function ExtractedFields({ documentId, onSelect }: { documentId: string; onSelect: (id: string) => void }) {
  const doc = demoDocuments.find((d) => d.id === documentId);
  const fields = extractedFieldsByDocument[documentId];
  const pdf = demoPdfs[documentId];

  if (!fields || !pdf) {
    return (
      <div className="pd-empty" role="status">
        <h4>Sem prévia para {doc?.file ?? "este documento"}</h4>
        <p>Nesta demonstração, apenas os desenhos CJ-001 e EG-001 têm PDF de exemplo e campos preparados. Os demais itens da lista ilustram a organização do projeto.</p>
        <div className="pd-empty__actions">
          {Object.keys(demoPdfs).map((id) => (
            <button key={id} type="button" className="pd-btn pd-btn--primary" onClick={() => onSelect(id)}>Ver o desenho {id}</button>
          ))}
        </div>
      </div>
    );
  }

  const n = (s: string) => fields.filter((f) => f.state === s).length;
  return (
    <div className="pd-split">
      <PdfViewer key={documentId} pdf={pdf} />
      <section className="pd-fields" aria-labelledby="pd-fields-title">
        <h4 id="pd-fields-title">Campos identificados em {doc?.file}</h4>
        <p className="pd-fields__sum">{n("validated")} validados · {n("check")} para conferir · {n("not_found")} não identificado</p>
        <dl>
          {fields.map((f) => (
            <div key={f.key} className="pd-field">
              <dt>{f.label}</dt>
              <dd>
                <span className={f.state === "not_found" ? "pd-field__value is-empty" : "pd-field__value"}>{f.value}</span>
                <StateBadge state={f.state} />
                {f.note && <span className="pd-field__note">{f.note}</span>}
              </dd>
            </div>
          ))}
        </dl>
        <p className="pd-disclaimer">{DEMO_DISCLAIMER}</p>
      </section>
    </div>
  );
}
