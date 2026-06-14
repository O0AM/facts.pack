/**
 * _report.mjs — shared tally + print + exit for the deferred-row Node test suites
 * (grounding, security, conformance).
 *
 * These three suites share one reporting shape: collect {state, title, detail} rows
 * as checks run, then at the end print each row with a state glyph, print a summary
 * line, and exit non-zero if any row is in a "fail" state. Only that boilerplate lives
 * here — each suite keeps its own domain vocabulary (states, glyphs, summary wording)
 * and its assertions exactly where they are, so the grounded-in-bytes intent is intact.
 *
 * The three streaming suites (validate, languages, oracle) print as they go with
 * suite-specific row shapes and are deliberately NOT funneled through this — sharing
 * would restructure their logic, not just move boilerplate.
 */

/**
 * @param {Record<string,string>} glyphs    state → glyph/prefix shown per row
 * @param {string[]} failStates             states that make the run exit non-zero
 */
export function ledger(glyphs, failStates) {
  const rows = [];
  const fail = new Set(failStates);
  return {
    /** Record one result row. Returns the state for convenience. */
    add(state, title, detail = '') {
      rows.push({ state, title, detail });
      return state;
    },
    /** How many rows are in `state`. */
    n(state) {
      return rows.filter((r) => r.state === state).length;
    },
    /**
     * Print every row, then `summaryLine(...)`, then exit non-zero on any fail-state row.
     * @param summaryLine ({ n, failed, total }) => string   the suite's summary text
     * @param opts.sort   sort rows by title before printing (id-prefixed titles sort by id)
     */
    finish(summaryLine, { sort = false } = {}) {
      const out = sort ? [...rows].sort((a, b) => (a.title < b.title ? -1 : 1)) : rows;
      for (const r of out) {
        console.log(`${glyphs[r.state] ?? '•'} ${r.title}` + (r.detail ? `\n      ${r.detail}` : ''));
      }
      const failed = rows.filter((r) => fail.has(r.state)).length;
      if (summaryLine) {
        console.log('\n' + summaryLine({ n: (s) => rows.filter((r) => r.state === s).length, failed, total: rows.length }));
      }
      process.exit(failed ? 1 : 0);
    },
  };
}
