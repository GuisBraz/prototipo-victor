/**
 * Animações de rolagem: revelação dos elementos ao entrar na tela, progresso de leitura e
 * paralaxe leve no topo. Só liga quando o navegador suporta IntersectionObserver e a pessoa
 * NÃO pediu menos movimento; sem isso a página fica estática e totalmente visível.
 */

type Variant = "up" | "left" | "scale";

/** Quais elementos entram com qual efeito. O topo (hero) e "Como funciona" têm animação própria. */
export const REVEAL_PLAN: { selector: string; variant: Variant }[] = [
  { selector: ".section:not(.hero) .h2, .section:not(.hero) .section-head > .lead, .split__lead > .lead, .split__lead > .factors", variant: "up" },
  { selector: ".ruled-grid li, .pillars li, .gain, .gains__statement, .checklist li, .distinct > div, .measure__h", variant: "up" },
  { selector: ".price, .offer, .faq__item, .final__title, .final .lead, .final__actions", variant: "up" },
  { selector: ".spec > div, .spec__note", variant: "left" },
  { selector: ".c2o, .features, .trace, .pd-steps, .pd-panel, .pd-cta, .trace__support", variant: "scale" },
];

export function motionAllowed(win: Window = window): boolean {
  return typeof win.matchMedia === "function" && win.matchMedia("(prefers-reduced-motion: no-preference)").matches;
}

type FxWindow = Window & typeof globalThis;

export function initScrollFx(doc: Document = document, win: FxWindow = window as FxWindow): () => void {
  if (typeof win.IntersectionObserver === "undefined" || !motionAllowed(win)) return () => undefined;

  const root = doc.documentElement;
  root.classList.add("fx");

  const io = new win.IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add("is-in");
        io.unobserve(e.target);
      }
    },
    { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
  );

  const marked = new Set<Element>();
  for (const { selector, variant } of REVEAL_PLAN) {
    const perParent = new Map<Element, number>();
    doc.querySelectorAll<HTMLElement>(selector).forEach((el) => {
      if (marked.has(el) || el.closest(".hero, .steps")) return;
      marked.add(el);
      const parent = el.parentElement ?? root;
      const i = perParent.get(parent) ?? 0;
      perParent.set(parent, i + 1);
      el.dataset.reveal = variant;
      el.style.setProperty("--d", `${Math.min(i, 5) * 90}ms`);
      io.observe(el);
    });
  }

  // Progresso de leitura e paralaxe do topo, atualizados no máximo uma vez por quadro.
  let frame = 0;
  const update = () => {
    frame = 0;
    const max = Math.max(1, root.scrollHeight - win.innerHeight);
    root.style.setProperty("--read", String(Math.min(1, Math.max(0, win.scrollY / max))));
    const hero = doc.getElementById("topo");
    const h = hero ? hero.offsetHeight : 1;
    root.style.setProperty("--hero-p", String(Math.min(1, Math.max(0, win.scrollY / h))));
  };
  const onScroll = () => {
    if (!frame) frame = win.requestAnimationFrame(update);
  };
  update();
  win.addEventListener("scroll", onScroll, { passive: true });
  win.addEventListener("resize", onScroll);

  return () => {
    io.disconnect();
    win.removeEventListener("scroll", onScroll);
    win.removeEventListener("resize", onScroll);
    if (frame) win.cancelAnimationFrame(frame);
    root.classList.remove("fx");
    marked.forEach((el) => {
      el.classList.remove("is-in");
      delete (el as HTMLElement).dataset.reveal;
      (el as HTMLElement).style.removeProperty("--d");
    });
  };
}
