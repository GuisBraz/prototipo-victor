/**
 * Gerador mínimo de .xlsx (Office Open XML) sem dependências: um zip sem compressão ("stored")
 * com as partes obrigatórias. Suficiente para planilhas simples de texto e números.
 */

export type Cell = string | number | null;
export interface Sheet {
  name: string;
  rows: Cell[][];
  /** Larguras de coluna em caracteres. */
  widths?: number[];
  /** Linhas (a partir de 0) em negrito. */
  boldRows?: number[];
  /** Colunas numéricas que usam 2 casas decimais. */
  decimalColumns?: number[];
}

const enc = new TextEncoder();

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of data) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Remove caracteres de controle inválidos em XML 1.0 (mantém tab, LF e CR). */
const stripControl = (s: string) =>
  Array.from(s).filter((c) => { const n = c.charCodeAt(0); return n >= 32 || n === 9 || n === 10 || n === 13; }).join("");

const esc = (s: string) =>
  stripControl(s).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);

export function columnLetter(index: number): string {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function sheetXml(sheet: Sheet): string {
  const bold = new Set(sheet.boldRows ?? []);
  const dec = new Set(sheet.decimalColumns ?? []);
  const cols = sheet.widths?.length
    ? `<cols>${sheet.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>`
    : "";
  const rows = sheet.rows
    .map((row, r) => {
      const cells = row
        .map((v, c) => {
          if (v === null) return "";
          const ref = `${columnLetter(c)}${r + 1}`;
          const style = bold.has(r) ? 1 : typeof v === "number" && dec.has(c) ? 2 : 0;
          const s = style ? ` s="${style}"` : "";
          return typeof v === "number"
            ? `<c r="${ref}"${s}><v>${Number.isFinite(v) ? v : 0}</v></c>`
            : `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
        })
        .join("");
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${cols}<sheetData>${rows}</sheetData></worksheet>`;
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

/** Nomes de aba: até 31 caracteres e sem \ / ? * [ ] : */
export function safeSheetName(name: string): string {
  return name.replace(/[\\/?*[\]:]/g, " ").slice(0, 31).trim() || "Planilha";
}

export function buildXlsx(sheets: Sheet[]): Uint8Array<ArrayBuffer> {
  const parts: Record<string, string> = {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets
      .map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
      .join("")}</Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets
      .map((s, i) => `<sheet name="${esc(safeSheetName(s.name))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
      .join("")}</sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
      .map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
      .join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    "xl/styles.xml": STYLES,
  };
  sheets.forEach((s, i) => {
    parts[`xl/worksheets/sheet${i + 1}.xml`] = sheetXml(s);
  });
  return zipStored(Object.entries(parts).map(([name, text]) => ({ name, data: enc.encode(text) })));
}

/** Zip "stored" (sem compressão), com diretório central e fim de diretório. */
export function zipStored(files: { name: string; data: Uint8Array }[]): Uint8Array<ArrayBuffer> {
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const u16 = (v: number) => [v & 0xff, (v >>> 8) & 0xff];
  const u32 = (v: number) => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
  const DOS_TIME = 0;
  const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1; // 01/01/2026, fixo para o arquivo ser reprodutível

  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const header = Uint8Array.from([
      ...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(DOS_TIME), ...u16(DOS_DATE),
      ...u32(crc), ...u32(f.data.length), ...u32(f.data.length), ...u16(name.length), ...u16(0),
    ]);
    chunks.push(header, name, f.data);
    central.push(
      Uint8Array.from([
        ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(DOS_TIME), ...u16(DOS_DATE),
        ...u32(crc), ...u32(f.data.length), ...u32(f.data.length), ...u16(name.length), ...u16(0), ...u16(0),
        ...u16(0), ...u16(0), ...u32(0), ...u32(offset),
      ]),
      name,
    );
    offset += header.length + name.length + f.data.length;
  }
  const centralSize = central.reduce((s, c) => s + c.length, 0);
  const end = Uint8Array.from([
    ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length),
    ...u32(centralSize), ...u32(offset), ...u16(0),
  ]);
  const all = [...chunks, ...central, end];
  const out = new Uint8Array(new ArrayBuffer(all.reduce((s, c) => s + c.length, 0)));
  let p = 0;
  for (const c of all) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}
