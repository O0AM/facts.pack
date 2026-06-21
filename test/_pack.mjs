/**
 * _pack.mjs — a THIN, transparent builder for the single-table MASTER packs the chain /
 * moniker suites build repeatedly. It is a wrapper, NOT a wizard: every wire-visible field
 * (producer, schema, snapshotId, table, columns, legend, rows) is declared by the caller, so
 * a test still shows exactly what bytes it builds. _pack.mjs only removes the
 * `encode({ header:{…}, meta:{legend}, tables:[{…}] })` scaffolding copied across suites.
 *
 * Multi-table or schema-varying packs (e.g. the schema-change tests in chainproducer.mjs)
 * stay inline on purpose — forcing them through here would hide the very shape they test.
 */
import { encode } from './factspack.bundle.mjs';

/** A master-pack header. snapshotId varies per call; the rest is the suite's fixed identity. */
export const makeHeader = (snapshotId, { producer, schema, rowCount = null, kind = 'master' }) =>
  ({ producer, schema, snapshotId, rowCount, kind });

/**
 * Encode a single-table master pack. The caller supplies the table name, its columns, the
 * legend line(s), and the rows — nothing is inferred. `legend` may be a string or an array.
 */
export const makePack = (snapshotId, { producer, schema, table, columns, legend, rows, rowCount = null }) =>
  encode({
    header: makeHeader(snapshotId, { producer, schema, rowCount }),
    meta: { legend: Array.isArray(legend) ? legend : [legend] },
    tables: [{ name: table, columns, rows }],
  });
