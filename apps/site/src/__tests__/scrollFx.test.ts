import { afterEach, describe, expect, it, vi } from "vitest";
import { countValue } from "../lib/countUp";
import { initScrollFx } from "../lib/scrollFx";

type Cb = (entries: { target: Element; isIntersecting: boolean }[]) => void;

function fakeWindow(motion: boolean, withIO = true) {
  const observed: Element[] = [];
  let cb: Cb = () => undefined;
  class IO {
    constructor(c: Cb) {
      cb = c;
    }
    observe(el: Element) {
      observed.push(el);
    }
    unobserve() {}
    disconnect() {}
  }
  const win = {
    ...(withIO ? { IntersectionObserver: IO } : {}),
    matchMedia: () => ({ matches: motion }),
    scrollY: 0,
    innerHeight: 800,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => undefined,
  } as unknown as Window & typeof globalThis;
  return { win, observed, fire: (el: Element) => cb([{ target: el, isIntersecting: true }]) };
}

const page = () => {
  document.body.innerHTML = `
    <section class="section hero" id="topo"><h1>x</h1><div class="gain">no topo</div></section>
    <section class="section"><div class="section-head"><h2 class="h2">A</h2><p class="lead">b</p></div>
      <ul class="gains"><li class="gain">1</li><li class="gain">2</li><li class="gain">3</li></ul></section>
    <ol class="steps"><li class="gain">passo</li></ol>`;
};
afterEach(() => {
  document.body.innerHTML = "";
  document.documentElement.className = "";
  vi.restoreAllMocks();
});

describe("initScrollFx", () => {
  it("com movimento reduzido não toca na página", () => {
    page();
    const { win, observed } = fakeWindow(false);
    initScrollFx(document, win);
    expect(document.documentElement.classList.contains("fx")).toBe(false);
    expect(document.querySelector("[data-reveal]")).toBeNull();
    expect(observed).toHaveLength(0);
  });

  it("sem IntersectionObserver não esconde nada", () => {
    page();
    const { win } = fakeWindow(true, false);
    initScrollFx(document, win);
    expect(document.querySelector("[data-reveal]")).toBeNull();
  });

  it("marca os elementos, escalona atrasos e revela ao entrar na tela", () => {
    page();
    const { win, observed, fire } = fakeWindow(true);
    const stop = initScrollFx(document, win);
    expect(document.documentElement.classList.contains("fx")).toBe(true);
    const cards = [...document.querySelectorAll<HTMLElement>(".gains .gain")];
    expect(cards.map((c) => c.dataset.reveal)).toEqual(["up", "up", "up"]);
    expect(cards.map((c) => c.style.getPropertyValue("--d"))).toEqual(["0ms", "90ms", "180ms"]);
    // O topo e "Como funciona" têm animação própria e ficam de fora.
    expect(document.querySelector("#topo .gain")?.hasAttribute("data-reveal")).toBe(false);
    expect(document.querySelector(".steps .gain")?.hasAttribute("data-reveal")).toBe(false);
    expect(observed).toContain(cards[0]);
    fire(cards[0]!);
    expect(cards[0]!.classList.contains("is-in")).toBe(true);
    expect(cards[1]!.classList.contains("is-in")).toBe(false);
    stop();
    expect(document.documentElement.classList.contains("fx")).toBe(false);
    expect(document.querySelector("[data-reveal]")).toBeNull();
  });
});

describe("countValue", () => {
  it("começa em 0, é crescente e termina exatamente no valor", () => {
    expect(countValue(13000, 0)).toBe(0);
    expect(countValue(13000, 1)).toBe(13000);
    expect(countValue(13000, 2)).toBe(13000);
    expect(countValue(13000, -1)).toBe(0);
    let prev = -1;
    for (let p = 0; p <= 1; p += 0.1) {
      const v = countValue(13000, p);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
});
