import { useEffect, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import type { DemoPdf } from "./data";
import { loadPdf, renderPage, type PdfDoc } from "./pdfRender";

const ZOOM_MIN = 1;
const ZOOM_MAX = 4;
const ZOOM_STEP = 0.25;

/** Visualizador real: pdf.js desenha a página; zoom, ajuste, páginas, nova aba e download executam de fato. */
export function PdfViewer({ pdf: source }: { pdf: DemoPdf }) {
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [pdf, setPdf] = useState<PdfDoc | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1); // 1 = ajustado à largura disponível
  const [width, setWidth] = useState(0);

  useEffect(() => {
    let cancelled = false;
    loadPdf(source.url)
      .then((d) => { if (!cancelled) { setPdf(d); setStatus("ready"); } })
      .catch(() => { if (!cancelled) setStatus("error"); });
    return () => { cancelled = true; };
  }, [source.url]);

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const measure = () => setWidth(Math.max(0, el.clientWidth - 2));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!pdf || !canvas.current || width < 50) return;
    const job = renderPage(pdf, page, width * zoom, canvas.current);
    job.done.catch(() => setStatus("error"));
    return () => job.cancel();
  }, [pdf, page, width, zoom]);

  const pages = pdf?.numPages ?? 1;
  const setZ = (z: number) => setZoom(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100)));

  return (
    <div className="pd-viewer">
      <div className="pd-viewer__bar" role="toolbar" aria-label="Controles do visualizador de PDF">
        <button type="button" className="pd-icon" onClick={() => setZ(zoom - ZOOM_STEP)} disabled={zoom <= ZOOM_MIN} aria-label="Reduzir zoom">−</button>
        <output className="pd-viewer__zoom" aria-live="polite">{Math.round(zoom * 100)}%</output>
        <button type="button" className="pd-icon" onClick={() => setZ(zoom + ZOOM_STEP)} disabled={zoom >= ZOOM_MAX} aria-label="Ampliar zoom">+</button>
        <button type="button" className="pd-btn pd-btn--sm" onClick={() => setZ(1)} disabled={zoom === 1}>Ajustar à área</button>
        {pages > 1 && (
          <span className="pd-viewer__pages">
            <button type="button" className="pd-icon" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} aria-label="Página anterior">‹</button>
            <span>Página {page} de {pages}</span>
            <button type="button" className="pd-icon" onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page >= pages} aria-label="Próxima página">›</button>
          </span>
        )}
        <span className="pd-viewer__spacer" />
        <a className="pd-btn pd-btn--sm" href={source.url} target="_blank" rel="noopener noreferrer">Abrir em nova aba<span className="visually-hidden"> (abre em outra aba)</span></a>
        <a className="pd-btn pd-btn--sm" href={source.url} download={source.filename}><Icon name="download" size={14} /> Baixar</a>
      </div>

      <div ref={stage} className="pd-viewer__stage" tabIndex={0} role="region" aria-label={`Desenho ${source.filename}, página ${page} de ${pages}. Use as setas para rolar quando ampliado.`}>
        {status === "loading" && <p className="pd-viewer__msg" role="status">Carregando o desenho…</p>}
        {status === "error" && (
          <p className="pd-viewer__msg" role="alert">
            Não foi possível exibir o desenho aqui. Use “Abrir em nova aba” ou “Baixar” para ver o PDF.
          </p>
        )}
        <canvas ref={canvas} hidden={status !== "ready"} role="img" aria-label={source.alt} />
      </div>
      <p className="pd-viewer__src">Origem: página {page} do desenho {source.filename}</p>
    </div>
  );
}
