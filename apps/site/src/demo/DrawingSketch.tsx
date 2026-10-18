import { demoBom } from "./data";

interface Props {
  active: number | null;
  onActive: (balloon: number | null) => void;
}

/**
 * Desenho esquemático ORIGINAL (rolo sobre mancais), criado para ilustrar a
 * ligação entre o desenho e a BOM. Não reproduz nenhum desenho real.
 */
export function DrawingSketch({ active, onActive }: Props) {
  const part = (n: number) => `sk-part${active === n ? " is-active" : ""}`;
  const balloon = (n: number, cx: number, cy: number, tx: number, ty: number) => {
    const row = demoBom.find((r) => r.balloon === n);
    return (
      <g
        key={n}
        className={`sk-balloon${active === n ? " is-active" : ""}`}
        role="button"
        tabIndex={0}
        aria-label={`Item ${n}: ${row?.description ?? ""}`}
        onMouseEnter={() => onActive(n)}
        onMouseLeave={() => onActive(null)}
        onFocus={() => onActive(n)}
        onBlur={() => onActive(null)}
      >
        <line x1={cx} y1={cy} x2={tx} y2={ty} className="sk-leader" />
        <circle cx={cx} cy={cy} r="11" />
        <text x={cx} y={cy + 4} textAnchor="middle">
          {n}
        </text>
      </g>
    );
  };

  return (
    <svg className="sketch" viewBox="0 0 300 212" role="img" aria-label="Desenho esquemático ilustrativo de um conjunto com tambor, eixo, mancais e suporte, com balões numerados.">
      {/* linha de centro */}
      <line x1="14" y1="90" x2="286" y2="90" className="sk-center" />
      {/* estrutura / suporte */}
      <g className={part(4)}>
        <rect x="24" y="150" width="252" height="10" />
        <rect x="44" y="118" width="14" height="32" />
        <rect x="242" y="118" width="14" height="32" />
      </g>
      {/* eixo */}
      <g className={part(3)}>
        <path d="M30 80h40M30 100h40M230 80h40M230 100h40M30 80v20M270 80v20" />
      </g>
      {/* mancais */}
      <g className="sk-part">
        <rect x="36" y="62" width="30" height="56" rx="2" />
        <rect x="234" y="62" width="30" height="56" rx="2" />
        <circle cx="51" cy="90" r="6" />
        <circle cx="249" cy="90" r="6" />
      </g>
      {/* tambor */}
      <g className={part(2)}>
        <rect x="70" y="55" width="160" height="70" />
        <path d="M82 55v70M218 55v70" />
        <path d="M70 75h160M70 105h160" className="sk-thin" />
      </g>
      {/* cota (sem valores: ilustrativo) */}
      <g className="sk-dim">
        <path d="M70 178h160M70 172v12M230 172v12" />
        <path d="m70 178 7-3v6zM230 178l-7-3v6z" />
      </g>
      {/* conjunto (item 1): contorno geral */}
      <g className={part(1)}>
        <path d="M18 56h264v112H18z" className="sk-envelope" />
      </g>
      {balloon(2, 150, 22, 150, 55)}
      {balloon(3, 14, 38, 33, 82)}
      {balloon(4, 22, 196, 50, 150)}
      {balloon(1, 284, 36, 270, 56)}
    </svg>
  );
}
