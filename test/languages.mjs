/**
 * languages.mjs — map-mode round-trip coverage across the languages detect() supports.
 *
 * validate.mjs covers JSON/CSV/NDJSON/Markdown plus a JS+Python code map. This extends
 * the map path to Go, Rust, Java, CSS, and HTML so codeTables() symbol/import extraction
 * is round-tripped through the REFERENCE decoder for each language family — closing the
 * detect()/LANG_RULES coverage gap the adversarial audit flagged.
 *
 * The expected symbol names below were OBSERVED from the shipped engine, not assumed.
 *
 * Run: node test/languages.mjs
 */
import { decode } from './factspack.bundle.mjs';
import { convert } from './harness.mjs';

const CASES = [
  {
    lang: 'go',
    src: 'package main\n\nimport "fmt"\n\nfunc Hello() {}\nfunc World() { fmt.Println() }\ntype Server struct{}\n',
    expect: ['Hello', 'World', 'Server'],
  },
  {
    lang: 'rust',
    src: 'use std::io;\n\npub fn run() -> i32 { let mut x = 0; x }\npub struct Config {}\n',
    expect: ['run', 'Config'],
  },
  {
    lang: 'java',
    src: 'package com.app;\nimport java.util.List;\npublic class Foo {\n  public void bar() {}\n}\n',
    expect: ['Foo', 'bar'],
  },
  {
    lang: 'css',
    src: '.btn { color: red; }\n#main { margin: 0; }\n',
    expect: ['.btn', '#main'],
  },
  {
    lang: 'html',
    src: '<!doctype html>\n<html><head><script src="a.js"></script></head>\n<body><h1>Title</h1><div id="m">x</div></body></html>\n',
    expect: ['Title'],
  },
];

let failed = 0;
for (const cse of CASES) {
  const notes = [];
  let status = 'PASS';
  try {
    const { pack, mode } = await convert(cse.src);
    if (mode !== 'map') throw new Error(`expected map mode, got ${mode}`);
    const d = decode(pack); // the reference decoder must accept the emitted map-pack
    if (d.header.schema !== 'map-v1') throw new Error(`schema ${d.header.schema}, expected map-v1`);
    const syms = d.tables.get('symbols');
    if (!syms) throw new Error('no symbols table in decoded map');
    const names = syms.rows.map((r) => r[2]);
    for (const want of cse.expect) {
      if (!names.includes(want)) throw new Error(`missing symbol '${want}' in [${names.join(', ')}]`);
    }
    notes.push(`${names.length} symbols: ${names.join(', ')}`);
  } catch (e) {
    status = 'FAIL';
    failed++;
    notes.push(e.message);
  }
  console.log(`${status === 'PASS' ? '✅' : '❌'} ${cse.lang}${notes.length ? '  · ' + notes.join(' · ') : ''}`);
}
console.log(`\n${CASES.length - failed}/${CASES.length} language map round-trips pass against the reference decoder`);
process.exit(failed ? 1 : 0);
