#!/usr/bin/env node
/**
 * cli.mjs — command-line driver for the FactsPack master/diff chain producer.
 *
 *   node tools/chain/cli.mjs add <pack-file> --dir <dir> [--key N] [--ratio 0.5] [--max 24]
 *   node tools/chain/cli.mjs head    --dir <dir> [--out <file>] [--key N]
 *   node tools/chain/cli.mjs verify  --dir <dir>
 *   node tools/chain/cli.mjs manifest --dir <dir>
 *
 * `add` appends a full snapshot pack to the chain, automatically emitting a tiny
 * diff or re-mastering at the measured break-even. The snapshot's column-1 PK
 * must be stable across snapshots (file paths are; line-number ids are not).
 */
import fs from 'node:fs';
import process from 'node:process';
import { ChainStore, parseManifest, MANIFEST } from './store.mjs';
import { nodeFsIO } from './node-io.mjs';

function parseFlags(args) {
  const flags = {}, pos = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) { const k = a.slice(2); const hasVal = i + 1 < args.length && !args[i + 1].startsWith('--'); flags[k] = hasVal ? args[++i] : true; }
    else pos.push(a);
  }
  return { flags, pos };
}

const USAGE = `FactsPack chain producer — maintain a master/diff chain of codebase-map snapshots.
  add <pack-file> --dir <dir> [--key N] [--ratio 0.5] [--max 24]   append a snapshot (diff or re-master, auto)
  head            --dir <dir> [--out <file>] [--key N]             reconstruct the latest state
  verify          --dir <dir>                                      check the chain's hash integrity
  manifest        --dir <dir>                                      list the chain links
  prune           --dir <dir>                                      delete pack files orphaned by re-masters`;

const [, , cmd, ...rest] = process.argv;
const { flags, pos } = parseFlags(rest);
function die(msg, code = 2) { console.error('error: ' + msg); process.exit(code); }
// A value-bearing flag must carry a STRING; a bare trailing `--out` (or `--out --dir …`)
// parses as boolean `true`, which must be a clear usage error — not a file named "true".
function strFlag(name) { const v = flags[name]; if (v === undefined) return undefined; if (typeof v !== 'string') die(`--${name} requires a value`); return v; }
function numFlag(name, dflt) { const v = strFlag(name); if (v === undefined) return dflt; if (!/^-?\d+(\.\d+)?$/.test(v)) die(`--${name} must be a number, got "${v}"`); return Number(v); }
const dir = strFlag('dir');
const opts = { keyIndex: numFlag('key', 0), coalesceRatio: numFlag('ratio', 0.5), maxChainLen: numFlag('max', 24) };
function store() { if (!dir) die('--dir <chain-directory> is required'); return new ChainStore(nodeFsIO(dir), opts); }

try {
  if (cmd === 'add') {
    if (!pos[0]) die('usage: add <pack-file> --dir <dir>');
    const r = store().add(fs.readFileSync(pos[0], 'utf8'), opts);
    if (r.action === 'diff') console.error(`diff: ${r.bytes} B vs full map ${r.masterBytes} B — ${Math.round((1 - r.bytes / r.masterBytes) * 100)}% smaller (${r.file})`);
    else if (r.action === 'master') console.error(`master (${r.reason}): ${r.bytes} B (${r.file})`);
    else console.error('no change — snapshot identical to head');
    console.log(JSON.stringify(r));
  } else if (cmd === 'head') {
    const s = store();
    const state = s.head(opts);
    let total = 0; const lines = [];
    for (const [name, t] of state) { total += t.rows.length; lines.push(`  ${name}: ${t.rows.length} rows`); }
    console.error(`head = ${state.size} table(s), ${total} rows:\n${lines.join('\n')}`);
    const out = strFlag('out');
    if (out) { fs.writeFileSync(out, s.reconstructPack(opts)); console.error(`wrote reconstructed master -> ${out}`); }
  } else if (cmd === 'verify') {
    const v = store().verify();
    if (v.ok) console.log(`OK — ${v.links} link(s), chain intact`);
    else { console.error(`FAIL — ${v.errors.length} problem(s):`); v.errors.forEach((e) => console.error('  ' + e)); process.exit(1); }
  } else if (cmd === 'manifest') {
    if (!dir) die('--dir <chain-directory> is required');
    const raw = nodeFsIO(dir).read(MANIFEST);
    if (!raw) die('no manifest.pack in ' + dir);
    for (const l of parseManifest(raw)) {
      console.log(`${String(l.seq).padStart(3)}  ${l.kind.padEnd(6)} ${l.file.padEnd(16)} sha=${l.sha} parent=${l.parent ?? '-'} rows=${l.rows}`);
    }
  } else if (cmd === 'prune') {
    const r = store().prune();
    console.log(r.removed.length ? `pruned ${r.removed.length} orphaned file(s): ${r.removed.join(', ')}` : 'nothing to prune');
  } else {
    console.error(USAGE);
    process.exit(cmd ? 2 : 0);
  }
} catch (e) { die((e && e.message) || String(e)); }
