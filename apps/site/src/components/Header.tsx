import { useEffect, useRef, useState } from "react";
import { anchors, brand, navLinks } from "../config/brand";
import { Icon } from "./Icon";

export function Logo() {
  return (
    <a className="logo" href="#topo" aria-label={`${brand.name} — início`}>
      <svg width="30" height="30" viewBox="0 0 64 64" aria-hidden="true">
        <rect width="64" height="64" rx="10" fill="#fff" />
        <path d="M14 46V18h6l12 17 12-17h6v28h-6V28L32 44 20 28v18z" fill="#162c3b" />
        <rect x="14" y="50" width="36" height="3" fill="#f5222d" />
      </svg>
      <span>{brand.name}</span>
    </a>
  );
}

export function Header() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled(y > 8);
      // Esconde ao descer (mais espaço para ler) e volta ao subir; nunca com o menu aberto.
      if (openRef.current || y < 240) setHidden(false);
      else if (y - last > 6) setHidden(true);
      else if (last - y > 6) setHidden(false);
      last = y;
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Destaca no menu a seção que está na tela.
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const els = navLinks.map((l) => document.getElementById(l.href.slice(1))).filter((e): e is HTMLElement => e !== null);
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id);
      },
      { rootMargin: "-40% 0px -55% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const close = () => setOpen(false);

  return (
    <header className={`site-header on-dark${scrolled ? " is-scrolled" : ""}${hidden ? " is-hidden" : ""}`}>
      <div className="wrap site-header__bar">
        <Logo />
        <nav className="site-nav" aria-label="Principal">
          <ul>
            {navLinks.map((l) => (
              <li key={l.href}>
                <a href={l.href} aria-current={active === l.href.slice(1) ? "true" : undefined}>{l.label}</a>
              </li>
            ))}
          </ul>
        </nav>
        <a className="btn btn--primary site-header__cta" href={anchors.budget}>
          Ver orçamento
        </a>
        <button
          ref={buttonRef}
          type="button"
          className="menu-toggle"
          aria-expanded={open}
          aria-controls="menu-mobile"
          onClick={() => setOpen((v) => !v)}
        >
          <Icon name={open ? "close" : "menu"} />
          <span className="visually-hidden">{open ? "Fechar menu" : "Abrir menu"}</span>
        </button>
      </div>
      <div id="menu-mobile" className="mobile-menu" hidden={!open}>
        <nav aria-label="Principal (celular)">
          <ul>
            {navLinks.map((l) => (
              <li key={l.href}>
                <a href={l.href} onClick={close}>
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
          <a className="btn btn--primary" href={anchors.budget} onClick={close}>
            Ver orçamento
          </a>
        </nav>
      </div>
    </header>
  );
}
