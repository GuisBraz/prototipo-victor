/*
 * MECABOM Lite — leitura de desenhos (funções puras, sem DOM e sem rede).
 *
 * Entrada: itens de texto do pdf.js (ou palavras do OCR) de UMA página.
 * Saída: campos do carimbo (com evidência) e linhas da lista de materiais.
 *
 * Regra herdada do MECABOM: nada de dado inventado. Campo não encontrado
 * fica `null`, nunca zero ou texto chutado.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MBExtract = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ---------------------------------------------------------------- texto

  const stripAccents = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "");

  /** Normalização para comparar rótulos: maiúsculas, sem acento nem pontuação. */
  function normLabel(s) {
    return stripAccents(s)
      .toUpperCase()
      .replace(/[º°ª]/g, "O")
      .replace(/[^A-Z0-9]+/g, " ")
      .trim();
  }

  /** Limpeza do texto exibido: espaços e hifens quebrados ("17- 12- 2" → "17-12-2"). */
  function cleanText(s) {
    return String(s)
      .replace(/\s+/g, " ")
      .replace(/([A-Za-z0-9])- (?=[A-Za-z0-9])/g, "$1-")
      .trim();
  }

  /** Chave para comparar números de desenho: só letras e dígitos. */
  const codeKey = (s) => stripAccents(s).toUpperCase().replace(/[^A-Z0-9]/g, "");

  /** Converte "1.234,5", "6,14", "0.33", "7,5 kg" em número. Retorna null se não for número. */
  function parseNum(raw) {
    if (raw == null) return null;
    let s = String(raw).replace(/\s|kg|KG|Kg/g, "");
    if (!/^-?\d[\d.,]*$/.test(s)) return null;
    const lastDot = s.lastIndexOf(".");
    const lastComma = s.lastIndexOf(",");
    if (lastDot >= 0 && lastComma >= 0) {
      const dec = lastDot > lastComma ? "." : ",";
      const thou = dec === "." ? "," : ".";
      s = s.split(thou).join("").replace(dec, ".");
    } else if (lastComma >= 0) {
      s = s.split(",").length > 2 ? s.split(",").join("") : s.replace(",", ".");
    } else if (/^\d{1,3}(\.\d{3}){2,}$/.test(s)) {
      s = s.split(".").join("");
    }
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  // ------------------------------------------------------- configuração

  /**
   * Campos pré-programados do carimbo. `syn` = rótulos aceitos (comparados
   * já normalizados). A ordem importa: sinônimos anteriores têm prioridade.
   */
  const DEFAULT_FIELDS = [
    {
      key: "drawing", label: "Nº do desenho", type: "code", preferLarge: true, enabled: true,
      syn: ["Nº do desenho", "N. do desenho", "Número do desenho", "Nº desenho", "Desenho nº", "Des. nº",
        "Drawing no", "Drawing number", "Dwg no", "Dwg number", "Numero disegno", "N. disegno", "Disegno n",
        "Plano nº", "Código do desenho", "Number", "Desenho"],
    },
    { key: "revision", label: "Revisão", type: "rev", enabled: true, syn: ["Revisão", "Rev", "Revision", "Revisione", "Rev nº"] },
    {
      key: "title", label: "Título / descrição", type: "text", collect: true, enabled: true,
      syn: ["Título", "Title", "Denominação", "Designação", "Titolo", "Denominazione", "Descrição", "Description"],
    },
    { key: "material", label: "Material", type: "text", enabled: true, syn: ["Material", "Materiale", "Mat", "Especificação do material"] },
    {
      key: "weight", label: "Peso (kg)", type: "num", enabled: true,
      syn: ["Peso total (kg)", "Peso total", "Peso (kg)", "Peso", "Peso líquido", "Massa", "Massa (kg)", "Weight (kg)", "Weight", "Mass", "Peso kg"],
    },
    { key: "qty", label: "Quantidade", type: "int", enabled: true, syn: ["Quantidade", "Qtd", "Qtde", "Quant", "Qty", "Quantity", "Q.tà"] },
    { key: "scale", label: "Escala", type: "scale", enabled: true, syn: ["Escala", "Scale", "Scala"] },
    { key: "project", label: "Cliente / projeto", type: "text", enabled: true, syn: ["Cliente", "Customer", "Client", "Project name", "Projeto", "Project", "Obra"] },
  ];

  /** Rótulos comuns de carimbo que nunca são valor (evita "Desenhista" virar título). */
  const EXTRA_LABELS = [
    "Data", "Date", "Desenhista", "Desenhado", "Drawn by", "Checked by", "Approved by", "Aprovado", "Aprovação", "Verificado",
    "Visto", "Projetista", "Controlador", "Folha", "Sheet", "Formato", "Format", "Nr of sheets", "Follow", "Tratamento",
    "Tratamento térmico", "Heat treatment", "Acabamento", "Coating", "Tolerância", "Rugosidade", "1º diedro", "3º diedro",
    "Revisions description", "Rev", "Area", "Job nr", "File nr", "Replaces", "Obtained from", "Supply class", "Casting code",
    "Pattern DB", "State of supply", "Family code", "Machine code", "Material 1", "Material 2", "Material 1 equivalent",
    "Unquoted radius", "Unquoted bevels", "Prec class", "Max welding class", "Shop number", "Página", "Page",
  ];

  /** Palavras de cabeçalho da lista de materiais, por categoria de coluna. */
  const HEADER_WORDS = {
    pos: ["ITEM", "POS", "POSICAO", "MARCA", "MARK", "PART NO", "PECA"],
    qty: ["QUANTIDADE", "QUANTITY", "QUANT", "QTDE", "QTD", "QTY", "QT", "Q TA", "PCS", "QUANTITA"],
    desc: ["DESCRICAO", "DESCRIPTION", "DENOMINACAO", "DESIGNATION", "DENOMINAZIONE", "DESCRIZIONE", "DESIGNACAO", "COMPONENTE"],
    material: ["MATERIAL", "MATERIALE", "MAT", "ESPECIFICACAO"],
    ref: ["REFERENCIA", "REFERENCE", "DESENHO", "DWG", "NORMA", "STANDARD", "CODIGO", "CODE", "DRAWING"],
    dim: ["DIMENSOES", "DIMENSAO", "DIMENSIONS", "DIMENSION", "BITOLA", "MEDIDAS"],
    wUnit: ["UNIT", "UNITARIO", "UNIT WEIGHT", "PESO UNIT", "UNITARIO KG"],
    wTotal: ["TOTAL", "PESO TOTAL", "TOTAL WEIGHT"],
    weight: ["PESO", "WEIGHT", "MASSA", "KG", "PESO KG"],
  };

  function compileFields(fields) {
    return fields
      .filter((f) => f.enabled !== false)
      .map((f) => ({ ...f, synN: [...new Set(f.syn.map(normLabel).filter(Boolean))] }));
  }

  // --------------------------------------------------- geometria / linhas

  /**
   * Converte itens do pdf.js para um "quadro" onde o texto principal da página
   * fica na horizontal (trata folhas giradas 90°). Retorna também a função que
   * leva coordenadas do quadro de volta ao espaço do PDF (para evidência).
   */
  function itemsFromPdf(textItems) {
    const all = [];
    for (const i of textItems) {
      if (!i.str || !i.str.trim()) continue;
      const [a, b, c, d, e, f] = i.transform;
      let ang = Math.round(Math.atan2(b, a) / (Math.PI / 2)) * 90;
      ang = ((ang % 360) + 360) % 360;
      all.push({ ang, e, f, w: i.width, h: Math.hypot(c, d) || Math.hypot(a, b), s: i.str });
    }
    const count = {};
    for (const i of all) count[i.ang] = (count[i.ang] || 0) + i.s.length;
    const entries = Object.entries(count).sort((x, y) => y[1] - x[1]);
    const angle = entries.length ? Number(entries[0][0]) : 0;
    const t = (angle * Math.PI) / 180;
    const cos = Math.cos(t);
    const sin = Math.sin(t);
    const items = all
      .filter((i) => i.ang === angle && i.h > 0.5)
      .map((i) => ({ s: i.s, x: i.e * cos + i.f * sin, y: -i.e * sin + i.f * cos, w: i.w, h: i.h }));
    const toPdf = (x, y) => [x * cos - y * sin, x * sin + y * cos];
    return { items, toPdf, angle, ignored: all.length - items.length };
  }

  /** Quebra itens em palavras com posição estimada. */
  function tokenize(items) {
    const out = [];
    items.forEach((it, idx) => {
      const len = it.s.length || 1;
      const cw = it.w > 0 ? it.w / len : it.h * 0.55;
      const re = /\S+/g;
      let m;
      while ((m = re.exec(it.s))) {
        out.push({ s: m[0], x0: it.x + m.index * cw, x1: it.x + (m.index + m[0].length) * cw, y: it.y, h: it.h, item: idx });
      }
    });
    return out;
  }

  /** Agrupa palavras em linhas e as linhas em "células" (blocos de texto contíguos). */
  function buildCells(items) {
    const toks = tokenize(items).sort((a, b) => b.y - a.y || a.x0 - b.x0);
    const lines = [];
    for (const t of toks) {
      let best = null;
      for (let k = lines.length - 1; k >= 0 && k >= lines.length - 40; k--) {
        const l = lines[k];
        const r = t.h / l.h;
        if (Math.abs(l.y - t.y) <= 0.5 * Math.max(t.h, l.h) && r > 0.6 && r < 1.67) { best = l; break; }
      }
      if (!best) { best = { y: t.y, h: t.h, toks: [] }; lines.push(best); }
      best.toks.push(t);
    }
    const cells = [];
    for (const l of lines) {
      l.toks.sort((a, b) => a.x0 - b.x0);
      let cur = null;
      let prev = null;
      for (const t of l.toks) {
        const gap = cur ? t.x0 - cur.x1 : Infinity;
        // Espaço dentro do mesmo item do PDF é espaço entre palavras, nunca divisa de coluna.
        const sameItem = prev && prev.item === t.item;
        if (cur && (sameItem || gap < 0.9 * l.h)) {
          cur.text += (sameItem || gap > 0.12 * l.h ? " " : "") + t.s;
          cur.x1 = Math.max(cur.x1, t.x1);
        } else {
          cur = { text: t.s, x0: t.x0, x1: t.x1, y: l.y, h: l.h };
          cells.push(cur);
        }
        prev = t;
      }
    }
    cells.forEach((c, i) => {
      c.id = i;
      c.text = cleanText(c.text);
      c.cx = (c.x0 + c.x1) / 2;
    });
    return cells;
  }

  // ----------------------------------------------------- lista de materiais

  const POS_RE = /^\d{1,4}([.-]\d{1,3}){0,3}[A-Z]?$/;
  const hasLetters = (s, n = 3) => (String(s).match(/[A-Za-zÀ-ú]/g) || []).length >= n;

  /** Procura palavras de cabeçalho numa célula; devolve posições x aproximadas. */
  function headerHits(cell) {
    const hits = [];
    const raw = stripAccents(cell.text).toUpperCase().replace(/[º°]/g, "O");
    const cw = (cell.x1 - cell.x0) / Math.max(raw.length, 1);
    const taken = new Array(raw.length).fill(false);
    const all = [];
    for (const [cat, words] of Object.entries(HEADER_WORDS)) for (const w of words) all.push([cat, w]);
    all.sort((a, b) => b[1].length - a[1].length);
    for (const [cat, w] of all) {
      // Aceita palavra colada a outra ("ITEMQUANT") mas não no meio de uma palavra comum.
      const pattern = w.replace(/ /g, "[^A-Z0-9]*");
      const re = new RegExp(`(?<![A-Z])${pattern}`, "g");
      let m;
      while ((m = re.exec(raw))) {
        const a = m.index;
        const b = a + m[0].length;
        if (taken.slice(a, b).some(Boolean)) continue;
        const next = raw.slice(b, b + 1);
        // "MATERIAL" pode vir colado com "REFERENCE"; "QUANT" com "ITEM"; mas "POS" em "POSSIVEL" não.
        if (/[A-Z]/.test(next) && !all.some(([, w2]) => raw.startsWith(w2, b))) continue;
        for (let k = a; k < b; k++) taken[k] = true;
        hits.push({ cat, word: w, x: cell.x0 + ((a + b) / 2) * cw, cell });
      }
    }
    return hits;
  }

  function median(arr) {
    if (!arr.length) return 0;
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  }

  /** Encontra tabelas de lista de materiais (com ou sem cabeçalho de texto). */
  function findTables(cells) {
    // 1) âncoras: célula de posição seguida, na mesma linha, de uma descrição.
    const anchors = [];
    for (const c of cells) {
      if (!POS_RE.test(c.text)) continue;
      const row = [c];
      let last = c;
      const same = cells
        .filter((o) => o !== c && Math.abs(o.y - c.y) <= 0.5 * Math.max(o.h, c.h) && o.x0 > c.x0 && Math.abs(o.h - c.h) < 0.4 * c.h)
        .sort((a, b) => a.x0 - b.x0);
      for (const o of same) {
        if (o.x0 - last.x1 > 30 * c.h) break;
        row.push(o);
        last = o;
      }
      if (row.length < 3) continue;
      if (!row.slice(1).some((o) => hasLetters(o.text) && !POS_RE.test(o.text))) continue;
      anchors.push({ y: c.y, h: c.h, x0: c.x0, cells: row });
    }
    // Uma célula pode ser âncora de mais de uma linha candidata; fica a mais à esquerda.
    const used = new Set();
    const rows = [];
    for (const a of anchors.sort((p, q) => p.x0 - q.x0)) {
      if (a.cells.some((c) => used.has(c.id))) continue;
      a.cells.forEach((c) => used.add(c.id));
      rows.push(a);
    }

    // 2) agrupa linhas alinhadas pela coluna de posição.
    const groups = [];
    for (const r of rows.sort((p, q) => q.y - p.y)) {
      const g = groups.find((g) => Math.abs(g.x0 - r.x0) <= 2 * r.h && Math.abs(g.h - r.h) < 0.35 * r.h);
      if (g) g.rows.push(r);
      else groups.push({ x0: r.x0, h: r.h, rows: [r] });
    }

    const tables = [];
    for (const g of groups) {
      // separa blocos distantes verticalmente
      const ys = g.rows.map((r) => r.y);
      const pitches = ys.slice(1).map((y, i) => ys[i] - y);
      const pitch = median(pitches) || g.h * 2.5;
      let block = [g.rows[0]];
      const blocks = [block];
      for (let i = 1; i < g.rows.length; i++) {
        if (g.rows[i - 1].y - g.rows[i].y > Math.max(3.2 * pitch, 6 * g.h)) { block = []; blocks.push(block); }
        block.push(g.rows[i]);
      }
      for (const b of blocks) {
        const t = buildTable(b, cells, pitch);
        if (t) tables.push(t);
      }
    }
    return tables;
  }

  function buildTable(rows, cells, pitch) {
    const h = median(rows.map((r) => r.h));
    // colunas: agrupa centros das células das linhas
    const centers = [];
    for (const r of rows) for (const c of r.cells) centers.push({ cx: c.cx, c, row: r });
    centers.sort((a, b) => a.cx - b.cx);
    const cols = [];
    for (const p of centers) {
      const col = cols.find((k) => Math.abs(k.cx - p.cx) <= 2.2 * h || (p.c.x0 < k.x1 && p.c.x1 > k.x0 && hasLetters(p.c.text) && k.letters));
      if (col) {
        col.items.push(p);
        col.cx = col.items.reduce((s, q) => s + q.cx, 0) / col.items.length;
        col.x0 = Math.min(col.x0, p.c.x0);
        col.x1 = Math.max(col.x1, p.c.x1);
        col.letters = col.letters || hasLetters(p.c.text);
      } else {
        cols.push({ cx: p.cx, x0: p.c.x0, x1: p.c.x1, items: [p], letters: hasLetters(p.c.text) });
      }
    }
    cols.sort((a, b) => a.cx - b.cx);
    // descarta colunas "soltas" (texto do desenho que caiu na mesma altura)
    const minSupport = rows.length >= 3 ? Math.max(2, Math.ceil(rows.length * 0.3)) : 1;
    const kept = cols.filter((k, i) => i === 0 || new Set(k.items.map((p) => p.row)).size >= minSupport);
    if (kept.length < 3 && rows.length < 2) return null;
    if (rows.length < 2 && kept.length < 4) return null;
    const x0 = kept[0].x0;
    const x1 = kept[kept.length - 1].x1;
    const yTop = Math.max(...rows.map((r) => r.y));
    const yBot = Math.min(...rows.map((r) => r.y));

    // cabeçalho: texto com palavras-chave logo acima ou abaixo do bloco de linhas
    const reach = Math.max(pitch * 2.6, h * 5);
    const rowCellIds = new Set(rows.flatMap((r) => r.cells.map((c) => c.id)));
    const near = cells.filter(
      (c) => !rowCellIds.has(c.id) && c.x1 > x0 - 2 * h && c.x0 < x1 + 3 * h &&
        ((c.y > yTop && c.y - yTop <= reach) || (c.y < yBot && yBot - c.y <= reach)),
    );
    let hits = [];
    for (const side of ["above", "below"]) {
      const sideCells = near.filter((c) => (side === "above" ? c.y > yTop : c.y < yBot));
      const sideHits = sideCells.flatMap(headerHits);
      const cats = new Set(sideHits.map((x) => x.cat));
      const nCells = new Set(sideHits.map((x) => x.cell.id)).size;
      if (cats.size >= 2 && (nCells >= 2 || cats.size >= 3) && sideHits.length > hits.length) hits = sideHits;
    }
    const headerCells = new Set(hits.map((x) => x.cell.id));

    // nomeia colunas: pelo cabeçalho (mais próximo) e, no que faltar, pelo conteúdo
    const roles = new Array(kept.length).fill(null);
    if (hits.length) {
      const pairs = [];
      kept.forEach((k, i) => hits.forEach((hh, j) => pairs.push({ i, j, d: Math.abs(k.cx - hh.x) })));
      pairs.sort((a, b) => a.d - b.d);
      const usedHit = new Set();
      for (const p of pairs) {
        if (roles[p.i] || usedHit.has(p.j)) continue;
        if (p.d > 14 * h) continue;
        const cat = hits[p.j].cat;
        if (cat !== "weight" && roles.includes(cat)) continue;
        roles[p.i] = cat;
        usedHit.add(p.j);
      }
    }
    inferRoles(kept, roles);

    // linhas de continuação (fonte menor, ou texto sem posição) → linha mais próxima
    const extra = cells.filter(
      (c) => !rowCellIds.has(c.id) && !headerCells.has(c.id) && c.x0 >= x0 - h && c.x1 <= x1 + 2 * h &&
        c.y <= yTop + pitch * 0.45 && c.y >= yBot - pitch * 0.45,
    );

    const out = rows.map((r) => ({ cellsByRole: {}, cells: [...r.cells], y: r.y }));
    const colOf = (c) => {
      let best = -1;
      let bd = Infinity;
      kept.forEach((k, i) => {
        const inside = c.cx >= k.x0 - h && c.cx <= k.x1 + h;
        const d = Math.abs(k.cx - c.cx) - (inside ? 1000 : 0);
        if (d < bd) { bd = d; best = i; }
      });
      return best;
    };
    rows.forEach((r, ri) => {
      for (const c of r.cells) {
        const i = colOf(c);
        if (i < 0 || (c.cx < x0 - h || c.cx > x1 + 3 * h)) continue;
        add(out[ri], roles[i] || "extra", c);
      }
    });
    for (const c of extra) {
      let ri = -1;
      let bd = Infinity;
      rows.forEach((r, k) => {
        const d = Math.abs(r.y - c.y);
        if (d < bd) { bd = d; ri = k; }
      });
      if (ri < 0) continue;
      // categoria: cabeçalho mais próximo (ex.: norma do material em fonte menor) ou coluna
      let role = null;
      if (hits.length) {
        let hd = Infinity;
        for (const hh of hits) {
          const d = Math.abs(hh.x - c.cx);
          if (d < hd) { hd = d; role = hh.cat; }
        }
      }
      if (!role || role === "pos") role = roles[colOf(c)] || "extra";
      if (role === "pos" || role === "qty") continue;
      add(out[ri], role, c);
      out[ri].cells.push(c);
    }

    // Aceite: sem cabeçalho, exige 2+ linhas e coluna de quantidade (evita tabela de revisões).
    if (!roles.includes("pos")) return null;
    if (!hits.length && (rows.length < 2 || !roles.includes("qty"))) return null;
    let finished = out.map(finishRow).filter((r) => r.pos && POS_RE.test(r.pos) && (r.desc || r.qty != null));
    if (!finished.length) return null;
    finished = fixWeightScope(finished);

    const allIds = new Set([...rowCellIds, ...headerCells, ...extra.map((c) => c.id)]);
    return {
      header: hits.length > 0,
      roles,
      rows: finished.sort((a, b) => cmpPos(a.pos, b.pos)),
      cellIds: allIds,
      box: { x0: x0 - h, x1: x1 + h, y0: yBot - h, y1: yTop + 2 * h },
    };

    function add(row, role, c) {
      (row.cellsByRole[role] = row.cellsByRole[role] || []).push(c);
    }
  }

  /** Dá nome às colunas sem cabeçalho a partir do conteúdo. */
  function inferRoles(cols, roles) {
    const vals = (k) => k.items.map((p) => p.c.text);
    const ratio = (k, re) => vals(k).filter((v) => re.test(v)).length / Math.max(vals(k).length, 1);
    if (!roles[0]) roles[0] = "pos";
    let descIdx = roles.indexOf("desc");
    if (descIdx < 0) {
      let best = -1;
      let bl = 0;
      cols.forEach((k, i) => {
        if (roles[i]) return;
        const avg = vals(k).reduce((s, v) => s + (v.match(/[A-Za-zÀ-ú]/g) || []).length, 0) / Math.max(vals(k).length, 1);
        if (avg > bl) { bl = avg; best = i; }
      });
      if (best >= 0) { roles[best] = "desc"; descIdx = best; }
    }
    // quantidade: primeira coluna inteira entre posição e descrição
    if (!roles.includes("qty")) {
      for (let i = 1; i < (descIdx < 0 ? cols.length : descIdx); i++) {
        if (!roles[i] && ratio(cols[i], /^\d{1,5}$/) >= 0.6) { roles[i] = "qty"; break; }
      }
    }
    // pesos: colunas numéricas decimais à direita da descrição
    const numericRight = [];
    cols.forEach((k, i) => {
      if (roles[i] || i <= descIdx) return;
      if (ratio(cols[i], /^(-|\d[\d.,]*)$/) >= 0.75 && ratio(cols[i], /\d/) > 0) numericRight.push(i);
    });
    const hasUnit = roles.includes("wUnit");
    const hasTotal = roles.includes("wTotal");
    const generic = roles.map((r, i) => (r === "weight" ? i : -1)).filter((i) => i >= 0);
    const weightCols = [...generic, ...numericRight].sort((a, b) => a - b);
    if (!hasUnit && !hasTotal && weightCols.length >= 2) {
      roles[weightCols[weightCols.length - 2]] = "wUnit";
      roles[weightCols[weightCols.length - 1]] = "wTotal";
      weightCols.slice(0, -2).forEach((i) => { if (!roles[i]) roles[i] = "extra"; });
    } else if (weightCols.length === 1 && !roles[weightCols[0]]) {
      roles[weightCols[0]] = "weight";
    } else {
      generic.forEach((i) => {
        if (!hasUnit) roles[i] = "wUnit";
        else if (!hasTotal) roles[i] = "wTotal";
      });
    }
    // texto restante entre descrição e pesos: material/referência
    cols.forEach((k, i) => {
      if (roles[i]) return;
      roles[i] = i > descIdx ? (roles.includes("material") ? "ref" : "material") : "extra";
    });
  }

  /**
   * Confere pela aritmética qual coluna é peso unitário e qual é total
   * (total = unitário × qtd). Se a maioria indicar o contrário, troca.
   */
  function fixWeightScope(rows) {
    let ok = 0;
    let swapped = 0;
    for (const r of rows) {
      if (r.qty == null || r.qty === 1 || r.wUnit == null || r.wTotal == null) continue;
      const near = (a, b) => Math.abs(a - b) <= Math.max(0.011, 0.03 * Math.abs(b));
      if (near(r.wUnit * r.qty, r.wTotal)) ok++;
      else if (near(r.wTotal * r.qty, r.wUnit)) swapped++;
    }
    if (swapped > ok) {
      for (const r of rows) [r.wUnit, r.wTotal] = [r.wTotal, r.wUnit];
    }
    return rows;
  }

  function joinTexts(cs) {
    if (!cs || !cs.length) return null;
    const sorted = [...cs].sort((a, b) => b.y - a.y || a.x0 - b.x0);
    const lines = [];
    for (const c of sorted) {
      if (!c.text || c.text === "-") continue;
      const l = lines.find((x) => Math.abs(x.y - c.y) <= 0.5 * Math.max(x.h, c.h));
      if (l) l.parts.push(c.text);
      else lines.push({ y: c.y, h: c.h, parts: [c.text] });
    }
    const t = lines.map((l) => cleanText(l.parts.join(" "))).join(" / ");
    return t || null;
  }

  function finishRow(r) {
    const by = r.cellsByRole;
    const num = (role) => {
      const t = joinTexts(by[role]);
      return t == null ? null : parseNum(t.split(" / ")[0]);
    };
    const row = {
      pos: joinTexts(by.pos),
      qtyText: joinTexts(by.qty),
      qty: num("qty"),
      desc: joinTexts(by.desc),
      material: joinTexts(by.material),
      ref: joinTexts(by.ref),
      dim: joinTexts(by.dim),
      wUnit: num("wUnit"),
      wTotal: num("wTotal"),
      weight: num("weight"),
      extra: joinTexts(by.extra),
      cells: r.cells,
    };
    // coluna "peso" sem escopo: se há só ela, guarda separada (não soma às cegas)
    return row;
  }

  function cmpPos(a, b) {
    const pa = String(a || "").split(/[.-]/).map(Number);
    const pb = String(b || "").split(/[.-]/).map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const x = pa[i] ?? -1;
      const y = pb[i] ?? -1;
      if (x !== y) return x - y;
    }
    return 0;
  }

  // ------------------------------------------------------------ carimbo

  function matchLabel(cell, synN) {
    const n = normLabel(cell.text);
    if (!n) return null;
    for (let i = 0; i < synN.length; i++) {
      const s = synN[i];
      if (n === s) return { idx: i, rest: "" };
      if (n.startsWith(s + " ")) return { idx: i, rest: restAfter(cell.text, s) };
    }
    return null;
  }

  /** Texto original depois do rótulo ("Ordem N°: 900" → "900"). */
  function restAfter(text, synNorm) {
    if (text.includes(":")) {
      const [left, ...right] = text.split(":");
      if (normLabel(left) === synNorm || normLabel(left).startsWith(synNorm)) return right.join(":").trim();
    }
    const words = text.split(/\s+/);
    for (let k = 1; k <= Math.min(words.length - 1, 6); k++) {
      if (normLabel(words.slice(0, k).join(" ")) === synNorm) return words.slice(k).join(" ").replace(/^[:\-–.\s]+/, "");
    }
    return "";
  }

  function validate(type, raw) {
    if (raw == null) return null;
    let v = cleanText(raw);
    if (!v || v === "-" || v === "--") return null;
    switch (type) {
      case "code": {
        v = v.replace(/^(N[º°o.]?|No\.?|Nr\.?)\s*/i, "");
        const alnum = v.replace(/[^A-Za-z0-9]/g, "");
        if (alnum.length < 4 || alnum.length > 40 || !/\d/.test(v)) return null;
        if (/^\d{1,2}[/.]\d{1,2}[/.]\d{2,4}$/.test(v)) return null;
        if (v.split(" ").length > 4) return null;
        return v;
      }
      case "rev": {
        v = v.replace(/^REV(ISAO|ISION)?\.?\s*/i, "");
        return /^[A-Za-z0-9]{1,3}$/.test(v) ? v.toUpperCase() : null;
      }
      case "num": {
        const n = parseNum(v);
        return n != null && n > 0 ? n : null;
      }
      case "int": {
        const n = parseNum(v);
        return n != null && Number.isInteger(n) && n > 0 && n < 100000 ? n : null;
      }
      case "scale": {
        if (/^(S\/?E|SEM ESCALA|NTS|INDICADA)$/i.test(v)) return v.toUpperCase();
        return /^\d+([.,]\d+)?\s*[:/]\s*\d+([.,]\d+)?$/.test(v) ? v.replace(/\s/g, "") : null;
      }
      default:
        return hasLetters(v, 2) && v.length <= 140 ? v : null;
    }
  }

  function findFields(cells, fieldDefs, blocked) {
    const allSyn = [...fieldDefs.flatMap((f) => f.synN), ...EXTRA_LABELS.map(normLabel)];
    const isLabel = (c) => {
      const n = normLabel(c.text);
      return allSyn.some(
        (s) => n === s || (n.startsWith(s + " ") && n.length - s.length <= 32) || (n.endsWith(" " + s) && n.length - s.length <= 16),
      );
    };
    const free = cells.filter((c) => !blocked.has(c.id));
    const labelCells = free.filter(isLabel);
    const labelSet = new Set(labelCells.map((c) => c.id));
    const values = free.filter((c) => !labelSet.has(c.id));

    const result = {};
    const cands = {};
    for (const f of fieldDefs) {
      let best = null;
      const all = [];
      const consider = (cand) => {
        all.push(cand);
        if (!best || cand.score < best.score) best = cand;
      };
      for (const L of free) {
        const m = matchLabel(L, f.synN);
        if (!m) continue;
        // rótulo:valor na mesma célula
        if (m.rest && (f.type !== "text" || L.text.includes(":"))) {
          const v = validate(f.type, m.rest);
          if (v != null) {
            consider({ value: v, cells: [L], score: m.idx * 0.3 - 1, label: L });
            continue;
          }
        }
        const rightBound = Math.min(
          ...labelCells.filter((o) => o.x0 > L.x0 + L.h && o.y >= L.y - 6 * L.h && o.y <= L.y + L.h).map((o) => o.x0),
          Infinity,
        );
        if (f.collect) {
          const below = labelCells.filter((o) => o !== L && o.y < L.y - 0.5 * L.h && o.y >= L.y - 18 * L.h && o.x0 < L.x0 + 6 * L.h && o.x1 > L.x0 - L.h);
          const bottomY = below.length ? Math.max(...below.map((o) => o.y)) : L.y - 14 * L.h;
          const bound = Math.min(
            rightBound,
            ...labelCells.filter((o) => o.x0 > L.x0 + 4 * L.h && o.y > bottomY && o.y <= L.y + L.h).map((o) => o.x0),
          );
          let parts = values
            .filter((c) => (c.y < L.y - 0.3 * L.h && c.y > bottomY + 0.3 * L.h && c.x1 > L.x0 - 2 * L.h && c.x0 < bound) ||
              (Math.abs(c.y - L.y) <= 0.6 * Math.max(c.h, L.h) && c.x0 >= L.x1 - 0.5 * L.h && c.x0 - L.x1 <= 8 * L.h))
            .filter((c) => c.h >= 0.8 * L.h && hasLetters(c.text, 2) && !/^\d{1,2}\s*\/\s*\d{1,2}\s*\/\s*\d{2,4}$/.test(c.text))
            .sort((a, b) => b.y - a.y || a.x0 - b.x0);
          // título fica na fonte maior da região; textos menores (norma, data) ficam de fora
          const hMax = Math.max(0, ...parts.map((c) => c.h));
          parts = parts.filter((c) => c.h >= 0.65 * hMax).slice(0, 6);
          const v = validate(f.type, parts.map((c) => c.text).join(" "));
          if (v != null) {
            const score = m.idx * 0.3 + (parts[0] ? (L.y - parts[0].y) / L.h : 0) * 0.2;
            consider({ value: v, cells: [L, ...parts], score, label: L });
          }
          continue;
        }
        for (const c of values) {
          if (c.h < 0.8 * L.h) continue;
          let dist = null;
          const sameLine = Math.abs(c.y - L.y) <= 0.6 * Math.max(c.h, L.h);
          if (sameLine && c.x0 >= L.x1 - 0.5 * L.h && c.x0 - L.x1 <= 8 * L.h) {
            dist = (c.x0 - L.x1) / L.h;
          } else {
            const dy = L.y - c.y;
            if (dy > 0 && dy <= Math.max(3.5 * L.h, 2.2 * c.h) && c.x1 > L.x0 - 2 * L.h && c.x0 < rightBound) {
              dist = dy / L.h + (Math.max(0, c.x0 - L.x0) / L.h) * 0.15;
            }
          }
          if (dist == null) continue;
          const v = validate(f.type, c.text);
          if (v == null) continue;
          const score = dist + m.idx * 0.3 - (f.preferLarge ? (c.h / L.h) * 1.5 : 0);
          consider({ value: v, cells: [L, c], score, label: L });
        }
      }
      result[f.key] = best ? { value: best.value, cells: best.cells, source: "texto" } : null;
      cands[f.key] = all.sort((a, b) => a.score - b.score).slice(0, 12);
    }
    return { fields: result, cands };
  }

  // ------------------------------------------------------------- página

  /**
   * Analisa uma página. `items` já no quadro horizontal ({s,x,y,w,h}).
   * `toPdf(x,y)` converte o quadro para o espaço do PDF (evidência).
   */
  function analyzePage(items, toPdf, fieldsConfig, hints = {}) {
    const fieldDefs = compileFields(fieldsConfig || DEFAULT_FIELDS);
    const cells = buildCells(items);
    const tables = findTables(cells);
    const blocked = new Set();
    for (const t of tables) for (const id of t.cellIds) blocked.add(id);
    const { fields, cands } = findFields(cells, fieldDefs, blocked);

    // Nº do desenho: se o número do nome do arquivo aparece escrito na folha, ele vence
    // (carimbos com dois números — cliente e fornecedor — confundem o rótulo).
    if (hints.fileNumber && fieldDefs.some((f) => f.key === "drawing")) {
      const key = codeKey(hints.fileNumber);
      const cur = fields.drawing;
      if (cur && codeKey(cur.value) === key) {
        cur.confirmed = true;
      } else if (key.length >= 4) {
        const hit = cells
          .filter((c) => !blocked.has(c.id) && codeKey(c.text).includes(key))
          .sort((x, y) => y.h - x.h)[0];
        if (hit) {
          const word = hit.text.split(/\s+/).find((w) => codeKey(w).includes(key)) || hit.text;
          fields.drawing = { value: cleanText(word), cells: [hit], source: "texto", confirmed: true, alt: cur ? cur.value : null };
        }
      }
    }

    // Revisão: com mais de um campo "Revisão" no carimbo, vale o que está ao lado do nº do desenho.
    if (fields.drawing && cands.revision && cands.revision.length > 1) {
      const dc = fields.drawing.cells[fields.drawing.cells.length - 1];
      const near = cands.revision
        .map((c) => ({ c, v: c.cells[c.cells.length - 1] }))
        .filter(({ v }) => Math.abs(v.y - dc.y) <= 1.5 * dc.h && v.x0 > dc.x0 && v.x0 - dc.x1 <= 40 * dc.h)
        .sort((a, b) => Math.abs(a.v.y - dc.y) - Math.abs(b.v.y - dc.y) || a.v.x0 - b.v.x0)[0];
      if (near) fields.revision = { value: near.c.value, cells: near.c.cells, source: "texto" };
    }

    const rect = (cs) => {
      if (!cs || !cs.length) return null;
      const pts = [];
      for (const c of cs) {
        pts.push(toPdf(c.x0, c.y - 0.25 * c.h), toPdf(c.x1, c.y + 0.95 * c.h), toPdf(c.x0, c.y + 0.95 * c.h), toPdf(c.x1, c.y - 0.25 * c.h));
      }
      const xs = pts.map((p) => p[0]);
      const ys = pts.map((p) => p[1]);
      return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    };
    for (const k of Object.keys(fields)) {
      const f = fields[k];
      if (f) { f.rect = rect(f.cells.length > 1 ? f.cells.slice(1) : f.cells); delete f.cells; }
    }
    const rows = [];
    tables.forEach((t, ti) => {
      for (const r of t.rows) {
        r.rect = rect(r.cells);
        r.table = ti;
        r.header = t.header;
        delete r.cells;
        rows.push(r);
      }
    });
    return {
      fields,
      rows,
      tables: tables.map((t) => ({ header: t.header, roles: t.roles, rect: rect([{ x0: t.box.x0, x1: t.box.x1, y: t.box.y0, h: (t.box.y1 - t.box.y0) / 1.2 }]) })),
      textCount: items.reduce((s, i) => s + i.s.trim().length, 0),
      lines: cells.map((c) => ({ text: c.text, y: c.y, x: c.x0 })),
    };
  }

  // ------------------------------------------------------ nome do arquivo

  /** Número e revisão a partir do nome do arquivo (usado só como alternativa). */
  function fromFileName(name) {
    const base = String(name).replace(/\.[^.]+$/, "");
    let rev = null;
    const mRev = base.match(/\bREV(?:ISAO|ISÃO)?\.?\s*([A-Z0-9]{1,3})\b/i);
    if (mRev) rev = mRev[1].toUpperCase();
    const tokens = base
      .replace(/\bREV(?:ISAO|ISÃO)?\.?\s*[A-Z0-9]{1,3}\b/gi, " ")
      .split(/[\s_]+/)
      .map((t) => t.replace(/^[-.]+|[-.]+$/g, ""))
      .filter((t) => /\d/.test(t) && t.replace(/[^A-Za-z0-9]/g, "").length >= 4);
    tokens.sort((a, b) => b.length - a.length);
    const number = tokens[0] || null;
    if (!rev && number) {
      const m = base.match(new RegExp(`${number.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}_\\d{3,4}_([A-Z0-9]{1,3})$`, "i"));
      if (m) rev = m[1].toUpperCase();
    }
    return { number, rev };
  }

  return {
    DEFAULT_FIELDS,
    HEADER_WORDS,
    normLabel,
    cleanText,
    codeKey,
    parseNum,
    cmpPos,
    itemsFromPdf,
    buildCells,
    analyzePage,
    fromFileName,
  };
});
