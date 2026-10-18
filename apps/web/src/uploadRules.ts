import { MAX_PDF_BYTES } from "@mecabom/shared";

/**
 * Pré-validação no navegador: só melhora a experiência (resposta rápida).
 * NÃO é segurança — o servidor valida de novo o conteúdo real do arquivo.
 */
export function prevalidateFile(file: { name: string; size: number; type: string }): string | null {
  if (file.size === 0) return "O arquivo está vazio.";
  const looksLikePdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  if (!looksLikePdf) return "Apenas arquivos PDF são aceitos.";
  if (file.size > MAX_PDF_BYTES) {
    return `O arquivo excede o limite de ${Math.round(MAX_PDF_BYTES / (1024 * 1024))} MB.`;
  }
  return null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
