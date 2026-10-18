import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Header } from "../components/Header";
import { App } from "../App";
import { pricing } from "../config/brand";
import { formatPrice, Investment } from "../sections/Investment";
import { Faq } from "../sections/Faq";
import { ProductDemo } from "../product-demo/ProductDemo";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Faq", () => {
  it("abre e fecha uma pergunta e atualiza aria-expanded", () => {
    render(<Faq />);
    const botoes = screen.getAllByRole("button") as [HTMLElement, HTMLElement, ...HTMLElement[]];
    expect(botoes).toHaveLength(10);
    expect(botoes[0].getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(botoes[0]);
    expect(botoes[0].getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(botoes[1]);
    expect(botoes[0].getAttribute("aria-expanded")).toBe("false");
    expect(botoes[1].getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(botoes[1]);
    expect(botoes[1].getAttribute("aria-expanded")).toBe("false");
  });
});

describe("Header", () => {
  it("abre o menu móvel e fecha com Escape", () => {
    render(<Header />);
    const toggle = screen.getByRole("button", { name: /abrir menu/i });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });
});

describe("Investimento", () => {
  it("mostra exatamente os valores informados", () => {
    expect(pricing.projectBRL).toBe(13000);
    expect(pricing.monthlyBRL).toBe(300);
    expect(formatPrice(13000)).toMatch(/^R\$ 13\.000$/);
    expect(formatPrice(300)).toMatch(/^R\$ 300$/);
    render(<Investment />);
    expect(screen.getByTestId("price-project").textContent).toMatch(/13\.000/);
    expect(screen.getByTestId("price-monthly").textContent).toMatch(/300.*mês/);
  });
});

describe("Página de apresentação (sem cadastro)", () => {
  it("não tem formulário de contato nem botões de venda", () => {
    const { container } = render(<App />);
    expect(container.querySelector("#contato")).toBeNull();
    expect(container.querySelector('form[aria-label="Solicitar contato"]')).toBeNull();
    expect(container.querySelector('input[type="email"]')).toBeNull();
    const text = (container.textContent ?? "").toLowerCase();
    for (const banned of ["solicitar contato", "solicitar avaliação", "solicitar um projeto-piloto", "não há preços", "política de privacidade"]) {
      expect(text).not.toContain(banned);
    }
  });

  it("todos os links internos apontam para uma seção que existe", () => {
    const { container } = render(<App />);
    const hrefs = [...container.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')].map((a) => a.getAttribute("href")!);
    const ids = new Set(["topo", ...[...container.querySelectorAll("[id]")].map((e) => e.id)]);
    for (const h of hrefs) expect(ids.has(h.slice(1)), `âncora ${h}`).toBe(true);
  });
});

describe("ProductDemo", () => {
  const tab = (name: RegExp) => screen.getByRole("tab", { name });

  it("tem três etapas e a navegação troca o conteúdo", () => {
    render(<ProductDemo />);
    expect(screen.getAllByRole("tab")).toHaveLength(3);
    expect(tab(/01/).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("Todos os desenhos do projeto em um só lugar.")).toBeTruthy();
    expect(screen.getByRole("table", { name: /Documentos do projeto/ })).toBeTruthy();

    fireEvent.click(tab(/03/));
    expect(tab(/03/).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("table", { name: /Lista de materiais/ })).toBeTruthy();
    expect(screen.queryByRole("table", { name: /Documentos do projeto/ })).toBeNull();
  });

  it("teclado: setas, Home e End movem a seleção", () => {
    render(<ProductDemo />);
    fireEvent.keyDown(tab(/01/), { key: "ArrowRight" });
    expect(tab(/02/).getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(tab(/02/), { key: "End" });
    expect(tab(/03/).getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(tab(/03/), { key: "Home" });
    expect(tab(/01/).getAttribute("aria-selected")).toBe("true");
  });

  it("etapa 1: indicadores coerentes com a tabela e seleção por linha", () => {
    const { container } = render(<ProductDemo />);
    expect(container.querySelectorAll(".pd-table--docs tbody tr")).toHaveLength(8);
    const kpis = [...container.querySelectorAll(".pd-kpis li")].map((li) => li.textContent);
    expect(kpis).toEqual(["8 desenhos cadastrados", "6 processados", "1 aguardando revisão", "1 na fila"]);
    fireEvent.click(screen.getByRole("button", { name: "PC-103.pdf" }));
    expect(screen.getByText(/Documento selecionado:/).textContent).toContain("PC-103.pdf");
  });

  it("etapa 2 sem PDF de exemplo avisa em vez de inventar campos", () => {
    render(<ProductDemo />);
    fireEvent.click(screen.getByRole("button", { name: "PC-101.pdf" }));
    fireEvent.click(screen.getByRole("button", { name: "Abrir prévia e campos" }));
    expect(screen.getByText(/Sem prévia para PC-101.pdf/)).toBeTruthy();
    expect(screen.queryByText("Campos identificados em", { exact: false })).toBeNull();
  });

  it("etapa 2: o EG-001 mostra campos próprios, incluindo os não identificados", () => {
    render(<ProductDemo />);
    fireEvent.click(screen.getByRole("button", { name: "EG-001.pdf" }));
    fireEvent.click(screen.getByRole("button", { name: "Abrir prévia e campos" }));
    expect(screen.getByText("Campos identificados em EG-001.pdf")).toBeTruthy();
    expect(screen.getByText("Aço carbono SAE 1045")).toBeTruthy();
    expect(screen.getAllByText("Não identificado", { selector: ".pd-state" })).toHaveLength(2); // peso e quantidade
    expect(screen.getByText(/Diferente do projeto aberto/)).toBeTruthy();
  });

  it("etapa 3: busca, filtro por estado e recolher conjunto", () => {
    const { container } = render(<ProductDemo />);
    fireEvent.click(tab(/03/));
    const body = () => container.querySelectorAll(".pd-table--bom tbody tr");
    expect(body()).toHaveLength(5);

    fireEvent.click(screen.getByRole("button", { name: "Recolher CJ-001" }));
    expect(body()).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Expandir CJ-001" }));
    expect(body()).toHaveLength(5);

    fireEvent.change(screen.getByLabelText("Pesquisar por código ou descrição"), { target: { value: "tampa" } });
    expect(body()).toHaveLength(2); // conjunto-pai + PC-103
    fireEvent.change(screen.getByLabelText("Pesquisar por código ou descrição"), { target: { value: "" } });

    fireEvent.click(screen.getByRole("button", { name: /^Não identificado/ }));
    expect(screen.getByText(/Nenhum item corresponde/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Conferir/ }));
    expect(body()).toHaveLength(2);
  });

  it("etapa 3: estados sempre com texto, pendências e total parcial", () => {
    const { container } = render(<ProductDemo />);
    fireEvent.click(tab(/03/));
    const states = [...container.querySelectorAll(".pd-table--bom .pd-state")].map((e) => e.textContent);
    expect(states).toEqual(["Conferir", "Validado", "Validado", "Conferir", "Validado"]);
    expect(screen.getByText("Pendências (2)")).toBeTruthy();
    expect(container.textContent).toContain("65,70 kg");
    expect(container.textContent).toContain("não identificado");
  });

  it("etapa 3: exportação gera arquivo no navegador", () => {
    const create = vi.fn(() => "blob:demo");
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    render(<ProductDemo />);
    fireEvent.click(tab(/03/));
    fireEvent.click(screen.getByRole("button", { name: /Exportar CSV/ }));
    fireEvent.click(screen.getByRole("button", { name: /Exportar XLSX/ }));
    expect(create).toHaveBeenCalledTimes(2);
    expect(screen.getByText(/MECABOM-BOM-demonstrativa\.xlsx gerado/)).toBeTruthy();
  });

  it("chamada final aponta para uma âncora existente", () => {
    render(<ProductDemo />);
    expect(screen.getByRole("link", { name: "Solicitar demonstração" }).getAttribute("href")).toBe("#orcamento");
  });
});
