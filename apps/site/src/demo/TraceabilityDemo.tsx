import { useState } from "react";
import { fieldStateLabel, type FieldState } from "./data";
import { StateTag } from "./DashboardMockup";

interface Region { x: number; y: number; w: number; h: number }
interface Field {
  id: string;
  label: string;
  value: string;
  state: FieldState;
  region: Region | null;
  origin: string;
  hint: string;
}

const fields: Field[] = [
  { id: "numero", label: "Número do desenho", value: "DEMO-1200", state: "validated", region: { x: 150, y: 190, w: 170, h: 28 }, origin: "Página 1 · legenda, campo “Desenho”", hint: "Valor lido exatamente como aparece no documento." },
  { id: "revisao", label: "Revisão", value: "C", state: "validated", region: { x: 320, y: 190, w: 86, h: 28 }, origin: "Página 1 · legenda, campo “Rev.”", hint: "Revisão encontrada na legenda." },
  { id: "descricao", label: "Descrição", value: "Tambor de acionamento", state: "validated", region: { x: 150, y: 218, w: 256, h: 28 }, origin: "Página 1 · legenda, campo “Descrição”", hint: "Texto idêntico ao do documento." },
  { id: "material", label: "Material", value: "Aço carbono", state: "check", region: { x: 150, y: 246, w: 170, h: 30 }, origin: "Página 1 · legenda, campo “Material”", hint: "A norma do material não está indicada. Confira no desenho e confirme ou corrija." },
  { id: "peso", label: "Peso", value: "—", state: "missing", region: { x: 320, y: 246, w: 86, h: 30 }, origin: "Nenhum valor encontrado na legenda", hint: "O campo está vazio no documento. Ele fica como não identificado, sem preenchimento automático." },
  { id: "quantidade", label: "Quantidade", value: "1", state: "check", region: { x: 230, y: 56, w: 176, h: 20 }, origin: "Página 1 · tabela de componentes, linha 1", hint: "Quantidade lida da tabela. Confirme se vale por conjunto ou para o projeto." },
];

function Sheet({ region }: { region: Region | null }) {
  return (
    <svg className="sheet" viewBox="0 0 420 290" role="img" aria-label="Página ilustrativa de um desenho mecânico com tabela de componentes e legenda. A região de origem do campo selecionado aparece destacada.">
      <rect x="6" y="6" width="408" height="278" className="sheet__border" />
      {/* peça esquemática */}
      <g className="sheet__part">
        <rect x="26" y="40" width="170" height="86" />
        <path d="M26 83h170M60 40v86M162 40v86" />
        <circle cx="111" cy="83" r="22" />
        <path d="M12 83h208" className="sheet__center" />
      </g>
      {/* tabela de componentes */}
      <g className="sheet__table">
        <rect x="230" y="30" width="176" height="96" />
        <path d="M230 56h176M230 76h176M230 96h176M256 30v96M366 30v96" />
        <text x="236" y="46">It.</text><text x="262" y="46">Descrição</text><text x="372" y="46">Qtd.</text>
        <text x="238" y="70">1</text><text x="262" y="70">Eixo</text><text x="378" y="70">1</text>
        <text x="238" y="90">2</text><text x="262" y="90">Mancal</text><text x="378" y="90">2</text>
        <text x="238" y="110">3</text><text x="262" y="110">Parafuso</text><text x="378" y="110">—</text>
      </g>
      {/* legenda */}
      <g className="sheet__title">
        <rect x="150" y="190" width="256" height="86" />
        <path d="M150 218h256M150 246h256M320 190v28M320 246v30" />
        <text x="154" y="198" className="lbl">DESENHO</text><text x="154" y="212" className="val">DEMO-1200</text>
        <text x="324" y="198" className="lbl">REV.</text><text x="324" y="212" className="val">C</text>
        <text x="154" y="226" className="lbl">DESCRIÇÃO</text><text x="154" y="240" className="val">TAMBOR DE ACIONAMENTO</text>
        <text x="154" y="254" className="lbl">MATERIAL</text><text x="154" y="268" className="val">AÇO CARBONO</text>
        <text x="324" y="254" className="lbl">PESO</text>
      </g>
      {region && <rect className="sheet__hl" x={region.x - 2} y={region.y - 2} width={region.w + 4} height={region.h + 4} rx="2" />}
    </svg>
  );
}

export function TraceabilityDemo() {
  const [selected, setSelected] = useState("material");
  const field = fields.find((f) => f.id === selected) ?? fields[0]!;

  return (
    <div className="trace">
      <figure className="trace__doc">
        <div className="trace__bar">
          <span>Documento de origem</span>
          <span className="demo-chip">Ilustração, não é um desenho real</span>
        </div>
        <Sheet region={field.region} />
        <figcaption className="trace__page">Página 1 de 1 · região consultada: {field.region ? field.origin.replace("Página 1 · ", "") : "nenhuma"}</figcaption>
      </figure>

      <div className="trace__data">
        <ul className="trace__fields" aria-label="Campos extraídos">
          {fields.map((f) => (
            <li key={f.id}>
              <button type="button" aria-pressed={f.id === selected} onClick={() => setSelected(f.id)}>
                <span className="trace__label">{f.label}</span>
                <span className="trace__value">{f.value}</span>
                <StateTag state={f.state} />
              </button>
            </li>
          ))}
        </ul>
        <div className={`trace__detail trace__detail--${field.state}`} aria-live="polite">
          <h3>{field.label}: {fieldStateLabel[field.state].toLowerCase()}</h3>
          <p><strong>Origem:</strong> {field.origin}</p>
          <p>{field.hint}</p>
        </div>
      </div>
    </div>
  );
}
