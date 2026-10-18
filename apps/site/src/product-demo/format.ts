const kg = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 12500 → "12,50". Pesos ficam em gramas inteiros para a soma ser exata. */
export function formatKg(grams: number): string {
  return kg.format(grams / 1000);
}

export function formatKgUnit(grams: number | null): string {
  return grams === null ? "—" : `${formatKg(grams)} kg`;
}

/** Minúsculas e sem acentos, para a busca ignorar maiúsculas e acentuação. */
export function normalizeText(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1).replace(".", ",")} KB`;
  return `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}
