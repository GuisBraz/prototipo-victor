/*
 * MECABOM Lite — motor da BOM (funções puras, sem DOM).
 *
 * Princípio herdado do MECABOM (docs/BOM_RULES.md): a leitura EXTRAI, o motor
 * CALCULA e VALIDA, a pessoa CONFERE. Ausente ≠ zero: qualquer fator nulo deixa
 * o total nulo e gera pendência, nunca um número inventado.
 */
(function (root, factory) {
  const api = factory(root.MBExtract || (typeof require === "function" ? require("./extract.js") : null));
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MBBom = api;
})(typeof self !== "undefined" ? self : this, function (X) {
  "use strict";

  const { codeKey, cleanText } = X;
  const normKey = (s) => (s == null ? "" : X.normLabel(s));
  const round = (n, d = 3) => (n == null ? null : Math.round(n * 10 ** d) / 10 ** d);

  function cmpRev(a, b) {
    const na = Number(a);
    const nb = Number(b);
    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
    return String(a || "").localeCompare(String(b || ""), "pt-BR", { numeric: true });
  }

  const tokensOf = (text) =>
    String(text || "")
      .split(/[\s/;,]+/)
      .map((t) => t.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, ""))
      .filter(Boolean);

  /**
   * Quantidades do pacote em documentos auxiliares (ordem de serviço, romaneio):
   * "B4620MX21418 # 2 un.", "2 pç - TC-2025-01-01", "TC-01 ... QTD: 3".
   */
  function scanPackageQuantities(docs, knownNumbers) {
    const found = {};
    const nums = knownNumbers.filter((n) => codeKey(n).length >= 5);
    if (!nums.length) return found;
    const unit = "(?:UN|UND|UNID|UNIDADES?|P[ÇC]S?|PE[ÇC]AS?|CJ|CONJ|CONJUNTOS?|QTD|QTDE)";
    for (const doc of docs) {
      for (const line of doc.lines || []) {
        const text = line.text;
        const up = text.toUpperCase();
        for (const n of nums) {
          const esc = n.toUpperCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/[-\s]/g, "[-\\s]?");
          const after = new RegExp(`${esc}(?![A-Z0-9])[^0-9]{0,14}?(?:QTD[E]?\\.?:?\\s*)?(\\d{1,5})\\s*${unit}\\b`);
          const before = new RegExp(`(?<![0-9.,])(\\d{1,5})\\s*${unit}\\.?\\s*[-–:#x]?\\s*(?:DE\\s+)?${esc}(?![A-Z0-9])`);
          const m = up.match(after) || up.match(before);
          if (!m) continue;
          const q = Number(m[1]);
          if (!q) continue;
          const k = codeKey(n);
          if (!found[k]) found[k] = { qty: q, source: doc.fileName, text: cleanText(text), page: line.page, rect: line.rect };
          else if (found[k].qty !== q && found[k].source !== doc.fileName) found[k].conflict = `${found[k].qty} × ${q}`;
        }
      }
    }
    return found;
  }

  /**
   * Monta a BOM.
   * drawings: [{ id, fileName, fileNumber, fileRev, fields:{key:{value,source,...}}, rows:[...],
   *              pkgQty (manual|null) }]
   * pkgQtyFound: resultado de scanPackageQuantities.
   */
  function compute(drawings, pkgQtyFound = {}, opts = {}) {
    const issues = [];
    const issue = (severity, drawing, message, extra = {}) =>
      issues.push({ severity, drawing: drawing ? drawing.number || drawing.fileName : null, drawingId: drawing ? drawing.id : null, message, ...extra });

    // 1) identidade e revisões
    for (const d of drawings) {
      d.number = d.fields.drawing ? String(d.fields.drawing.value) : null;
      d.rev = d.fields.revision ? String(d.fields.revision.value) : null;
      d.key = d.number ? codeKey(d.number) : null;
      d.status = "ativo";
      d.notes = [];
    }
    const byKey = new Map();
    for (const d of drawings) {
      if (!d.key) continue;
      if (!byKey.has(d.key)) byKey.set(d.key, []);
      byKey.get(d.key).push(d);
    }
    for (const [, list] of byKey) {
      if (list.length < 2) continue;
      list.sort((a, b) => cmpRev(b.rev, a.rev));
      const latest = list[0];
      for (const d of list.slice(1)) {
        if (cmpRev(d.rev, latest.rev) === 0) {
          d.status = "duplicado";
          issue("aviso", d, `Desenho repetido no pacote (mesma revisão ${d.rev ?? "—"}); ignorado no cálculo. Arquivo: ${d.fileName}.`);
        } else {
          d.status = "revisão antiga";
          issue("aviso", d, `Revisão ${d.rev ?? "—"} ignorada: o pacote tem a revisão ${latest.rev ?? "—"} (${latest.fileName}).`);
        }
      }
    }
    const active = drawings.filter((d) => d.status === "ativo");
    const activeByKey = new Map(active.filter((d) => d.key).map((d) => [d.key, d]));
    const allKeys = [...activeByKey.keys()];
    // "Família" dos números do pacote (4 primeiros caracteres): ajuda a reconhecer
    // referências a desenhos que não vieram no pacote.
    const prefixes = new Set(allKeys.map((k) => k.slice(0, 4)));
    const looksLikeDrawing = (t) => {
      const k = codeKey(t);
      return tokensOf(t).length === 1 && k.length >= 6 && /\d{2}/.test(k) && /[A-Z]/.test(k) && prefixes.has(k.slice(0, 4));
    };

    // 2) linhas: referência a outro desenho do pacote, grupos (2 → 2.1, 2.2)
    for (const d of active) {
      const poss = new Set(d.rows.map((r) => r.pos));
      for (const r of d.rows) {
        r.isGroup = [...poss].some((p) => p && r.pos && p.startsWith(r.pos + ".") && p !== r.pos);
        r.child = null;
        for (const field of ["ref", "material", "desc", "extra"]) {
          for (const t of tokensOf(r[field])) {
            const k = codeKey(t);
            if (k.length >= 5 && k !== d.key && activeByKey.has(k)) { r.child = k; break; }
          }
          if (r.child) break;
        }
      }
    }

    // 3) relações pai → filho e multiplicador de cada desenho
    const parents = new Map();
    for (const d of active) {
      for (const r of d.rows) {
        if (!r.child) continue;
        if (!parents.has(r.child)) parents.set(r.child, []);
        parents.get(r.child).push({ parent: d, qty: r.qty, pos: r.pos });
      }
    }
    for (const d of active) {
      const found = d.key ? pkgQtyFound[d.key] : null;
      if (d.pkgQtyManual != null) { d.pkgQty = d.pkgQtyManual; d.pkgQtySource = "digitado"; }
      else if (found) { d.pkgQty = found.qty; d.pkgQtySource = found.source; if (found.conflict) issue("aviso", d, `Quantidades diferentes em documentos do pacote: ${found.conflict}.`); }
      else { d.pkgQty = null; d.pkgQtySource = null; }
    }
    const memo = new Map();
    const visiting = new Set();
    function mult(d) {
      if (memo.has(d.id)) return memo.get(d.id);
      if (visiting.has(d.id)) {
        issue("bloqueio", d, "Ciclo entre desenhos (um conjunto contém a si mesmo). Quantidade não calculada.");
        return null;
      }
      visiting.add(d.id);
      const ps = d.key ? parents.get(d.key) || [] : [];
      let base;
      if (d.pkgQty != null) base = d.pkgQty;
      else if (!ps.length) { base = 1; d.pkgDefault = true; }
      else base = 0;
      let total = base;
      const via = [];
      for (const p of ps) {
        const m = mult(p.parent);
        if (m == null || p.qty == null) { total = null; break; }
        total += m * p.qty;
        via.push(`${p.qty} × ${p.parent.number} (pos. ${p.pos})`);
      }
      visiting.delete(d.id);
      d.via = via;
      memo.set(d.id, total);
      return total;
    }
    for (const d of active) d.mult = mult(d);

    // 4) itens da BOM
    const items = [];
    for (const d of active) {
      for (const [rowIndex, r] of d.rows.entries()) {
        const child = r.child ? activeByKey.get(r.child) : null;
        const kind = r.isGroup ? "grupo" : child ? (child.rows.length ? "conjunto" : "peça c/ desenho") : "item";
        let wUnit = r.wUnit;
        let wUnitSrc = wUnit != null ? "lista" : null;
        if (wUnit == null && r.wTotal != null && r.qty) { wUnit = r.wTotal / r.qty; wUnitSrc = "calculado (total ÷ qtd)"; }
        if (wUnit == null && child && child.fields.weight) { wUnit = child.fields.weight.value; wUnitSrc = `carimbo de ${child.number}`; }
        let material = r.material;
        let ref = r.ref;
        // coluna de material que na verdade traz nº de desenho (lista sem cabeçalho)
        if (material && (looksLikeDrawing(material) || (child && codeKey(material) === child.key))) {
          ref = ref ? `${ref} / ${material}` : material;
          material = null;
        }
        if (!material && child && child.fields.material) material = child.fields.material.value;
        const qtyTotal = r.qty != null && d.mult != null ? r.qty * d.mult : null;
        const item = {
          id: `${d.id}:${r.pos}:${items.length}`,
          drawingId: d.id,
          rowIndex,
          drawing: d.number || d.fileName,
          rev: d.rev,
          pos: r.pos,
          kind,
          child: child ? child.number : null,
          desc: r.desc,
          material,
          ref,
          dim: r.dim,
          qty: r.qty,
          qtyTotal,
          wUnit: round(wUnit),
          wUnitSrc,
          wTotalList: r.wTotal,
          wTotal: wUnit != null && qtyTotal != null ? round(wUnit * qtyTotal) : null,
          page: r.page,
          rect: r.rect,
          flags: [],
        };
        if (r.qty == null) item.flags.push("quantidade não lida");
        if (r.weight != null && r.wUnit == null && r.wTotal == null) item.flags.push(`peso ${r.weight} sem indicação de unitário/total`);
        if (r.wUnit != null && r.wTotal != null && r.qty) {
          const exp = r.wUnit * r.qty;
          if (Math.abs(exp - r.wTotal) > Math.max(0.011, 0.03 * r.wTotal)) item.flags.push(`peso total da linha (${r.wTotal}) ≠ unitário × qtd (${round(exp)})`);
        }
        if (!r.desc) item.flags.push("descrição não lida");
        for (const fl of item.flags) if (fl !== "quantidade não lida") issue("aviso", d, `Pos. ${r.pos}: ${fl}.`, { page: r.page, rect: r.rect });
        items.push(item);
      }
      // desenho de peça sem lista e sem pai: entra como item avulso
      if (!d.rows.length && !(d.key && parents.has(d.key))) {
        items.push({
          id: `${d.id}:peca`,
          drawingId: d.id,
          drawing: d.number || d.fileName,
          rev: d.rev,
          pos: "—",
          kind: "peça avulsa",
          child: d.number,
          desc: d.fields.title ? d.fields.title.value : null,
          material: d.fields.material ? d.fields.material.value : null,
          ref: d.number,
          qty: 1,
          qtyTotal: d.mult,
          wUnit: d.fields.weight ? d.fields.weight.value : null,
          wUnitSrc: d.fields.weight ? "carimbo" : null,
          wTotal: d.fields.weight && d.mult != null ? round(d.fields.weight.value * d.mult) : null,
          page: d.fields.title ? d.fields.title.page : 1,
          rect: null,
          flags: d.rows.length ? [] : ["desenho sem lista de materiais"],
        });
      }
    }

    // 5) consolidado (o que comprar/fabricar): sem grupos e sem conjuntos que têm lista própria
    const consolidated = new Map();
    for (const it of items) {
      if (it.kind === "grupo" || it.kind === "conjunto") continue;
      const refDrawing = it.child || (it.ref && looksLikeDrawing(it.ref) ? it.ref : null);
      const key = refDrawing ? `DES|${codeKey(refDrawing)}` : `${normKey(it.desc)}|${normKey(it.material)}`;
      if (!consolidated.has(key)) {
        consolidated.set(key, {
          key, desc: it.desc, material: it.material, ref: refDrawing, wUnit: it.wUnit,
          qtyTotal: 0, wTotal: 0, qtyKnown: 0, wKnown: 0, qtyPartial: false, weightPartial: false, usedIn: new Set(), lines: 0,
        });
      }
      const c = consolidated.get(key);
      c.lines++;
      c.usedIn.add(it.drawing);
      if (it.qtyTotal == null) c.qtyPartial = true;
      else { c.qtyTotal += it.qtyTotal; c.qtyKnown++; }
      if (it.wTotal == null) c.weightPartial = true;
      else { c.wTotal += it.wTotal; c.wKnown++; }
      if (c.wUnit == null) c.wUnit = it.wUnit;
    }
    const cons = [...consolidated.values()]
      .map((c) => ({
        ...c,
        qtyTotal: c.qtyKnown ? round(c.qtyTotal) : null,
        wTotal: c.wKnown ? round(c.wTotal) : null,
        usedIn: [...c.usedIn].join(", "),
      }))
      .sort((a, b) => String(a.desc || "").localeCompare(String(b.desc || ""), "pt-BR", { numeric: true }));

    // 6) conferências por desenho
    for (const d of drawings) {
      if (!d.number) {
        issue("bloqueio", d, "Nº do desenho não encontrado. Digite na aba Desenhos.");
        continue;
      }
      if (d.status !== "ativo") continue;
      if (d.fields.drawing.source === "arquivo") issue("info", d, "Nº do desenho tirado do nome do arquivo (não foi encontrado no carimbo como texto).");
      if (d.fields.drawing.alt) issue("info", d, `O rótulo do carimbo indicava "${d.fields.drawing.alt}"; foi usado o número que também está no nome do arquivo.`);
      if (d.fileRev && d.rev && cmpRev(d.fileRev, d.rev) !== 0) issue("aviso", d, `Revisão lida no carimbo (${d.rev}) é diferente da do nome do arquivo (${d.fileRev}). Confira.`);
      if (!d.rev) issue("info", d, "Revisão não encontrada.");
      if (d.pkgDefault && !(opts.silentDefaultQty)) issue("info", d, "Quantidade do conjunto no pacote não informada: considerado 1. Ajuste na aba Desenhos se precisar.");
      const plain = d.rows.filter((r) => !r.isGroup);
      if (!d.rows.length && !d.fields.material && !d.fields.title) issue("aviso", d, "Nada lido além do número: sem lista de materiais, título ou material. Pode ser texto em curvas (use OCR).");
      if (plain.length && d.fields.weight) {
        const vals = plain.map((r) => (r.wTotal != null ? r.wTotal : r.wUnit != null && r.qty != null ? r.wUnit * r.qty : null));
        if (vals.every((v) => v != null)) {
          const sum = vals.reduce((s, v) => s + v, 0);
          const w = d.fields.weight.value;
          const diff = Math.abs(sum - w) / w;
          if (diff > 0.05) issue("aviso", d, `Soma dos pesos da lista (${round(sum, 2)} kg) difere ${Math.round(diff * 100)}% do peso do carimbo (${w} kg).`);
        }
      }
      const ints = d.rows.map((r) => r.pos).filter((p) => /^\d+$/.test(p)).map(Number).sort((a, b) => a - b);
      if (ints.length >= 2 && ints[0] <= 1 && ints[ints.length - 1] <= 60) {
        const missing = [];
        for (let i = 1; i < ints[ints.length - 1]; i++) if (!ints.includes(i)) missing.push(i);
        if (missing.length) issue("aviso", d, `Posições faltando na lista: ${missing.join(", ")}.`);
      }
      for (const r of d.rows) {
        if (r.qty == null) issue("aviso", d, `Pos. ${r.pos}: quantidade não lida.`, { page: r.page, rect: r.rect });
        for (const t of tokensOf(`${r.ref || ""} ${r.material || ""}`)) {
          const k = codeKey(t);
          if (k.length >= 6 && /\d{2}/.test(k) && /[A-Z]/.test(k) && prefixes.has(k.slice(0, 4)) && !activeByKey.has(k) && k !== d.key) {
            issue("aviso", d, `Pos. ${r.pos} cita o desenho ${t}, que não está no pacote.`, { page: r.page, rect: r.rect });
          }
        }
      }
    }

    const sevOrder = { bloqueio: 0, aviso: 1, info: 2 };
    issues.sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity]);
    const wSum = cons.reduce((s, c) => s + (c.wTotal || 0), 0);
    return {
      drawings,
      items,
      consolidated: cons,
      issues,
      totals: {
        drawings: active.length,
        items: items.length,
        consolidated: cons.length,
        weight: round(wSum, 2),
        weightPartial: cons.some((c) => c.weightPartial),
        blocking: issues.filter((i) => i.severity === "bloqueio").length,
        warnings: issues.filter((i) => i.severity === "aviso").length,
      },
    };
  }

  /**
   * Transforma documentos lidos (páginas analisadas) em desenhos.
   * Um PDF pode ter um desenho por página (pacote num arquivo só) ou um desenho
   * em várias folhas: páginas sem número novo continuam o desenho anterior.
   * Documento sem número, sem lista e sem número no nome do arquivo = auxiliar
   * (ordem de serviço, romaneio), usado só para achar quantidades.
   */
  function drawingsFromDocs(docs) {
    const drawings = [];
    const aux = [];
    for (const doc of docs) {
      const fn = X.fromFileName(doc.fileName);
      const pages = doc.pages.filter((p) => p.analysis);
      const hasOwn = pages.some((p) => p.analysis.fields.drawing || p.analysis.rows.length);
      if (!hasOwn && !fn.number) {
        aux.push(doc);
        continue;
      }
      let cur = null;
      for (const p of pages) {
        const a = p.analysis;
        const num = a.fields.drawing ? codeKey(a.fields.drawing.value) : null;
        if (!cur || (num && cur.key && num !== cur.key)) {
          cur = { id: `${doc.id}-p${p.page}`, docId: doc.id, fileName: doc.fileName, fileNumber: fn.number, fileRev: fn.rev, pages: [], fields: {}, rows: [], key: num, ocr: false };
          drawings.push(cur);
        } else if (num && !cur.key) {
          cur.key = num; // folhas anteriores sem número pertencem a este desenho
        }
        cur.pages.push(p.page);
        if (p.ocr) cur.ocr = true;
        for (const [k, v] of Object.entries(a.fields)) {
          if (v && !cur.fields[k]) cur.fields[k] = { ...v, page: p.page, source: p.raw && p.raw.kind === "ocr" && v.source === "texto" ? "OCR" : v.source };
        }
        for (const r of a.rows) cur.rows.push({ ...r, page: p.page });
      }
      const single = drawings.filter((d) => d.docId === doc.id);
      for (const d of single) {
        if (!d.fields.drawing && fn.number && single.length === 1) d.fields.drawing = { value: fn.number, source: "arquivo", page: d.pages[0] };
        if (!d.fields.revision && fn.rev && single.length === 1) d.fields.revision = { value: fn.rev, source: "arquivo", page: d.pages[0] };
        delete d.key;
      }
    }
    return { drawings, aux };
  }

  return { compute, scanPackageQuantities, drawingsFromDocs, cmpRev };
});
