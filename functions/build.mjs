/**
 * Empacota as functions para deploy e para o emulador.
 *
 * O Cloud Build instala as dependências a partir do npm e não enxerga o
 * workspace local `@mecabom/shared`. Por isso o código do workspace (e o zod)
 * é embutido no bundle, e só o SDK do Firebase fica como dependência externa.
 *
 * Saída em `functions/bundle/` (fonte do deploy em firebase.json):
 *   - index.js (+ .map)
 *   - package.json gerado, sem dependências de workspace e com versões exatas
 */
import { build } from "esbuild";
import { existsSync, readFileSync } from "node:fs";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const outdir = join(root, "bundle");
const require = createRequire(import.meta.url);

/**
 * Pacotes que o Cloud Build instala; todo o resto é embutido.
 * pdf.js carrega o worker e o canvas dinamicamente, e @napi-rs/canvas é binário nativo.
 */
const EXTERNAL = ["firebase-admin", "firebase-functions", "pdfjs-dist", "@napi-rs/canvas"];

const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });

const result = await build({
  entryPoints: [join(root, "src/index.ts")],
  outfile: join(outdir, "index.js"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  sourcemap: true,
  // Marcar o pacote como externo também marca os subcaminhos (firebase-admin/app etc.).
  external: EXTERNAL,
  // Bibliotecas CommonJS embutidas em ESM podem chamar require().
  banner: { js: 'import { createRequire as __cr } from "node:module"; const require = __cr(import.meta.url);' },
  metafile: true,
  logLevel: "warning",
});

// Garante que nenhum import externo inesperado (ex.: workspace) escapou do bundle.
const isAllowed = (path) =>
  path.startsWith("node:") ||
  EXTERNAL.some((name) => path === name || path.startsWith(`${name}/`));
const unexpected = new Set();
for (const output of Object.values(result.metafile.outputs)) {
  for (const imp of output.imports) {
    if (imp.external && !isAllowed(imp.path)) unexpected.add(imp.path);
  }
}
if (unexpected.size > 0) {
  console.error(`Imports externos não permitidos no bundle: ${[...unexpected].join(", ")}`);
  process.exit(1);
}

/** Versão instalada de fato, para o deploy usar a mesma que os testes. */
function installedVersion(name) {
  const entry = require.resolve(name);
  let dir = dirname(entry);
  while (!dir.endsWith(join("node_modules", name))) dir = dirname(dir);
  return JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).version;
}

const deployPkg = {
  name: "mecabom-functions",
  private: true,
  type: "module",
  main: "index.js",
  engines: pkg.engines,
  dependencies: Object.fromEntries(EXTERNAL.map((name) => [name, installedVersion(name)])),
};
await writeFile(join(outdir, "package.json"), `${JSON.stringify(deployPkg, null, 2)}\n`);

// Emulador: segredos locais (chave da API) ficam em functions/.secret.local, fora do Git.
// O deploy ignora "*.local" (firebase.json), então a cópia nunca sobe.
if (existsSync(join(root, ".secret.local"))) {
  await copyFile(join(root, ".secret.local"), join(outdir, ".secret.local"));
}

console.log(`Bundle gerado em ${outdir} (externas: ${Object.entries(deployPkg.dependencies).map(([n, v]) => `${n}@${v}`).join(", ")})`);
