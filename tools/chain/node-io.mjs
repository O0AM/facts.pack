/**
 * node-io.mjs — the disk ADAPTER for the chain's `io` seam (the contract is documented on
 * ChainStore in store.mjs). It lives here, not in store.mjs, so the producer stays
 * io-agnostic (no node:fs coupling), and not in cli.mjs, so it is importable/testable
 * without running the CLI. Conformance is proven by test/ioadapter.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';

/** A disk-backed io adapter rooted at `dir` (created if missing). */
export function nodeFsIO(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const full = (name) => path.join(dir, name);
  return {
    // The contract is "missing -> null, I/O error -> throw". A regular file's bytes, else
    // null — including when the name is shadowed by a DIRECTORY (existsSync is true for a
    // dir, and a bare readFileSync would throw EISDIR and crash the integrity gate verify()).
    read: (name) => {
      let st;
      try { st = fs.statSync(full(name)); } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
      return st.isFile() ? fs.readFileSync(full(name), 'utf8') : null;
    },
    write: (name, data) => fs.writeFileSync(full(name), data),
    // Only regular files are chain state; a stray directory whose name matches a link
    // pattern must not skew nextSeq() or make prune() try (and fail) to rm a directory.
    list: () => fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isFile()).map((d) => d.name),
    remove: (name) => fs.rmSync(full(name), { force: true }),
  };
}
