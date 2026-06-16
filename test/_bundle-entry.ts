/**
 * _bundle-entry.ts — the esbuild entry for the vendored test codec
 * (test/factspack.bundle.mjs), built by test/build-bundle.mjs.
 *
 * Re-exports the codec's full public API (its tracked index.ts) PLUS the
 * vendored `encodeAuto` producer profile (./_encode-auto.ts). encodeAuto cannot
 * currently live in the codec (its tooling prunes the file — see _encode-auto.ts),
 * so facts-pack owns it and bundles it alongside the codec here. Both this bundle
 * and the browser's inlined encoder build from the SAME _encode-auto.ts, so they
 * are byte-identical.
 */
export * from '../../claude/factstack/packages/factspack/src/index.js';
export { encodeAuto } from './_encode-auto.js';
export { computeDiff, applyChain, type AppliedTable } from './_chain.js';
