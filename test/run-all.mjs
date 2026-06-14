/**
 * run-all.mjs — one entry point for the whole FactsPack test battery.
 *
 * Nine suites, two languages, one exit code:
 *   1. validate.mjs    — shipped web engine round-tripped through the reference decoder (strict)
 *   2. languages.mjs   — map-mode round-trips for Go/Rust/Java/CSS/HTML vs the decoder
 *   3. oracle.mjs      — independent EXACT round-trip oracle (no shared normalization; U4)
 *   4. conformance.mjs — Gate 1: in-process determinism, golden vectors, canonical round-trip,
 *                        cross-encoder semantic parity, inlined-codec drift guard
 *   5. parity.mjs      — the browser's inlined encoder === the reference codec, byte-for-byte
 *   6. grounding.mjs   — the v0.2a contract repair, proven against observable bytes + experiments
 *   7. security.mjs    — codec injection/integrity/parser defenses + web-app hardening,
 *                        with residual consumer-side gaps flagged (not failed)
 *   8. webapp/test_next_steps_v2.py — the v2 review page's interactive behaviour (Playwright)
 *   9. webapp/test_landing_app.py   — the shipped converter app + reachable pages (Playwright)
 *
 * Codec changes live upstream (../claude/factstack); regenerate the vendored bundle with
 * `node test/build-bundle.mjs` and the example fixtures with `node test/build-fixtures.mjs`.
 *
 * Run: node test/run-all.mjs
 * Exit 0 iff every suite passes. The Python suites are skipped (not failed) if no
 * Python/Playwright is available, so the Node suites still gate on machines without it.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

function run(cmd, args, cwd = __dirname) {
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: false });
  return r;
}

/** Resolve a working Python interpreter, or null if none can import playwright. */
function findPython() {
  for (const cmd of ['python', 'python3', 'py']) {
    const probe = spawnSync(cmd, ['-c', 'import playwright'], { stdio: 'ignore', shell: false });
    if (probe.status === 0) return cmd;
  }
  return null;
}

const suites = [];
function section(title) {
  console.log('\n' + '═'.repeat(64) + '\n' + title + '\n' + '═'.repeat(64));
}

// Node suites — order matters only for readability; numbering is derived so adding a
// suite can never desync the labels.
const py = findPython();
const webapp = join(__dirname, 'webapp');
const nodeSuites = [
  ['validate.mjs', 'web engine vs reference decoder (strict)'],
  ['languages.mjs', 'per-language map round-trips'],
  ['oracle.mjs', 'independent EXACT round-trip oracle (U4)'],
  ['conformance.mjs', 'Gate 1 conformance — determinism, golden vectors, parity'],
  ['parity.mjs', 'browser inlined codec === reference codec (byte parity)'],
  ['grounding.mjs', 'v0.2a contract repair, proven vs observable bytes'],
  ['security.mjs', 'codec + web-app security regression'],
];
const pySuites = [
  ['test_next_steps_v2.py', 'v2 review UI (Playwright)'],
  ['test_landing_app.py', 'shipped converter app + reachable pages (Playwright)'],
];
const total = nodeSuites.length + pySuites.length;
let n = 0;

for (const [name, desc] of nodeSuites) {
  section(`${++n}/${total} · ${name} — ${desc}`);
  suites.push({ name, status: run('node', [name]).status });
}

for (const [name, desc] of pySuites) {
  if (py) {
    section(`${++n}/${total} · webapp/${name} — ${desc}`);
    suites.push({ name, status: run(py, [name], webapp).status });
  } else {
    section(`${++n}/${total} · webapp/${name} — SKIPPED (no Python/Playwright)`);
    console.log('Install: pip install playwright && playwright install chromium');
    suites.push({ name, status: 'skip' });
  }
}

// --- Aggregate ---
section('SUMMARY');
let failed = 0;
for (const s of suites) {
  const ok = s.status === 0;
  const skip = s.status === 'skip';
  if (!ok && !skip) failed++;
  console.log(`  ${skip ? '⏭️  SKIP' : ok ? '✅ PASS' : '❌ FAIL'}  ${s.name}`);
}
console.log(
  failed === 0
    ? '\nAll runnable suites pass. Findings are grounded in observable bytes, not assertion.'
    : `\n${failed} suite(s) failed — see output above.`
);
process.exit(failed ? 1 : 0);
