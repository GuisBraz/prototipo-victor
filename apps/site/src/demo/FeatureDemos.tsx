import { useMemo, useState, type ReactNode } from "react";
import { demoProject, type FieldState } from "./data";
import { StateTag } from "./DashboardMockup";

/** Mini-demonstrações (dados ilustrativos) usadas na seção de funcionalidades. */

const projects = [
  { code: "DEMO-01", name: "Transportador de correia (exemplo)", docs: 5 },
  { code: "DEMO-02", name: "Estrutura de apoio (exemplo)", docs: 3 },
  { code: "DEMO-03", name: "Conjunto de acionamento (exemplo)", docs: 8 },
];

export function ProjectsDemo() {
  const [q, setQ] = useState("");
  const list = projects.filter((p) => `${p.code} ${p.name}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="fd">
      <label className="fd__search">
        <span className="visually-hidden">Buscar projeto</span>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar projeto por código ou nome" />
      </label>
      <ul className="fd__list" aria-live="polite">
        {list.map((p) => (
          <li key={p.code}>
            <span className="mono">{p.code}</span>
            <span>{p.name}</span>
            <span className="fd__meta">{p.docs} documentos</span>
          </li>
        ))}
        {list.length === 0 && <li className="fd__empty">Nenhum projeto encontrado. Ajuste a busca.</li>}
      </ul>
    </div>
  );
}

const readFields: { label: string; raw: string; state: FieldState }[] = [
  { label: "Número do desenho", raw: "DEMO-1200", state: "validated" },
  { label: "Revisão", raw: "C", state: "validated" },
  { label: "Descrição", raw: "TAMBOR DE ACIONAMENTO", state: "validated" },
  { label: "Material", raw: "AÇO CARBONO", state: "check" },
  { label: "Peso", raw: "—", state: "missing" },
];

export function ReadingDemo() {
  return (
    <div className="fd">
      <dl className="fd__fields">
        {readFields.map((f) => (
          <div key={f.label}>
            <dt>{f.label}</dt>
            <dd><span className="mono">{f.raw}</span> <StateTag state={f.state} /></dd>
          </div>
        ))}
      </dl>
      <p className="note">Valor bruto, exatamente como aparece no documento. Se não consta, o campo fica como não identificado.</p>
    </div>
  );
}

const catalog = [
  { no: "DEMO-1000", desc: "Conjunto do transportador", rev: "B", mat: "—" },
  { no: "DEMO-1110", desc: "Suporte do rolete", rev: "A", mat: "Aço carbono" },
  { no: "DEMO-1200", desc: "Tambor de acionamento", rev: "C", mat: "Aço carbono" },
  { no: "DEMO-1210", desc: "Eixo do tambor", rev: "A", mat: "Não identificado" },
];

export function CatalogDemo() {
  const [q, setQ] = useState("");
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return catalog.filter((r) => `${r.no} ${r.desc} ${r.rev} ${r.mat}`.toLowerCase().includes(t));
  }, [q]);
  return (
    <div className="fd">
      <label className="fd__search">
        <span className="visually-hidden">Pesquisar no catálogo</span>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pesquisar por número, descrição, revisão ou material" />
      </label>
      <table className="fd__table" aria-live="polite">
        <thead><tr><th scope="col">Desenho</th><th scope="col">Rev.</th><th scope="col">Material</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.no}><td><span className="mono">{r.no}</span><span className="sub">{r.desc}</span></td><td>{r.rev}</td><td>{r.mat}</td></tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={3} className="fd__empty">Nenhum desenho encontrado.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

interface TreeNode { id: string; label: string; qty: string; children?: TreeNode[] }
const tree: TreeNode = {
  id: "a", label: "DEMO-1000 · Conjunto do transportador", qty: "1",
  children: [
    { id: "b", label: "DEMO-1200 · Tambor de acionamento", qty: "1", children: [{ id: "c", label: "DEMO-1210 · Eixo do tambor", qty: "1" }] },
    { id: "d", label: "DEMO-1110 · Suporte do rolete", qty: "Conferir" },
  ],
};

function TreeRow({ node, depth }: { node: TreeNode; depth: number }) {
  const [open, setOpen] = useState(true);
  const has = Boolean(node.children?.length);
  return (
    <li>
      <div className="fd__tree-row" style={{ paddingLeft: depth * 18 }}>
        {has ? (
          <button type="button" className="fd__toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            <span className="visually-hidden">{open ? "Recolher" : "Expandir"} {node.label}</span>
            <span aria-hidden="true">{open ? "−" : "+"}</span>
          </button>
        ) : <span className="fd__toggle fd__toggle--leaf" aria-hidden="true" />}
        <span>{node.label}</span>
        <span className="fd__meta">Qtd. {node.qty}</span>
      </div>
      {has && open && <ul>{node.children!.map((c) => <TreeRow key={c.id} node={c} depth={depth + 1} />)}</ul>}
    </li>
  );
}

export function HierarchicalDemo() {
  return <div className="fd"><ul className="fd__tree"><TreeRow node={tree} depth={0} /></ul><p className="note">Expanda e recolha os níveis da estrutura.</p></div>;
}

const consolidated: { item: string; perParent: number | null; parents: number; note?: string }[] = [
  { item: "Eixo do tambor", perParent: 1, parents: 2 },
  { item: "Mancal", perParent: 2, parents: 2 },
  { item: "Parafuso de fixação", perParent: null, parents: 2, note: "Quantidade não consta nos desenhos" },
];

export function ConsolidatedDemo() {
  return (
    <div className="fd">
      <table className="fd__table">
        <thead><tr><th scope="col">Componente</th><th scope="col">Qtd. por conjunto</th><th scope="col">Qtd. total</th></tr></thead>
        <tbody>
          {consolidated.map((r) => (
            <tr key={r.item}>
              <td>{r.item}</td>
              <td>{r.perParent ?? "—"}</td>
              <td>{r.perParent === null ? <span className="tag tag--check">Dados insuficientes</span> : r.perParent * r.parents}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="note">O total é calculado por regra, não pela IA. Sem quantidade, o total fica pendente: nunca vira zero.</p>
    </div>
  );
}

export function RevisionsDemo() {
  return (
    <div className="fd">
      <div className="fd__cols">
        <section aria-label="Revisão A"><h4>Revisão A</h4><ul><li>Material: Aço carbono</li><li>Descrição: Suporte do rolete</li><li>Referências: 2</li></ul></section>
        <section aria-label="Revisão B"><h4>Revisão B</h4><ul><li className="diff">Material: Não identificado</li><li>Descrição: Suporte do rolete</li><li className="diff">Referências: 3</li></ul></section>
      </div>
      <p className="note"><StateTag state="check" /> As duas revisões ficam registradas; a diferença é sinalizada e nada é sobrescrito.</p>
    </div>
  );
}

export function AssistedDemo() {
  return (
    <div className="fd fd__assisted">
      <div className="fd__page" role="img" aria-label="Página do documento de origem com a legenda destacada">
        <span className="fd__page-line" /><span className="fd__page-line" /><span className="fd__page-line short" />
        <span className="fd__page-hl">Legenda · pág. 1</span>
      </div>
      <ul className="fd__list">
        <li><span>Material</span><StateTag state="check" /></li>
        <li><span>Peso</span><StateTag state="missing" /></li>
      </ul>
    </div>
  );
}

export function HistoryDemo() {
  const events = [
    "Campo “Material” corrigido por revisor, com justificativa registrada",
    "Documento reprocessado: novo resultado associado ao mesmo registro",
    "Versão 2 da BOM aprovada. Versões aprovadas não são alteradas",
  ];
  return (
    <div className="fd">
      <ol className="fd__timeline">{events.map((e) => <li key={e}>{e}</li>)}</ol>
      <p className="note">Eventos ilustrativos do registro de auditoria planejado.</p>
    </div>
  );
}

export function ExportDemo() {
  return (
    <div className="fd">
      <p className="fd__files">
        <span className="fd__file">bom_{demoProject.code.toLowerCase()}.xlsx</span>
        <span className="fd__file">bom_{demoProject.code.toLowerCase()}.csv</span>
      </p>
      <pre className="fd__code" tabIndex={0}>{`nivel;desenho;revisao;descricao;qtd;situacao
0;DEMO-1000;B;Conjunto do transportador;1;validado
1;DEMO-1200;C;Tambor de acionamento;1;validado
2;DEMO-1210;A;Eixo do tambor;1;material pendente`}</pre>
      <p className="note">Exemplo da estrutura de saída, após validação e aprovação.</p>
    </div>
  );
}

export const featureDemos: { id: string; title: string; text: string; icon: string; demo: ReactNode }[] = [
  { id: "projetos", title: "Gestão de projetos", icon: "folder", text: "Projetos independentes, documentos centralizados, pesquisa e organização.", demo: <ProjectsDemo /> },
  { id: "leitura", title: "Leitura técnica", icon: "scan", text: "Extração estruturada de dados de desenhos mecânicos.", demo: <ReadingDemo /> },
  { id: "catalogo", title: "Catálogo de desenhos", icon: "search", text: "Pesquisa por número, descrição, revisão, material e outros campos identificados.", demo: <CatalogDemo /> },
  { id: "hierarquica", title: "BOM hierárquica", icon: "tree", text: "Visualização de conjuntos, subconjuntos e componentes com expansão dos níveis.", demo: <HierarchicalDemo /> },
  { id: "consolidada", title: "BOM consolidada", icon: "table", text: "Consolidação de componentes e quantidades quando as relações e os dados forem suficientes.", demo: <ConsolidatedDemo /> },
  { id: "revisoes", title: "Controle de revisões", icon: "compare", text: "Identificação de possíveis diferenças entre versões e sinalização de documentos divergentes.", demo: <RevisionsDemo /> },
  { id: "validacao", title: "Validação assistida", icon: "eye", text: "Visualização do documento original junto dos dados extraídos.", demo: <AssistedDemo /> },
  { id: "historico", title: "Histórico e aprovações", icon: "history", text: "Rastreabilidade de correções, reprocessamentos e versões aprovadas.", demo: <HistoryDemo /> },
  { id: "exportacao", title: "Exportação", icon: "download", text: "Geração de arquivos Excel e CSV com estrutura organizada.", demo: <ExportDemo /> },
];
