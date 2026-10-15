/*
 * MECABOM Lite — interface (navegador). Tudo roda localmente: pdf.js lê o PDF,
 * extract.js acha carimbo e lista, bom.js calcula, SheetJS gera o Excel.
 * OCR (Tesseract.js) só é baixado se a opção for marcada.
 */
(function () {
  "use strict";

  const X = window.MBExtract;
  const B = window.MBBom;
  const $ = (s) => document.querySelector(s);
  const MAX_PAGES = 300;
  const OCR_MIN_CHARS = 40;
  const FIELDS_KEY = "mecabom-lite-fields-v1";
  const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  const TESSERACT = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";

  if (!window.pdfjsLib || !X || !B) {
    document.body.insertAdjacentHTML(
      "afterbegin",
      '<p style="background:#fde8ea;color:#b3141d;padding:12px 16px;margin:0">Não foi possível carregar as bibliotecas. Verifique a conexão com a internet na primeira abertura.</p>',
    );
    return;
  }
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS;

  const state = {
    docs: [],
    files: new Map(),
    edits: {},
    result: null,
    tab: "drawings",
    filter: "",
    fields: loadFields(),
    busy: false,
    seq: 0,
    ocr: null,
    pdfCache: new Map(),
  };

  // ------------------------------------------------------------- utilidades

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const fmt = (n, d = 3) => (n == null || Number.isNaN(n) ? "" : Number(n).toLocaleString("pt-BR", { maximumFractionDigits: d }));
  const natural = (a, b) => String(a).localeCompare(String(b), "pt-BR", { numeric: true, sensitivity: "base" });
  const ICON_EYE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';

  function loadFields() {
    const defaults = X.DEFAULT_FIELDS.map((f) => ({ ...f, syn: [...f.syn] }));
    try {
      const saved = JSON.parse(localStorage.getItem(FIELDS_KEY) || "null");
      if (Array.isArray(saved) && saved.length) return saved;
    } catch (_) {
      /* armazenamento indisponível: usa o padrão */
    }
    return defaults;
  }
  function saveFields() {
    try {
      localStorage.setItem(FIELDS_KEY, JSON.stringify(state.fields));
    } catch (_) {
      /* sem armazenamento: vale só nesta sessão */
    }
  }

  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = res;
      s.onerror = () => rej(new Error(`Falha ao baixar ${src}`));
      document.head.appendChild(s);
    });
  }

  // ------------------------------------------------------- entrada de arquivos

  async function expand(files) {
    const out = [];
    const skipped = [];
    for (const f of files) {
      const lower = f.name.toLowerCase();
      if (lower.endsWith(".pdf")) {
        out.push({ name: f.name, size: f.size, read: () => f.arrayBuffer() });
      } else if (lower.endsWith(".zip")) {
        try {
          const zip = await window.JSZip.loadAsync(f);
          zip.forEach((path, e) => {
            if (e.dir) return;
            if (path.toLowerCase().endsWith(".pdf")) out.push({ name: path.split("/").pop(), size: e._data ? e._data.uncompressedSize : 0, read: () => e.async("arraybuffer") });
            else if (!/(^|\/)(\.|__MACOSX)/.test(path)) skipped.push(path.split("/").pop());
          });
        } catch (err) {
          skipped.push(`${f.name} (zip inválido)`);
        }
      } else if (!/^(thumbs\.db|\.ds_store|desktop\.ini)$/i.test(f.name)) {
        skipped.push(f.name);
      }
    }
    out.sort((a, b) => natural(a.name, b.name));
    return { out, skipped };
  }

  async function filesFromDrop(dt) {
    const entries = [...(dt.items || [])].map((i) => (i.webkitGetAsEntry ? i.webkitGetAsEntry() : null)).filter(Boolean);
    if (!entries.length) return [...dt.files];
    const out = [];
    async function walk(entry) {
      if (entry.isFile) {
        out.push(await new Promise((res, rej) => entry.file(res, rej)));
      } else if (entry.isDirectory) {
        const reader = entry.createReader();
        let batch;
        do {
          batch = await new Promise((res, rej) => reader.readEntries(res, rej));
          for (const e of batch) await walk(e);
        } while (batch.length);
      }
    }
    for (const e of entries) await walk(e);
    return out;
  }

  // -------------------------------------------------------------- leitura

  function log(html) {
    const div = document.createElement("div");
    div.innerHTML = html;
    $("#log").prepend(div);
  }

  function setProgress(done, total, text) {
    $("#progress").hidden = false;
    $("#progText").textContent = text;
    $("#progCount").textContent = total ? `${done} de ${total}` : "";
    $("#progBar").style.width = total ? `${Math.round((done / total) * 100)}%` : "0";
  }

  async function addFiles(files) {
    if (state.busy) return;
    const { out, skipped } = await expand(files);
    if (skipped.length) log(`<b>Ignorados</b> (formato não suportado — exporte em PDF): ${esc(skipped.slice(0, 12).join(", "))}${skipped.length > 12 ? "…" : ""}`);
    const known = new Set(state.docs.map((d) => `${d.fileName}|${d.size}`));
    const queue = out.filter((e) => !known.has(`${e.name}|${e.size}`));
    if (out.length > queue.length) log(`<b>${out.length - queue.length}</b> arquivo(s) já estavam carregados.`);
    if (!queue.length) {
      if (!out.length && !skipped.length) log("Nenhum PDF encontrado.");
      $("#progress").hidden = false;
      return;
    }
    state.busy = true;
    document.body.style.cursor = "progress";
    const useOcr = $("#optOcr").checked;
    const t0 = performance.now();
    for (let i = 0; i < queue.length; i++) {
      const e = queue[i];
      setProgress(i, queue.length, `Lendo ${e.name}…`);
      try {
        const doc = await readPdf(e, useOcr, (msg) => setProgress(i, queue.length, `${e.name}: ${msg}`));
        state.docs.push(doc);
        const a = doc.pages.map((p) => p.analysis);
        const rows = a.reduce((s, x) => s + x.rows.length, 0);
        const noText = doc.pages.filter((p) => p.chars < OCR_MIN_CHARS && !p.ocr).length;
        log(`<b>${esc(e.name)}</b> — ${doc.pages.length} folha(s), ${rows} linha(s) de lista${doc.pages.some((p) => p.ocr) ? " · OCR" : ""}${noText ? ` · <span class="miss">${noText} folha(s) sem texto${useOcr ? "" : " — marque OCR"}</span>` : ""}`);
      } catch (err) {
        console.error(err);
        log(`<b>${esc(e.name)}</b> — <span class="miss">não foi possível ler (${esc(err && err.message ? err.message : err)})</span>`);
      }
    }
    const secs = ((performance.now() - t0) / 1000).toFixed(1);
    setProgress(queue.length, queue.length, `Pronto: ${queue.length} arquivo(s) em ${secs} s.`);
    state.busy = false;
    document.body.style.cursor = "";
    recompute();
    render();
  }

  async function readPdf(entry, useOcr, onStep) {
    const buf = await entry.read();
    const id = `f${++state.seq}`;
    state.files.set(id, { name: entry.name, data: buf });
    const doc = { id, fileName: entry.name, size: entry.size, pages: [], lines: [] };
    const pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(buf.slice(0)), isEvalSupported: false }).promise;
    const n = Math.min(pdf.numPages, MAX_PAGES);
    for (let p = 1; p <= n; p++) {
      if (n > 1) onStep(`folha ${p} de ${n}`);
      const page = await pdf.getPage(p);
      const tc = await page.getTextContent();
      const fr = X.itemsFromPdf(tc.items);
      const chars = fr.items.reduce((s, i) => s + i.s.trim().length, 0);
      let raw = { kind: "pdf", items: fr.items, angle: fr.angle };
      let ocr = false;
      let ocrRaw = null;
      if (chars < OCR_MIN_CHARS && useOcr) {
        onStep(`OCR da folha ${p}…`);
        raw = await ocrPage(page, fr.items.length ? fr.angle : null);
        ocr = true;
      } else if (useOcr) {
        // Tem texto, mas o carimbo pode estar em curvas (fonte SHX): OCR só para completar campos.
        const quick = X.analyzePage(raw.items, toPdfFn(raw), state.fields, { fileNumber: X.fromFileName(entry.name).number });
        if (!quick.fields.drawing) {
          onStep(`OCR do carimbo, folha ${p}…`);
          ocrRaw = await ocrPage(page, fr.angle);
        }
      }
      doc.pages.push({ page: p, raw, ocr, ocrRaw, chars, analysis: null });
      page.cleanup();
    }
    if (pdf.numPages > MAX_PAGES) log(`<b>${esc(entry.name)}</b>: só as primeiras ${MAX_PAGES} folhas foram lidas.`);
    await pdf.destroy();
    analyzeDoc(doc);
    return doc;
  }

  function toPdfFn(raw) {
    if (raw.kind === "ocr") {
      const [a, b, c, d, e, f] = raw.transform;
      const det = a * d - b * c;
      return (x, y) => {
        const px = x;
        const py = -y;
        return [(d * (px - e) - c * (py - f)) / det, (-b * (px - e) + a * (py - f)) / det];
      };
    }
    const t = (raw.angle * Math.PI) / 180;
    const cos = Math.cos(t);
    const sin = Math.sin(t);
    return (x, y) => [x * cos - y * sin, x * sin + y * cos];
  }

  function analyzeDoc(doc) {
    const fileNumber = X.fromFileName(doc.fileName).number;
    doc.lines = [];
    for (const p of doc.pages) {
      p.analysis = X.analyzePage(p.raw.items, toPdfFn(p.raw), state.fields, { fileNumber });
      if (p.ocrRaw) {
        const o = X.analyzePage(p.ocrRaw.items, toPdfFn(p.ocrRaw), state.fields, { fileNumber });
        for (const [k, v] of Object.entries(o.fields)) {
          if (!v || p.analysis.fields[k]) continue;
          // OCR erra muito em texto livre (pega logotipo como título): só aceita códigos e números.
          if (fieldDef(k).type === "text") continue;
          const value = k === "drawing" && fileNumber && X.codeKey(v.value) === X.codeKey(fileNumber) ? fileNumber : v.value;
          p.analysis.fields[k] = { ...v, value, source: "OCR" };
        }
        if (!p.analysis.rows.length && o.rows.length) {
          p.analysis.rows = o.rows;
          p.ocr = true;
        }
      }
      for (const l of p.analysis.lines) doc.lines.push({ ...l, page: p.page });
    }
  }

  async function ensureOcr() {
    if (!window.Tesseract) await loadScript(TESSERACT);
    if (!state.ocr) state.ocr = await window.Tesseract.createWorker("por+eng");
    return state.ocr;
  }

  async function ocrPage(page, angle) {
    const worker = await ensureOcr();
    const rotation = angle == null ? page.rotate : angle % 360;
    const base = page.getViewport({ scale: 1, rotation });
    const scale = Math.min(4, 4200 / Math.max(base.width, base.height));
    const vp = page.getViewport({ scale, rotation });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(vp.width);
    canvas.height = Math.ceil(vp.height);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // intent "print": desenha mesmo com a aba em segundo plano (o modo "display" pausa)
    await page.render({ canvasContext: ctx, viewport: vp, intent: "print" }).promise;
    const { data } = await worker.recognize(canvas);
    const items = (data.words || [])
      .filter((w) => w.text && w.text.trim() && w.confidence >= 35)
      .map((w) => ({ s: w.text, x: w.bbox.x0, y: -w.bbox.y1, w: w.bbox.x1 - w.bbox.x0, h: Math.max(1, (w.bbox.y1 - w.bbox.y0) * 0.8) }));
    canvas.width = canvas.height = 0;
    return { kind: "ocr", items, transform: vp.transform };
  }

  // ------------------------------------------------------- cálculo e edição

  function recompute() {
    const { drawings, aux } = B.drawingsFromDocs(state.docs);
    for (const d of drawings) applyEdits(d);
    const nums = drawings.map((d) => d.fields.drawing && d.fields.drawing.value).filter(Boolean);
    const found = B.scanPackageQuantities(state.docs, nums);
    state.aux = aux;
    state.result = B.compute(drawings, found);
  }

  function applyEdits(d) {
    const e = state.edits[d.id];
    if (!e) return;
    for (const [k, v] of Object.entries(e.fields || {})) {
      const orig = d.fields[k];
      d.fields[k] = v == null ? null : { ...(orig || { page: d.pages[0] }), value: v, source: "editado" };
    }
    for (const [idx, patch] of Object.entries(e.rows || {})) {
      const r = d.rows[Number(idx)];
      if (r) Object.assign(r, patch, { edited: Object.keys(patch) });
    }
    if (e.pkgQty !== undefined) d.pkgQtyManual = e.pkgQty;
  }

  function fieldDef(key) {
    return state.fields.find((f) => f.key === key) || { type: "text" };
  }

  function parseEdit(type, text) {
    const t = X.cleanText(text);
    if (!t || t === "—") return null;
    if (type === "num" || type === "int") {
      const n = X.parseNum(t);
      return n == null ? undefined : n;
    }
    return t;
  }

  function commitEdit(td) {
    const did = td.dataset.did;
    const text = td.textContent;
    const e = (state.edits[did] = state.edits[did] || { fields: {}, rows: {} });
    if (td.dataset.field) {
      const v = parseEdit(fieldDef(td.dataset.field).type, text);
      if (v === undefined) { render(); return; }
      e.fields[td.dataset.field] = v;
    } else if (td.dataset.row != null) {
      const k = td.dataset.key;
      const v = parseEdit(["qty", "wUnit", "wTotal"].includes(k) ? "num" : "text", text);
      if (v === undefined) { render(); return; }
      (e.rows[td.dataset.row] = e.rows[td.dataset.row] || {})[k] = v;
    }
    recompute();
    render();
  }

  // ------------------------------------------------------------ desenho

  function render() {
    const has = state.docs.length > 0;
    $("#results").hidden = !has;
    $("#btnExport").disabled = !has || !state.result;
    $("#btnClear").disabled = !has;
    $(".intake").classList.toggle("is-compact", has);
    $("#dropTitle").textContent = has ? "Arraste mais desenhos para somar a este pacote" : "Arraste o pacote de desenhos aqui";
    if (!has || !state.result) return;
    const r = state.result;
    const t = r.totals;
    $("#kpis").innerHTML = [
      kpi("Arquivos lidos", state.docs.length, state.aux && state.aux.length ? `${state.aux.length} auxiliar(es): ${state.aux.map((a) => a.fileName).join(", ")}` : ""),
      kpi("Desenhos", t.drawings, `${r.drawings.length - t.drawings} ignorado(s)`),
      kpi("Itens a comprar/fabricar", t.consolidated, `${t.items} linhas lidas`),
      kpi("Peso total (kg)", fmt(t.weight, 2), t.weightPartial ? "parcial: há itens sem peso" : "soma da BOM consolidada"),
      kpi("Pendências", t.blocking + t.warnings, `${t.blocking} bloqueio(s) · ${t.warnings} aviso(s)`, t.blocking ? "danger" : t.warnings ? "warn" : ""),
    ].join("");
    $("#cDrawings").textContent = r.drawings.length;
    $("#cItems").textContent = r.items.length;
    $("#cCons").textContent = r.consolidated.length;
    $("#cIssues").textContent = r.issues.filter((i) => i.severity !== "info").length || "";
    for (const b of document.querySelectorAll(".tab")) b.setAttribute("aria-selected", String(b.dataset.tab === state.tab));
    const wrap = $("#tableWrap");
    const scroll = [wrap.scrollTop, wrap.scrollLeft];
    const views = { drawings: viewDrawings, items: viewItems, cons: viewCons, issues: viewIssues };
    wrap.innerHTML = views[state.tab](r);
    [wrap.scrollTop, wrap.scrollLeft] = scroll;
    applyFilter();
  }

  function kpi(label, value, small, tone = "") {
    return `<div class="kpi${tone ? ` kpi--${tone}` : ""}"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(small || "")}</small></div>`;
  }

  function srcChip(f) {
    if (!f) return "";
    if (f.source === "arquivo") return '<span class="src src--arquivo" title="Tirado do nome do arquivo">arquivo</span>';
    if (f.source === "OCR") return '<span class="src src--ocr" title="Lido por OCR: confira">OCR</span>';
    if (f.source === "editado") return '<span class="src src--editado">editado</span>';
    return "";
  }

  function fieldCell(d, key, cls = "") {
    const f = d.fields[key];
    const def = fieldDef(key);
    const val = f ? (def.type === "num" ? fmt(f.value) : esc(f.value)) : "";
    // Só os campos essenciais ganham destaque quando faltam; os demais ficam discretos.
    const essential = ["drawing", "revision", "title"].includes(key);
    const miss = f ? "" : essential ? '<span class="miss">não encontrado</span>' : '<span class="dash">—</span>';
    if (def.type === "text") cls += " wide";
    return `<td class="${cls}${f || !essential ? "" : " cell-miss"}" contenteditable="true" spellcheck="false" data-did="${esc(d.id)}" data-field="${esc(key)}" title="Clique para corrigir">${val || miss}${srcChip(f)}</td>`;
  }

  function viewDrawings(r) {
    const extra = state.fields.filter((f) => f.enabled !== false && f.key !== "drawing" && f.key !== "revision");
    const issuesBy = new Map();
    for (const i of r.issues) if (i.drawingId) issuesBy.set(i.drawingId, [...(issuesBy.get(i.drawingId) || []), i]);
    const list = [...r.drawings].sort((a, b) => natural(a.number || a.fileName, b.number || b.fileName));
    if (!list.length) return '<p class="empty">Nenhum desenho encontrado nos arquivos.</p>';
    $("#hint").textContent = "Clique numa célula para corrigir. O olho abre a folha com a origem de cada valor.";
    const head = ["", "Nº do desenho", "Rev.", ...extra.map((f) => f.label), "Qtd. no pacote", "Qtd. total", "Linhas", "Situação", "Arquivo"];
    const rows = list.map((d) => {
      const iss = issuesBy.get(d.id) || [];
      const bad = iss.filter((i) => i.severity === "bloqueio").length;
      const warn = iss.filter((i) => i.severity === "aviso").length;
      const status =
        d.status !== "ativo" ? `<span class="tag tag--mute">${esc(d.status)}</span>`
          : bad ? `<span class="tag tag--danger">${bad} bloqueio</span>`
            : warn ? `<span class="tag tag--warn">${warn} aviso${warn > 1 ? "s" : ""}</span>`
              : '<span class="tag tag--ok">ok</span>';
      const qtySrc = d.pkgQtySource && d.pkgQtySource !== "digitado" ? `<span class="src src--calc" title="Encontrado em ${esc(d.pkgQtySource)}">${esc(d.pkgQtySource)}</span>` : "";
      const via = d.via && d.via.length ? ` title="${esc(d.via.join(" + "))}"` : "";
      return `<tr class="${d.status !== "ativo" ? "is-muted" : ""}">
        <td><button class="eye" data-view="${esc(d.id)}" title="Ver folha">${ICON_EYE}</button></td>
        ${fieldCell(d, "drawing", "code")}
        ${fieldCell(d, "revision", "code")}
        ${extra.map((f) => fieldCell(d, f.key, f.type === "num" || f.type === "int" ? "num" : "")).join("")}
        <td class="num"><input class="qty-input" type="number" min="0" step="1" data-pkg="${esc(d.id)}" value="${d.pkgQty ?? ""}" placeholder="${d.pkgDefault ? "1" : "—"}" title="${d.pkgDefault ? "Não informado: considerado 1" : "Vem dos conjuntos que usam este desenho"}" aria-label="Quantidade no pacote">${qtySrc}</td>
        <td class="num"${via}>${d.mult == null ? '<span class="miss">indefinida</span>' : fmt(d.mult)}</td>
        <td class="num">${d.rows.length || '<span class="tag tag--mute">sem lista</span>'}</td>
        <td>${status}</td>
        <td>${esc(d.fileName)}${d.pages.length > 1 ? ` <span class="src src--calc">fls. ${d.pages[0]}–${d.pages[d.pages.length - 1]}</span>` : d.ocr ? "" : ""}</td>
      </tr>`;
    });
    return table(head, rows);
  }

  function viewItems(r) {
    if (!r.items.length) return '<p class="empty">Nenhuma lista de materiais encontrada. Confira as pendências.</p>';
    $("#hint").textContent = "Qtd. total = qtd. no desenho × quantidade do desenho no pacote. Grupos (2 → 2.1, 2.2) e conjuntos com lista própria não entram no consolidado.";
    const head = ["", "Desenho", "Pos.", "Tipo", "Qtd.", "Qtd. total", "Descrição", "Material", "Referência", "Peso unit. (kg)", "Peso total (kg)", "Observações"];
    const kindTag = { item: "", grupo: '<span class="tag tag--mute">grupo</span>', conjunto: '<span class="tag tag--info">conjunto</span>', "peça c/ desenho": '<span class="tag tag--info">peça c/ desenho</span>', "peça avulsa": '<span class="tag tag--mute">peça avulsa</span>' };
    const rows = r.items.map((it) => {
      const ed = (k) => (it.rowIndex != null ? `contenteditable="true" spellcheck="false" data-did="${esc(it.drawingId)}" data-row="${it.rowIndex}" data-key="${k}"` : "");
      const miss = (v, html) => (v == null || v === "" ? '<span class="miss">—</span>' : html);
      return `<tr class="${it.kind === "grupo" ? "is-group" : ""}">
        <td>${it.page ? `<button class="eye" data-view="${esc(it.drawingId)}" data-item="${esc(it.id)}" title="Ver na folha">${ICON_EYE}</button>` : ""}</td>
        <td class="code">${esc(it.drawing)}${it.rev ? ` <span class="src src--calc">rev ${esc(it.rev)}</span>` : ""}</td>
        <td class="code">${esc(it.pos)}</td>
        <td>${it.kind in kindTag ? kindTag[it.kind] : esc(it.kind)}${it.child && it.kind !== "peça avulsa" ? ` <span class="code">${esc(it.child)}</span>` : ""}</td>
        <td class="num" ${ed("qty")}>${miss(it.qty, fmt(it.qty))}</td>
        <td class="num">${miss(it.qtyTotal, `<strong>${fmt(it.qtyTotal)}</strong>`)}</td>
        <td class="wide" ${ed("desc")}>${miss(it.desc, esc(it.desc))}</td>
        <td class="wide" ${ed("material")}>${miss(it.material, esc(it.material))}</td>
        <td class="code">${esc(it.ref || "")}</td>
        <td class="num" ${ed("wUnit")}>${miss(it.wUnit, fmt(it.wUnit))}${it.wUnitSrc && it.wUnitSrc !== "lista" ? ` <span class="src src--calc" title="${esc(it.wUnitSrc)}">calc.</span>` : ""}</td>
        <td class="num">${miss(it.wTotal, fmt(it.wTotal))}</td>
        <td>${it.flags.map((f) => `<span class="tag tag--warn">${esc(f)}</span>`).join(" ")}</td>
      </tr>`;
    });
    return table(head, rows);
  }

  function viewCons(r) {
    if (!r.consolidated.length) return '<p class="empty">Nada para consolidar ainda.</p>';
    $("#hint").textContent = "Itens iguais (mesma descrição e material, ou mesmo desenho) somados no pacote inteiro.";
    const head = ["Descrição", "Material", "Desenho / ref.", "Qtd. total", "Peso unit. (kg)", "Peso total (kg)", "Usado em", "Obs."];
    const rows = r.consolidated.map((c) => `<tr>
        <td class="wide">${c.desc ? esc(c.desc) : '<span class="miss">sem descrição</span>'}</td>
        <td class="wide">${c.material ? esc(c.material) : '<span class="miss">—</span>'}</td>
        <td class="code">${esc(c.ref || "")}</td>
        <td class="num"><strong>${c.qtyTotal == null ? '<span class="miss">—</span>' : fmt(c.qtyTotal)}</strong></td>
        <td class="num">${fmt(c.wUnit)}</td>
        <td class="num">${c.wTotal == null ? '<span class="miss">—</span>' : fmt(c.wTotal)}</td>
        <td>${esc(c.usedIn)}</td>
        <td>${c.qtyPartial ? '<span class="tag tag--warn">qtd. parcial</span> ' : ""}${c.weightPartial ? '<span class="tag tag--warn">peso parcial</span>' : ""}</td>
      </tr>`);
    return table(head, rows);
  }

  function viewIssues(r) {
    if (!r.issues.length) return '<p class="empty">Nenhuma pendência. Mesmo assim, confira por amostragem.</p>';
    $("#hint").textContent = "Bloqueio: falta informação essencial. Aviso: confira. Info: só para saber.";
    const tone = { bloqueio: "danger", aviso: "warn", info: "info" };
    const head = ["Tipo", "Desenho", "O que conferir", ""];
    const rows = r.issues.map((i, k) => `<tr>
        <td class="sev"><span class="tag tag--${tone[i.severity]}">${esc(i.severity)}</span></td>
        <td class="code">${esc(i.drawing || "—")}</td>
        <td>${esc(i.message)}</td>
        <td>${i.drawingId ? `<button class="eye" data-view="${esc(i.drawingId)}" data-issue="${k}" title="Ver folha">${ICON_EYE}</button>` : ""}</td>
      </tr>`);
    return table(head, rows);
  }

  function table(head, rows) {
    return `<table class="grid"><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table>`;
  }

  function applyFilter() {
    const q = X.normLabel(state.filter);
    for (const tr of document.querySelectorAll("#tableWrap tbody tr")) {
      tr.hidden = q ? !X.normLabel(tr.textContent).includes(q) : false;
    }
  }

  // ---------------------------------------------------------- visualizador

  const viewer = { docId: null, page: 1, pages: 1, rects: [], focus: null, zoom: 1, token: 0 };

  async function getPdf(docId) {
    if (state.pdfCache.has(docId)) return state.pdfCache.get(docId);
    const f = state.files.get(docId);
    const pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(f.data.slice(0)), isEvalSupported: false }).promise;
    state.pdfCache.set(docId, pdf);
    if (state.pdfCache.size > 6) {
      const [k, old] = state.pdfCache.entries().next().value;
      state.pdfCache.delete(k);
      old.destroy();
    }
    return pdf;
  }

  function openFor(drawingId, opts = {}) {
    const d = state.result.drawings.find((x) => x.id === drawingId);
    if (!d) return;
    let page = d.pages[0];
    let focus = d.fields.drawing && d.fields.drawing.rect ? d.fields.drawing.rect : null;
    if (d.fields.drawing && d.fields.drawing.page) page = d.fields.drawing.page;
    if (opts.item) {
      const it = state.result.items.find((x) => x.id === opts.item);
      if (it && it.page) { page = it.page; focus = it.rect; }
    }
    if (opts.issue != null) {
      const is = state.result.issues[opts.issue];
      if (is && is.page) { page = is.page; focus = is.rect; }
    }
    const rects = [];
    for (const f of Object.values(d.fields)) if (f && f.rect) rects.push({ page: f.page, rect: f.rect });
    for (const r of d.rows) if (r.rect) rects.push({ page: r.page, rect: r.rect });
    viewer.docId = d.docId;
    viewer.rects = rects;
    viewer.focus = focus ? { page, rect: focus } : null;
    viewer.page = page;
    viewer.zoom = 1;
    $("#vTitle").textContent = `${d.number || ""} — ${d.fileName}`;
    $("#viewer").hidden = false;
    $("#backdrop").hidden = false;
    drawPage();
  }

  async function drawPage() {
    const token = ++viewer.token;
    const pdf = await getPdf(viewer.docId);
    if (token !== viewer.token) return;
    viewer.pages = pdf.numPages;
    $("#vPage").textContent = `folha ${viewer.page}/${viewer.pages}`;
    const page = await pdf.getPage(viewer.page);
    const body = $("#vBody");
    const base = page.getViewport({ scale: 1 });
    const scale = ((body.clientWidth - 32) / base.width) * viewer.zoom;
    const vp = page.getViewport({ scale });
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const canvas = $("#vCanvas");
    canvas.width = Math.floor(vp.width * dpr);
    canvas.height = Math.floor(vp.height * dpr);
    canvas.style.width = `${Math.floor(vp.width)}px`;
    canvas.style.height = `${Math.floor(vp.height)}px`;
    const ctx = canvas.getContext("2d");
    // Marcações primeiro (não dependem do desenho da folha, que pode demorar em folhas grandes).
    const box = $("#vPageBox");
    box.querySelectorAll(".hl").forEach((n) => n.remove());
    let focusEl = null;
    const place = (rect, cls) => {
      const [x1, y1, x2, y2] = vp.convertToViewportRectangle(rect);
      const el = document.createElement("div");
      el.className = cls;
      const pad = 3;
      el.style.left = `${Math.min(x1, x2) - pad}px`;
      el.style.top = `${Math.min(y1, y2) - pad}px`;
      el.style.width = `${Math.abs(x2 - x1) + 2 * pad}px`;
      el.style.height = `${Math.abs(y2 - y1) + 2 * pad}px`;
      box.appendChild(el);
      return el;
    };
    for (const r of viewer.rects) if (r.page === viewer.page) place(r.rect, "hl hl--soft");
    if (viewer.focus && viewer.focus.page === viewer.page && viewer.focus.rect) focusEl = place(viewer.focus.rect, "hl");
    if (focusEl) {
      const bx = focusEl.offsetLeft + focusEl.offsetWidth / 2 - body.clientWidth / 2;
      const by = focusEl.offsetTop + focusEl.offsetHeight / 2 - body.clientHeight / 2;
      body.scrollTo({ left: Math.max(0, bx + 16), top: Math.max(0, by + 16) });
    }
    if (viewer.task) viewer.task.cancel();
    viewer.task = page.render({ canvasContext: ctx, viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined });
    try {
      await viewer.task.promise;
    } catch (err) {
      if (!err || err.name !== "RenderingCancelledException") console.error(err);
    }
  }

  function closeViewer() {
    $("#viewer").hidden = true;
    $("#backdrop").hidden = true;
    viewer.token++;
  }

  // ------------------------------------------------------------- exportação

  function exportXlsx() {
    const r = state.result;
    const XL = window.XLSX;
    const wb = XL.utils.book_new();
    const extra = state.fields.filter((f) => f.enabled !== false && f.key !== "drawing" && f.key !== "revision");
    const val = (f) => (f ? f.value : "");
    const now = new Date();
    const resumo = [
      ["MECABOM Lite — BOM gerada por leitura automática (regras, sem IA)"],
      ["ATENÇÃO", "Lista NÃO CONFERIDA. Confira os itens com pendência antes de usar em compra ou produção."],
      ["Gerado em", now.toLocaleString("pt-BR")],
      ["Arquivos lidos", state.docs.length],
      ["Desenhos considerados", r.totals.drawings],
      ["Linhas lidas", r.totals.items],
      ["Itens consolidados", r.totals.consolidated],
      ["Peso total (kg)", r.totals.weight, r.totals.weightPartial ? "parcial: há itens sem peso" : ""],
      ["Bloqueios", r.totals.blocking],
      ["Avisos", r.totals.warnings],
    ];
    addSheet(wb, "Resumo", resumo, [24, 80, 30]);
    addSheet(wb, "Desenhos", [
      ["Nº do desenho", "Origem do nº", "Revisão", ...extra.map((f) => f.label), "Qtd. no pacote", "Origem qtd.", "Qtd. total", "Linhas na lista", "Situação", "Arquivo", "Folhas"],
      ...[...r.drawings].sort((a, b) => natural(a.number || a.fileName, b.number || b.fileName)).map((d) => [
        d.number || "", d.fields.drawing ? d.fields.drawing.source : "", d.rev || "",
        ...extra.map((f) => val(d.fields[f.key])),
        d.pkgQty ?? (d.pkgDefault ? 1 : ""), d.pkgQtySource || (d.pkgDefault ? "padrão (1)" : ""), d.mult ?? "", d.rows.length, d.status, d.fileName, d.pages.join(", "),
      ]),
    ], [18, 12, 8, ...extra.map(() => 22), 12, 16, 10, 10, 12, 34, 8]);
    addSheet(wb, "BOM por desenho", [
      ["Desenho", "Rev.", "Pos.", "Tipo", "Desenho do item", "Qtd. no desenho", "Qtd. total", "Descrição", "Material", "Referência", "Peso unit. (kg)", "Peso total (kg)", "Observações"],
      ...r.items.map((it) => [it.drawing, it.rev || "", it.pos, it.kind, it.child || "", it.qty ?? "", it.qtyTotal ?? "", it.desc || "", it.material || "", it.ref || "", it.wUnit ?? "", it.wTotal ?? "", it.flags.join("; ")]),
    ], [18, 6, 7, 14, 16, 10, 10, 44, 30, 26, 12, 12, 40]);
    addSheet(wb, "BOM consolidada", [
      ["Descrição", "Material", "Desenho / ref.", "Qtd. total", "Peso unit. (kg)", "Peso total (kg)", "Usado em", "Observação"],
      ...r.consolidated.map((c) => [c.desc || "", c.material || "", c.ref || "", c.qtyTotal ?? "", c.wUnit ?? "", c.wTotal ?? "", c.usedIn, [c.qtyPartial ? "qtd. parcial" : "", c.weightPartial ? "peso parcial" : ""].filter(Boolean).join("; ")]),
    ], [44, 30, 18, 10, 12, 12, 40, 20]);
    addSheet(wb, "Pendências", [["Tipo", "Desenho", "O que conferir"], ...r.issues.map((i) => [i.severity, i.drawing || "", i.message])], [10, 22, 100]);
    const stamp = now.toISOString().slice(0, 16).replace(/[-:T]/g, "");
    XL.writeFile(wb, `BOM_MECABOM_${stamp}.xlsx`);
  }

  function addSheet(wb, name, aoa, widths) {
    const ws = window.XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = widths.map((w) => ({ wch: w }));
    if (aoa.length > 1 && name !== "Resumo") ws["!autofilter"] = { ref: window.XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: aoa.length - 1, c: aoa[0].length - 1 } }) };
    window.XLSX.utils.book_append_sheet(wb, ws, name);
  }

  // ------------------------------------------------------------ campos

  function openFields() {
    const host = $("#fieldRows");
    host.innerHTML = "";
    state.draftFields = state.fields.map((f) => ({ ...f, syn: [...f.syn] }));
    for (const f of state.draftFields) host.appendChild(fieldRow(f));
    $("#dlgFields").showModal();
  }

  function fieldRow(f) {
    const row = document.createElement("div");
    row.className = "field-row";
    const custom = !X.DEFAULT_FIELDS.some((d) => d.key === f.key);
    row.innerHTML = `
      <input type="checkbox" ${f.enabled !== false ? "checked" : ""} aria-label="Ler este campo" ${f.key === "drawing" ? "disabled" : ""}>
      ${custom ? `<input type="text" value="${esc(f.label)}" aria-label="Nome do campo" placeholder="Nome do campo">` : `<label>${esc(f.label)}<small>${f.key === "drawing" ? "sempre lido" : typeLabel(f.type)}</small></label>`}
      <textarea aria-label="Rótulos aceitos" placeholder="Um rótulo por linha">${esc(f.syn.join("\n"))}</textarea>
      ${custom ? '<button class="eye" type="button" title="Remover campo" aria-label="Remover campo">✕</button>' : "<span></span>"}`;
    const [chk] = row.querySelectorAll("input[type=checkbox]");
    chk.addEventListener("change", () => (f.enabled = chk.checked));
    row.querySelector("textarea").addEventListener("input", (e) => (f.syn = e.target.value.split("\n").map((s) => s.trim()).filter(Boolean)));
    if (custom) {
      row.querySelector("input[type=text]").addEventListener("input", (e) => (f.label = e.target.value));
      row.querySelector("button").addEventListener("click", () => {
        state.draftFields = state.draftFields.filter((x) => x !== f);
        row.remove();
      });
    }
    return row;
  }

  const typeLabel = (t) => ({ code: "código", rev: "revisão", num: "número", int: "inteiro", scale: "escala", text: "texto" })[t] || "texto";

  function saveFieldsDialog() {
    const fields = state.draftFields.filter((f) => f.label && f.label.trim() && f.syn.length);
    state.fields = fields;
    saveFields();
    $("#dlgFields").close();
    if (state.docs.length) {
      for (const d of state.docs) analyzeDoc(d);
      recompute();
    }
    render();
  }

  // --------------------------------------------------------------- eventos

  $("#btnPick").addEventListener("click", () => $("#inFiles").click());
  $("#btnPickDir").addEventListener("click", () => $("#inDir").click());
  $("#inFiles").addEventListener("change", (e) => { addFiles([...e.target.files]); e.target.value = ""; });
  $("#inDir").addEventListener("change", (e) => { addFiles([...e.target.files]); e.target.value = ""; });

  const drop = $("#drop");
  ["dragenter", "dragover"].forEach((ev) => window.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("is-over"); }));
  ["dragleave", "dragend"].forEach((ev) => window.addEventListener(ev, (e) => { if (!e.relatedTarget) drop.classList.remove("is-over"); }));
  window.addEventListener("drop", async (e) => {
    e.preventDefault();
    drop.classList.remove("is-over");
    const files = await filesFromDrop(e.dataTransfer);
    addFiles(files);
  });

  $("#tabs").addEventListener("click", (e) => {
    const b = e.target.closest(".tab");
    if (!b) return;
    state.tab = b.dataset.tab;
    $("#tableWrap").scrollTop = 0;
    render();
  });
  $("#filter").addEventListener("input", (e) => { state.filter = e.target.value; applyFilter(); });

  const wrap = $("#tableWrap");
  wrap.addEventListener("click", (e) => {
    const eye = e.target.closest("[data-view]");
    if (eye) openFor(eye.dataset.view, { item: eye.dataset.item, issue: eye.dataset.issue != null ? Number(eye.dataset.issue) : null });
  });
  wrap.addEventListener("focusin", (e) => {
    const td = e.target.closest("td[contenteditable]");
    if (td && td.querySelector(".miss")) td.textContent = "";
    if (td) td.querySelectorAll(".src").forEach((n) => n.remove());
  });
  wrap.addEventListener("focusout", (e) => {
    const td = e.target.closest("td[contenteditable]");
    if (td) commitEdit(td);
  });
  wrap.addEventListener("keydown", (e) => {
    const td = e.target.closest("td[contenteditable]");
    if (td && e.key === "Enter") { e.preventDefault(); td.blur(); }
    if (td && e.key === "Escape") { e.preventDefault(); render(); }
  });
  wrap.addEventListener("change", (e) => {
    const inp = e.target.closest("[data-pkg]");
    if (!inp) return;
    const did = inp.dataset.pkg;
    const e2 = (state.edits[did] = state.edits[did] || { fields: {}, rows: {} });
    const n = inp.value === "" ? null : Math.max(0, Number(inp.value));
    e2.pkgQty = Number.isFinite(n) ? n : null;
    recompute();
    render();
  });

  $("#vClose").addEventListener("click", closeViewer);
  $("#backdrop").addEventListener("click", closeViewer);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#viewer").hidden) closeViewer(); });
  $("#vPrev").addEventListener("click", () => { if (viewer.page > 1) { viewer.page--; drawPage(); } });
  $("#vNext").addEventListener("click", () => { if (viewer.page < viewer.pages) { viewer.page++; drawPage(); } });
  $("#vZoomIn").addEventListener("click", () => { viewer.zoom = Math.min(viewer.zoom * 1.5, 12); drawPage(); });
  $("#vZoomOut").addEventListener("click", () => { viewer.zoom = Math.max(viewer.zoom / 1.5, 0.4); drawPage(); });

  $("#btnExport").addEventListener("click", exportXlsx);
  $("#btnClear").addEventListener("click", () => {
    if (!confirm("Limpar todos os desenhos carregados?")) return;
    for (const pdf of state.pdfCache.values()) pdf.destroy();
    Object.assign(state, { docs: [], files: new Map(), edits: {}, result: null, pdfCache: new Map() });
    $("#log").innerHTML = "";
    $("#progress").hidden = true;
    render();
  });
  $("#btnFields").addEventListener("click", openFields);
  $("#btnCancelFields").addEventListener("click", () => $("#dlgFields").close());
  $("#btnSaveFields").addEventListener("click", saveFieldsDialog);
  $("#btnResetFields").addEventListener("click", () => {
    state.draftFields = X.DEFAULT_FIELDS.map((f) => ({ ...f, syn: [...f.syn] }));
    const host = $("#fieldRows");
    host.innerHTML = "";
    for (const f of state.draftFields) host.appendChild(fieldRow(f));
  });
  $("#btnAddField").addEventListener("click", () => {
    const f = { key: `c_${Date.now().toString(36)}`, label: "", type: "text", enabled: true, syn: [] };
    state.draftFields.push(f);
    const row = fieldRow(f);
    $("#fieldRows").appendChild(row);
    row.querySelector("input[type=text]").focus();
  });

  window.addEventListener("beforeunload", (e) => {
    if (state.docs.length) { e.preventDefault(); e.returnValue = ""; }
  });

  // Para testes: window.MBLite.addFiles(fileList)
  window.MBLite = { addFiles, state, readPdf };
})();
