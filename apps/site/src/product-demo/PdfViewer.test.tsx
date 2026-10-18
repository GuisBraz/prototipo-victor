import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const render1 = vi.fn(() => ({ cancel: vi.fn(), done: Promise.resolve() }));
vi.mock("./pdfRender", () => ({
  loadPdf: vi.fn(async () => ({ numPages: 1 })),
  renderPage: (...a: unknown[]) => (render1 as (...x: unknown[]) => unknown)(...a),
}));

import { demoPdfs } from "./data";
import { PdfViewer } from "./PdfViewer";

afterEach(() => { cleanup(); render1.mockClear(); });

describe("PdfViewer", () => {
  it("links reais para abrir em nova aba e baixar", async () => {
    render(<PdfViewer pdf={demoPdfs["CJ-001"]!} />);
    const open = screen.getByRole("link", { name: /Abrir em nova aba/ });
    expect(open.getAttribute("href")).toMatch(/demos\/CJ-001\.pdf$/);
    expect(open.getAttribute("target")).toBe("_blank");
    expect(open.getAttribute("rel")).toContain("noopener");
    const dl = screen.getByRole("link", { name: /Baixar/ });
    expect(dl.getAttribute("download")).toBe("CJ-001.pdf");
    await waitFor(() => expect(screen.queryByText(/Carregando/)).toBeNull());
  });

  it("zoom muda de verdade e não passa dos limites; sem navegação de páginas quando há 1 página", async () => {
    render(<PdfViewer pdf={demoPdfs["CJ-001"]!} />);
    await waitFor(() => expect(screen.queryByText(/Carregando/)).toBeNull());
    const zoomOut = screen.getByRole("button", { name: "Reduzir zoom" }) as HTMLButtonElement;
    const zoomIn = screen.getByRole("button", { name: "Ampliar zoom" });
    expect(zoomOut.disabled).toBe(true);
    fireEvent.click(zoomIn);
    expect(screen.getByText("125%")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Ajustar à área" }));
    expect(screen.getByText("100%")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Próxima página" })).toBeNull();
    expect(screen.getByText("Origem: página 1 do desenho CJ-001.pdf")).toBeTruthy();
  });
});
