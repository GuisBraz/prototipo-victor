import { createCanvas } from "@napi-rs/canvas";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist/types/src/display/api.js";

/**
 * Renderização de PDFs para a leitura com IA (docs/AI_PIPELINE.md §3).
 *
 * - `overview`: a página inteira no limite de resolução do modelo (lado maior em px).
 * - `region`: um recorte da página (coordenadas normalizadas 0–1, origem no canto superior
 *   esquerdo) renderizado em alta resolução, para a IA ler legenda e lista de materiais
 *   em folhas grandes (A0 e maiores), onde o texto some na visão geral.
 * - `nativeText`: texto selecionável do PDF agrupado em linhas, com posição normalizada.
 *
 * O PDF é dado não confiável: nada aqui executa conteúdo do documento (sem eval/JS do PDF).
 */

const require = createRequire(import.meta.url);
const pdfjsRoot = dirname(require.resolve("pdfjs-dist/package.json"));
const STANDARD_FONTS = join(pdfjsRoot, "standard_fonts") + "/";
const CMAPS = join(pdfjsRoot, "cmaps") + "/";

/** Escala máxima ao ampliar (≈ 576 dpi): mais que isso só aumenta o arquivo, não a legibilidade. */
const MAX_REGION_SCALE = 8;
/** JPEG de alta qualidade: traço de desenho continua nítido e o tamanho fica controlado. */
const JPEG_QUALITY = 88;

export interface RenderedImage {
  mediaType: "image/jpeg";
  data: Buffer;
  width: number;
  height: number;
}

export interface NativeTextLine {
  x: number;
  y: number;
  text: string;
}

export interface PdfRenderer {
  pageCount: number;
  /** Tamanho da página em pontos (1/72 pol.), já com a rotação aplicada. */
  pageSize(page: number): Promise<{ width: number; height: number }>;
  overview(page: number, longEdgePx: number): Promise<RenderedImage>;
  region(page: number, rect: NormalizedRect, longEdgePx: number): Promise<RenderedImage>;
  nativeText(page: number): Promise<NativeTextLine[]>;
  close(): Promise<void>;
}

export interface NormalizedRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Corrige e valida um retângulo pedido pela IA. Null se for inválido ou pequeno demais. */
export function normalizeRect(r: NormalizedRect): NormalizedRect | null {
  const vals = [r.x0, r.y0, r.x1, r.y1];
  if (vals.some((v) => typeof v !== "number" || !Number.isFinite(v))) return null;
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const x0 = clamp(Math.min(r.x0, r.x1));
  const x1 = clamp(Math.max(r.x0, r.x1));
  const y0 = clamp(Math.min(r.y0, r.y1));
  const y1 = clamp(Math.max(r.y0, r.y1));
  if (x1 - x0 < 0.01 || y1 - y0 < 0.01) return null;
  return { x0, y0, x1, y1 };
}

async function renderViewport(
  page: PDFPageProxy,
  scale: number,
  crop: NormalizedRect | null,
): Promise<RenderedImage> {
  const full = page.getViewport({ scale });
  const x0 = crop ? crop.x0 * full.width : 0;
  const y0 = crop ? crop.y0 * full.height : 0;
  const width = Math.max(1, Math.round(crop ? (crop.x1 - crop.x0) * full.width : full.width));
  const height = Math.max(1, Math.round(crop ? (crop.y1 - crop.y0) * full.height : full.height));
  const viewport = page.getViewport({ scale, offsetX: -x0, offsetY: -y0 });

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  await page.render({
    canvasContext: ctx as unknown as CanvasRenderingContext2D,
    viewport,
    // Não renderiza campos de formulário/anotações interativas: só o desenho.
    annotationMode: pdfjs.AnnotationMode.DISABLE,
  }).promise;
  const data = canvas.toBuffer("image/jpeg", JPEG_QUALITY);
  return { mediaType: "image/jpeg", data, width, height };
}

