/**
 * Envio em lote: arquivos soltos, seleção múltipla ou pasta inteira (inclusive subpastas
 * arrastadas). Só PDFs entram; o servidor valida de novo cada arquivo.
 */

/** Executa as tarefas com no máximo `limit` ao mesmo tempo; falha de uma não para as outras. */
export async function runPool<T>(items: readonly T[], limit: number, task: (item: T, index: number) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      try {
        await task(items[i]!, i);
      } catch {
        // A própria tarefa registra o erro; aqui só garantimos que o lote continua.
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

export function isPdfName(name: string): boolean {
  return /\.pdf$/i.test(name);
}

/** Separa PDFs dos demais arquivos (ignorados com aviso: DWG ainda não é lido). */
export function splitPdfs(files: readonly File[]): { pdfs: File[]; ignored: File[] } {
  const pdfs: File[] = [];
  const ignored: File[] = [];
  for (const f of files) (isPdfName(f.name) || f.type === "application/pdf" ? pdfs : ignored).push(f);
  return { pdfs, ignored };
}

type Entry = FileSystemEntry;

function readEntries(dir: FileSystemDirectoryEntry): Promise<Entry[]> {
  const reader = dir.createReader();
  const all: Entry[] = [];
  return new Promise((resolve, reject) => {
    const step = () =>
      reader.readEntries((batch) => {
        if (batch.length === 0) resolve(all);
        else {
          all.push(...batch);
          step();
        }
      }, reject);
    step();
  });
}

async function walk(entry: Entry, out: File[]): Promise<void> {
  if (entry.isFile) {
    out.push(await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject)));
  } else if (entry.isDirectory) {
    for (const child of await readEntries(entry as FileSystemDirectoryEntry)) await walk(child, out);
  }
}

/** Arquivos de um "arrastar e soltar", abrindo pastas recursivamente. */
export async function filesFromDrop(dt: DataTransfer): Promise<File[]> {
  const entries = [...dt.items]
    .map((i) => (typeof i.webkitGetAsEntry === "function" ? i.webkitGetAsEntry() : null))
    .filter((e): e is Entry => e !== null);
  if (entries.length === 0) return [...dt.files];
  const out: File[] = [];
  for (const e of entries) await walk(e, out);
  return out;
}
