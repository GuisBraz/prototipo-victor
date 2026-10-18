import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { normalizeRect, openPdf } from "./render.js";

const demo = (name: string) =>
  readFileSync(fileURLToPath(new URL(`../../../apps/site/public/demos/${name}.pdf`, import.meta.url)));

describe("renderização de PDF", () => {
  it("gera visão geral no limite de resolução e amplia a legenda", async () => {
    const pdf = await openPdf(demo("CJ-001"));
    try {
      expect(pdf.pageCount).toBe(1);
      const ov = await pdf.overview(1, 2576);
      expect(Math.max(ov.width, ov.height)).toBe(2576);
      expect(ov.data.subarray(0, 2).toString("hex")).toBe("ffd8"); // JPEG
      const region = await pdf.region(1, { x0: 0.6, y0: 0.7, x1: 1, y1: 1 }, 2576);
      expect(region.width).toBe(2576);
      expect(region.height).toBeGreaterThan(1000);
    } finally {
      await pdf.close();
    }
  });

  it("extrai texto nativo em linhas com posição normalizada", async () => {
    const pdf = await openPdf(demo("CJ-001"));
    try {
      const lines = await pdf.nativeText(1);
      const all = lines.map((l) => l.text).join("\n");
      expect(all).toContain("CJ-001");
      for (const l of lines) {
        expect(l.x).toBeGreaterThanOrEqual(0);
        expect(l.y).toBeLessThanOrEqual(1);
      }
    } finally {
      await pdf.close();
    }
  });

  it("PDF sem texto (imagem) devolve texto nativo vazio", async () => {
    const pdf = await openPdf(demo("EG-001"));
    try {
      expect(await pdf.nativeText(1)).toEqual([]);
    } finally {
      await pdf.close();
    }
  });

  it("normaliza e rejeita regiões inválidas", () => {
    expect(normalizeRect({ x0: 0.9, y0: 1.2, x1: 0.5, y1: 0.5 })).toEqual({ x0: 0.5, y0: 0.5, x1: 0.9, y1: 1 });
    expect(normalizeRect({ x0: 0.5, y0: 0.5, x1: 0.505, y1: 0.9 })).toBeNull();
    expect(normalizeRect({ x0: Number.NaN, y0: 0, x1: 1, y1: 1 })).toBeNull();
  });
});
