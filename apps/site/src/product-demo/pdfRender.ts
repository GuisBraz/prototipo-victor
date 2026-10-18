/**
 * Renderização do PDF com pdf.js, carregada sob demanda (só quando o visitante abre a etapa 2).
 * Isolado aqui para que os testes possam substituí-lo e para manter o pdf.js fora do pacote inicial.
 */
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";

export type PdfDoc = PDFDocumentProxy;

export async function loadPdf(url: string): Promise<PdfDoc> {
  const pdfjs = await import("pdfjs-dist");
  const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  return pdfjs.getDocument({ url }).promise;
}

export interface PageRender {
  cancel(): void;
  done: Promise<void>;
}

/** Desenha a página na largura CSS pedida, com nitidez para telas de alta densidade (até 2×). */
export function renderPage(pdf: PdfDoc, pageNumber: number, cssWidth: number, canvas: HTMLCanvasElement): PageRender {
  let task: RenderTask | null = null;
  let cancelled = false;
  const done = (async () => {
    const page = await pdf.getPage(pageNumber);
    if (cancelled) return;
    const base = page.getViewport({ scale: 1 });
    const scale = cssWidth / base.width;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const viewport = page.getViewport({ scale: scale * dpr });
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas indisponível");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    canvas.style.width = `${Math.floor(viewport.width / dpr)}px`;
    canvas.style.height = `${Math.floor(viewport.height / dpr)}px`;
    task = page.render({ canvasContext: ctx, viewport });
    try {
      await task.promise;
    } catch (e) {
      if (!cancelled) throw e; // cancelamento é esperado ao trocar zoom/página
    }
  })();
  return {
    done,
    cancel() {
      cancelled = true;
      task?.cancel();
    },
  };
}
