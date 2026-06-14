/**
 * build-bundle.mjs — regenerate test/factspack.bundle.mjs from the upstream
 * reference codec via esbuild.
 *
 * The bundle is a vendored, dependency-free single-file copy of
 * `../claude/factstack/packages/factspack/src` so this repo's Node tests run the
 * EXACT reference codec without a workspace install. It is the REFERENCE side of
 * every parity/conformance assertion, so it must never silently drift from
 * source: re-run this after any codec change, and the drift guard
 * (conformance BUNDLE-DRIFT) runs it with --check and fails on any divergence.
 *
 * Requires the sibling factstack repo at ../claude/factstack and `npx esbuild`.
 *
 * Run:  node test/build-bundle.mjs            (write)
 *       node test/build-bundle.mjs --check     (verify; exit 1 on drift)
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FACTSTACK = resolve(__dirname, '..', '..', 'claude', 'factstack');
// Entry (test/_bundle-entry.ts) re-exports the codec's tracked public API PLUS
// the vendored encodeAuto. It lives in facts-pack (the codec tooling prunes new
// codec files); esbuild resolves its cross-dir .js→.ts imports into the codec.
const ENTRY = join(__dirname, '_bundle-entry.ts');
const OUT = join(__dirname, 'factspack.bundle.mjs');

/** esbuild the codec to a STRING (stdout, no --outfile) so write and --check
 *  compare the exact same bytes. The codec is dependency-free now, so
 *  --external:node:crypto is a harmless no-op kept for safety. cwd is the
 *  factstack repo only so `npx esbuild` resolves; the ENTRY is absolute and its
 *  imports resolve relative to the entry file, not cwd. */
function build() {
  const cmd =
    `npx esbuild "${ENTRY}" --bundle --format=esm --platform=node --external:node:crypto`;
  const r = spawnSync(cmd, { cwd: FACTSTACK, encoding: 'utf8', shell: true });
  if (r.status !== 0) {
    process.stderr.write((r.stderr || 'esbuild failed') + '\n');
    process.exit(r.status ?? 1);
  }
  return r.stdout;
}

const check = process.argv.includes('--check');
const out = build();

if (check) {
  let current = '';
  try { current = readFileSync(OUT, 'utf8'); } catch { /* missing ⇒ drift */ }
  if (current !== out) {
    process.stderr.write(
      'BUNDLE DRIFT: test/factspack.bundle.mjs differs from a fresh build of the upstream codec.\n' +
        'Run: node test/build-bundle.mjs\n',
    );
    process.exit(1);
  }
  console.log('vendored bundle is up to date with source');
  process.exit(0);
}
writeFileSync(OUT, out);
console.log(`Regenerated ${OUT} from ${FACTSTACK}/${ENTRY}`);