/** Agrupa os trechos de texto do PDF em linhas legíveis, de cima para baixo. */
function groupLines(items: { x: number; y: number; text: string; h: number }[]): NativeTextLine[] {
  const sorted = items.filter((i) => i.text.trim() !== "").sort((a, b) => a.y - b.y || a.x - b.x);
  const lines: { y: number; h: number; parts: { x: number; text: string }[] }[] = [];
  for (const it of sorted) {
    const tol = Math.max(0.002, it.h * 0.5);
    const line = lines.find((l) => Math.abs(l.y - it.y) <= Math.max(tol, l.h * 0.5));
    if (line) line.parts.push({ x: it.x, text: it.text });
    else lines.push({ y: it.y, h: it.h, parts: [{ x: it.x, text: it.text }] });
  }
  return lines
    .sort((a, b) => a.y - b.y)
    .flatMap((l) => {
      // Separa blocos distantes na mesma altura (colunas de uma tabela, campos da legenda).
      const parts = l.parts.sort((a, b) => a.x - b.x);
      const out: NativeTextLine[] = [];
      let cur: { x: number; text: string; end: number } | null = null;
      for (const p of parts) {
        const approxEnd = p.x + p.text.length * 0.004;
        if (cur && p.x - cur.end < 0.03) {
          cur.text += (p.x - cur.end > 0.002 ? " " : "") + p.text;
          cur.end = Math.max(cur.end, approxEnd);
        } else {
          if (cur) out.push({ x: cur.x, y: l.y, text: cur.text.trim() });
          cur = { x: p.x, text: p.text, end: approxEnd };
        }
      }
      if (cur) out.push({ x: cur.x, y: l.y, text: cur.text.trim() });
      return out;
    });
}

export async function openPdf(bytes: Uint8Array): Promise<PdfRenderer> {
  const task = pdfjs.getDocument({
    data: new Uint8Array(bytes),
    standardFontDataUrl: STANDARD_FONTS,
    cMapUrl: CMAPS,
    cMapPacked: true,
    isEvalSupported: false,
    enableXfa: false,
    disableFontFace: true,
    useSystemFonts: false,
    verbosity: 0,
  });
  const doc: PDFDocumentProxy = await task.promise;

  const getPage = async (n: number) => {
    if (!Number.isInteger(n) || n < 1 || n > doc.numPages) throw new RangeError(`Página ${n} inexistente`);
    return doc.getPage(n);
  };

  return {
    pageCount: doc.numPages,
    async pageSize(n) {
      const vp = (await getPage(n)).getViewport({ scale: 1 });
      return { width: vp.width, height: vp.height };
    },
    async overview(n, longEdgePx) {
      const page = await getPage(n);
      const base = page.getViewport({ scale: 1 });
      return renderViewport(page, longEdgePx / Math.max(base.width, base.height), null);
    },
    async region(n, rect, longEdgePx) {
      const page = await getPage(n);
      const base = page.getViewport({ scale: 1 });
      const w = (rect.x1 - rect.x0) * base.width;
      const h = (rect.y1 - rect.y0) * base.height;
      const scale = Math.min(longEdgePx / Math.max(w, h), MAX_REGION_SCALE);
      return renderViewport(page, scale, rect);
    },
    async nativeText(n) {
      const page = await getPage(n);
      const vp = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const items: { x: number; y: number; text: string; h: number }[] = [];
      for (const it of content.items) {
        if (!("str" in it) || it.str.trim() === "") continue;
        const [x, y] = vp.convertToViewportPoint(it.transform[4], it.transform[5]);
        const h = Math.abs(it.transform[3] ?? 0) || Math.abs(it.height ?? 0);
        items.push({ x: x / vp.width, y: y / vp.height, text: it.str, h: h / vp.height });
      }
      return groupLines(items);
    },
    async close() {
      await doc.destroy();
    },
  };
}
