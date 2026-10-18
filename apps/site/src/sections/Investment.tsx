import { useEffect, useRef } from "react";
import { pricing } from "../config/brand";
import { countValue } from "../lib/countUp";
import { motionAllowed } from "../lib/scrollFx";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export function formatPrice(value: number): string {
  return brl.format(value).replace(/\s/g, " ");
}

/**
 * Mostra o valor final para leitores de tela e, para quem vê, conta de 0 até o valor quando entra na tela.
 * Sem animação (movimento reduzido ou sem IntersectionObserver) o valor final aparece direto.
 */
function Price({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined" || !motionAllowed()) return;
    el.textContent = formatPrice(0);
    let raf = 0;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        const start = performance.now();
        const tick = (now: number) => {
          const p = (now - start) / 1400;
          el.textContent = formatPrice(countValue(value, p));
          if (p < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.6 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
      el.textContent = formatPrice(value);
    };
  }, [value]);

  return (
    <>
      <span ref={ref} aria-hidden="true">{formatPrice(value)}</span>
      <span className="visually-hidden">{formatPrice(value)}</span>
    </>
  );
}

export function Investment() {
  return (
    <section id="orcamento" className="section section--white" aria-labelledby="inv-titulo">
      <div className="wrap split">
        <div className="split__lead">
          <h2 id="inv-titulo" className="h2">Orçamento.</h2>
          <p className="lead">
            Valor da venda do projeto. Depois do pagamento, a plataforma passa a ter uma mensalidade.
          </p>
        </div>
        <div className="prices">
          <div className="price" data-testid="price-project">
            <h3>Venda do projeto</h3>
            <p className="price__value"><Price value={pricing.projectBRL} /></p>
            <p className="price__when">Valor único</p>
          </div>
          <div className="price price--monthly" data-testid="price-monthly">
            <h3>Mensalidade</h3>
            <p className="price__value">
              <Price value={pricing.monthlyBRL} />
              <span className="price__unit"> / mês</span>
            </p>
            <p className="price__when">Após o pagamento do projeto</p>
          </div>
        </div>
      </div>
    </section>
  );
}
