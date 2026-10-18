import { describe, expect, it } from "vitest";
import { runPool, splitPdfs } from "./uploadQueue";

describe("envio em lote", () => {
  it("respeita o limite de envios simultâneos e continua após falhas", async () => {
    let active = 0;
    let peak = 0;
    const done: number[] = [];
    await runPool([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active -= 1;
      if (n === 3) throw new Error("falhou");
      done.push(n);
    });
    expect(peak).toBe(3);
    expect(done.sort()).toEqual([1, 2, 4, 5, 6, 7]);
  });

  it("separa PDFs de outros arquivos da pasta", () => {
    const f = (name: string, type = "") => new File(["x"], name, { type });
    const { pdfs, ignored } = splitPdfs([f("A.PDF"), f("b.pdf"), f("c.dwg"), f("d", "application/pdf"), f("thumbs.db")]);
    expect(pdfs.map((x) => x.name)).toEqual(["A.PDF", "b.pdf", "d"]);
    expect(ignored.map((x) => x.name)).toEqual(["c.dwg", "thumbs.db"]);
  });
});
