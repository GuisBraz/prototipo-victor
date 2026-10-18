/** Interpolação suave (ease-out cúbica) de 0 até `value`; devolve sempre um inteiro e termina exatamente em `value`. */
export function countValue(value: number, progress: number): number {
  const p = Math.min(1, Math.max(0, progress));
  if (p >= 1) return value;
  return Math.round(value * (1 - Math.pow(1 - p, 3)));
}
