// ../claude/factstack/packages/factspack/src/encode.ts
import { createHash } from "node:crypto";

// ../claude/factstack/packages/factspack/src/escape.ts
function escapeCell(s) {
  let needsEscape = false;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 9 || c === 10 || c === 92) {
      needsEscape = true;
      break;
    }
  }
  if (!needsEscape) return s;
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 9) out += "\\t";
    else if (c === 10) out += "\\n";
    else if (c === 92) out += "\\\\";
    else out += s[i];
  }
  return out;
}
function unescapeCell(s) {
  if (s.indexOf("\\") < 0) return s;
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c !== 92) {
      out += s[i];
      continue;
    }
    if (i + 1 >= s.length) {
      throw new PackEscapeError(
        `Unterminated escape sequence at end of cell: ${truncate(s)}`
      );
    }
    const n = s.charCodeAt(i + 1);
    if (n === 116) out += "	";
    else if (n === 110) out += "\n";
    else if (n === 92) out += "\\";
    else {
      throw new PackEscapeError(
        `Unknown escape \\${s[i + 1]} in cell: ${truncate(s)}`
      );
    }
    i++;
  }
  return out;
}
var PackEscapeError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "PackEscapeError";
  }
};
function truncate(s, max = 80) {
  return s.length <= max ? s : s.slice(0, max) + "\u2026";
}

// ../claude/factstack/packages/factspack/src/types.ts
function isInternedColumn(colName) {
  if (colName.length === 0) return false;
  const c = colName.charCodeAt(0);
  return c >= 65 && c <= 90;
}

// ../claude/factstack/packages/factspack/src/encode.ts
var PackEncodeError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "PackEncodeError";
  }
};
function encode(opts) {
  const enc = new Encoder();
  const tableLines = [];
  for (const table of opts.tables) {
    enc.assertSchemaShape(table.name, table.columns, table.rows);
    tableLines.push(declSchemaLine(table.name, table.columns));
    for (const row of table.rows) {
      tableLines.push(rowLine("-", row, table.columns, enc));
    }
  }
  const total = opts.tables.reduce((s, t) => s + t.rows.length, 0);
  const headerOut = renderHeader({
    ...opts.header,
    rowCount: opts.header.rowCount ?? total
  });
  return assemble(headerOut, metaLines(opts.meta, enc), enc.dictLines(), tableLines, {
    rows: total,
    tables: distinctTableCount(opts.tables)
  });
}
function encodeIncremental(opts) {
  const enc = new Encoder();
  const tableLines = [];
  for (const table of opts.tables) {
    enc.assertSchemaShape(table.name, table.columns, table.addedRows);
    tableLines.push(declSchemaLine(table.name, table.columns));
    for (const row of table.addedRows) {
      tableLines.push(rowLine("+", row, table.columns, enc));
    }
    for (const id of table.deletedIds) {
      assertNotEmpty(id, `Deleted id in table ${table.name} is empty`);
      tableLines.push(`x ${escapeCell(id)}`);
    }
  }
  const headerOut = renderHeader({
    ...opts.header,
    rowCount: opts.header.rowCount ?? 0
  });
  const total = opts.tables.reduce((s, t) => s + t.addedRows.length + t.deletedIds.length, 0);
  return assemble(headerOut, metaLines(opts.meta, enc), enc.dictLines(), tableLines, {
    rows: total,
    tables: distinctTableCount(opts.tables)
  });
}
function renderHeader(h) {
  for (const [k, v] of Object.entries({ producer: h.producer, schema: h.schema, snapshotId: h.snapshotId })) {
    if (typeof v !== "string" || v.length === 0) {
      throw new PackEncodeError(`Header.${k} must be a non-empty string`);
    }
    if (v.indexOf("	") >= 0 || v.indexOf("\n") >= 0) {
      throw new PackEncodeError(`Header.${k} must not contain tab or newline`);
    }
  }
  const rc = h.rowCount === null ? "-" : String(h.rowCount);
  return `# ${h.producer}	${h.schema}	${h.snapshotId}	${rc}${renderHeaderExtras(h)}`;
}
function renderHeaderExtras(h) {
  if (h.seq === void 0 && h.parent === void 0 && h.kind === void 0 && h.generated === void 0) {
    return "";
  }
  if (h.seq !== void 0 && (!Number.isInteger(h.seq) || h.seq < 0)) {
    throw new PackEncodeError(`Header.seq must be a non-negative integer, got ${h.seq}`);
  }
  if (h.kind !== void 0 && h.kind !== "master" && h.kind !== "diff") {
    throw new PackEncodeError(`Header.kind must be 'master' or 'diff', got '${h.kind}'`);
  }
  for (const [k, v] of Object.entries({ parent: h.parent, generated: h.generated })) {
    if (v === void 0) continue;
    if (typeof v !== "string" || v.length === 0 || v.indexOf("	") >= 0 || v.indexOf("\n") >= 0) {
      throw new PackEncodeError(`Header.${k} must be a non-empty string without tab/newline`);
    }
  }
  const slots = [
    h.seq !== void 0 ? String(h.seq) : "-",
    h.parent ?? "-",
    h.kind ?? "-",
    h.generated ?? "-"
  ];
  let last = slots.length - 1;
  const defined = [h.seq !== void 0, h.parent !== void 0, h.kind !== void 0, h.generated !== void 0];
  while (last >= 0 && !defined[last]) last--;
  return "	" + slots.slice(0, last + 1).join("	");
}
function declSchemaLine(name, columns) {
  if (!name || name.indexOf("	") >= 0 || name.indexOf("\n") >= 0) {
    throw new PackEncodeError(`Table name '${name}' is invalid (empty or contains tab/newline)`);
  }
  for (const c of columns) {
    if (!c.name || c.name.indexOf("	") >= 0 || c.name.indexOf("\n") >= 0) {
      throw new PackEncodeError(`Column name '${c.name}' is invalid (empty or contains tab/newline)`);
    }
    if (c.internGroup !== void 0) {
      if (!isInternedColumn(c.name)) {
        throw new PackEncodeError(
          `Column '${c.name}' is literal (lowercase) but declares internGroup '${c.internGroup}'`
        );
      }
      if (!c.internGroup || /[\t\n =]/.test(c.internGroup)) {
        throw new PackEncodeError(
          `internGroup '${c.internGroup}' on column '${c.name}' is invalid (empty or contains tab/newline/space/'=')`
        );
      }
    }
  }
  return `& ${name}	${columns.map((c) => c.name).join("	")}`;
}
function rowLine(prefix, row, columns, enc) {
  const cells = row.map((cell, i) => {
    const col = columns[i];
    if (cell === null) return "-";
    if (cell === "") return "";
    if (isInternedColumn(col.name)) {
      return enc.intern(col, cell);
    }
    if (cell === "-") {
      throw new PackEncodeError(
        `Literal column '${col.name}' cell is exactly "-" \u2014 it would decode as null (spec \xA710/S12); map it to a sentinel at the producer`
      );
    }
    return escapeCell(cell);
  });
  return `${prefix} ${cells.join("	")}`;
}
function metaLines(meta, enc) {
  const out = [];
  for (const text of meta?.legend ?? []) {
    if (text.indexOf("\n") >= 0) {
      throw new PackEncodeError("Legend lines must not contain newlines (one entry per line)");
    }
    out.push(`; ${text}`);
  }
  if (meta?.hot) {
    const hot = enc.hotLine(meta.hot.group, meta.hot.top ?? 20);
    if (hot) out.push(hot);
  }
  return out;
}
function distinctTableCount(tables) {
  return new Set(tables.map((t) => t.name)).size;
}
function assemble(headerLine, metaOut, dictLines, tableLines, totals) {
  const parts = [headerLine];
  if (metaOut.length > 0) parts.push(...metaOut);
  if (dictLines.length > 0) parts.push(...dictLines);
  if (tableLines.length > 0) parts.push(...tableLines);
  const body = parts.join("\n") + "\n";
  const sha = createHash("sha256").update(body, "utf8").digest("hex").slice(0, 12);
  return `${body}; end rows=${totals.rows} tables=${totals.tables} sha256=${sha}
`;
}
function assertNotEmpty(value, msg) {
  if (typeof value !== "string" || value.length === 0) {
    throw new PackEncodeError(msg);
  }
}
var Encoder = class {
  /** namespace → (literal → key). */
  maps = /* @__PURE__ */ new Map();
  /** namespace → next counter. */
  counters = /* @__PURE__ */ new Map();
  /** Dict lines in the order they were minted (preserves spec
   *  preference for "before first use" ordering when concatenated
   *  ahead of the table lines). */
  dict = [];
  /** v0.2 (S3) — per-key reference count + literal, for `; hot:`. */
  uses = /* @__PURE__ */ new Map();
  /** Validate that every row in `rows` has exactly `columns.length`
   *  cells. Spec §4.4: "Tab-separated cells, one per column." */
  assertSchemaShape(tableName, columns, rows) {
    const expected = columns.length;
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      if (row.length !== expected) {
        throw new PackEncodeError(
          `Table '${tableName}' row ${r}: expected ${expected} cells, got ${row.length}`
        );
      }
    }
  }
  /** Look up or mint the dictionary key for a literal. Newly-minted
   *  keys append a `@ K=V` line to `this.dict`. The namespace (and
   *  key prefix) is the column's internGroup when set, else its name. */
  intern(col, literal) {
    const ns = col.internGroup ?? col.name;
    let map = this.maps.get(ns);
    if (!map) {
      map = /* @__PURE__ */ new Map();
      this.maps.set(ns, map);
    }
    let key = map.get(literal);
    if (!key) {
      const next = (this.counters.get(ns) ?? 0) + 1;
      this.counters.set(ns, next);
      key = `${ns}${next}`;
      map.set(literal, key);
      this.dict.push(`@ ${key}=${escapeCell(literal)}`);
      this.uses.set(key, { ns, literal, count: 0 });
    }
    this.uses.get(key).count++;
    return key;
  }
  dictLines() {
    return this.dict;
  }
  /** v0.2 (S3) — `; hot: F12~cli.ts F7~engine.ts …` for the `top`
   *  most-referenced keys of namespace `ns`. Hint = basename of the
   *  literal (escaped). Returns null when the namespace is unused.
   *  Ties break by key number so output stays deterministic. */
  hotLine(ns, top) {
    const ranked = [...this.uses.entries()].filter(([, u]) => u.ns === ns).sort(([ka, a], [kb, b]) => b.count - a.count || Number(ka.slice(ns.length)) - Number(kb.slice(ns.length))).slice(0, top);
    if (ranked.length === 0) return null;
    const hints = ranked.map(([key, u]) => {
      const base = u.literal.slice(u.literal.lastIndexOf("/") + 1) || u.literal;
      return `${key}~${escapeCell(base)}`;
    });
    return `; hot: ${hints.join(" ")}`;
  }
};

// ../claude/factstack/packages/factspack/src/decode.ts
import { createHash as createHash2 } from "node:crypto";
var PackDecodeError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "PackDecodeError";
  }
};
function decode(text) {
  if (text.length > 0 && text.charCodeAt(0) === 65279) {
    throw new PackDecodeError("BOM detected at start of pack \u2014 forbidden by spec \xA710");
  }
  const lines = text.split("\n");
  let header = null;
  const dict = /* @__PURE__ */ new Map();
  const tables = /* @__PURE__ */ new Map();
  let active = null;
  const meta = [];
  let trailer = null;
  let offset = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineStart = offset;
    offset += line.length + 1;
    if (line.length === 0) continue;
    if (trailer !== null) {
      throw new PackDecodeError(
        `Line ${i + 1}: content after the \`; end\` trailer \u2014 the trailer must be the final line`
      );
    }
    const prefix = line.charCodeAt(0);
    if (line.length < 2 || line.charCodeAt(1) !== 32) {
      throw new PackDecodeError(
        `Line ${i + 1}: missing required space after prefix '${line[0]}'`
      );
    }
    const body = line.slice(2);
    switch (prefix) {
      case 35: {
        if (header !== null) {
          throw new PackDecodeError(`Line ${i + 1}: duplicate header`);
        }
        header = parseHeader(body, i + 1);
        break;
      }
      case 64: {
        const eq = body.indexOf("=");
        if (eq <= 0) {
          throw new PackDecodeError(`Line ${i + 1}: malformed @ entry (no '=' or empty key)`);
        }
        const key = body.slice(0, eq);
        const escapedValue = body.slice(eq + 1);
        if (dict.has(key)) {
          throw new PackDecodeError(
            `Line ${i + 1}: duplicate dictionary key '${key}' (re-defining keys is forbidden)`
          );
        }
        dict.set(key, escapedValue);
        break;
      }
      case 38: {
        const fields = body.split("	");
        const name = fields[0];
        if (!name) {
          throw new PackDecodeError(`Line ${i + 1}: schema declaration missing table name`);
        }
        const columns = fields.slice(1).map((n) => ({ name: n }));
        if (columns.length === 0) {
          throw new PackDecodeError(`Line ${i + 1}: schema for '${name}' has zero columns`);
        }
        const existing = tables.get(name);
        if (existing) {
          if (existing.columns.length !== columns.length || existing.columns.some((c, j) => c.name !== columns[j].name)) {
            throw new PackDecodeError(
              `Line ${i + 1}: schema for '${name}' redeclared with different columns`
            );
          }
          active = existing;
        } else {
          active = { name, columns, rows: [], addedRows: [], deletedIds: [] };
          tables.set(name, active);
        }
        break;
      }
      case 45: {
        if (!active) {
          throw new PackDecodeError(`Line ${i + 1}: row '-' with no active schema`);
        }
        const row = parseRow(body, active.columns, i + 1);
        active.rows.push(row);
        break;
      }
      case 43: {
        if (!active) {
          throw new PackDecodeError(`Line ${i + 1}: row '+' with no active schema`);
        }
        const row = parseRow(body, active.columns, i + 1);
        active.addedRows.push(row);
        break;
      }
      case 120: {
        if (!active) {
          throw new PackDecodeError(`Line ${i + 1}: row 'x' with no active schema`);
        }
        active.deletedIds.push(unescapeCell(body));
        break;
      }
      case 59: {
        const t = parseTrailer(body);
        if (t) {
          trailer = { ...t, lineNo: i + 1, start: lineStart };
        } else {
          meta.push(body);
        }
        break;
      }
      default: {
        const ch = String.fromCharCode(prefix);
        throw new PackDecodeError(
          `Line ${i + 1}: reserved-byte violation \u2014 unknown line prefix '${ch}'`
        );
      }
    }
  }
  if (!header) {
    throw new PackDecodeError("Pack has no `# header` line");
  }
  for (const table of tables.values()) {
    resolveRows(table.rows, table.columns, dict);
    resolveRows(table.addedRows, table.columns, dict);
  }
  if (trailer) {
    let rowsTotal = 0;
    for (const t of tables.values()) {
      rowsTotal += t.rows.length + t.addedRows.length + t.deletedIds.length;
    }
    if (rowsTotal !== trailer.rows) {
      throw new PackDecodeError(
        `Pack appears truncated or tampered: trailer says rows=${trailer.rows} but ${rowsTotal} data rows decoded`
      );
    }
    if (tables.size !== trailer.tables) {
      throw new PackDecodeError(
        `Pack appears truncated or tampered: trailer says tables=${trailer.tables} but ${tables.size} tables decoded`
      );
    }
    const sha = createHash2("sha256").update(text.slice(0, trailer.start), "utf8").digest("hex").slice(0, 12);
    if (sha !== trailer.sha256) {
      throw new PackDecodeError(
        `Pack appears truncated or tampered: trailer sha256=${trailer.sha256} but preceding bytes hash to ${sha}`
      );
    }
    return {
      header,
      tables,
      meta,
      trailer: { rows: trailer.rows, tables: trailer.tables, sha256: trailer.sha256 }
    };
  }
  return { header, tables, meta };
}
function parseTrailer(body) {
  const m = /^end rows=(\d+) tables=(\d+) sha256=([0-9a-f]{12})$/.exec(body);
  if (!m) return null;
  return { rows: Number(m[1]), tables: Number(m[2]), sha256: m[3] };
}
function parseHeader(body, lineNo) {
  const fields = body.split("	");
  if (fields.length < 4) {
    throw new PackDecodeError(
      `Line ${lineNo}: header has ${fields.length} fields, expected 4`
    );
  }
  const [producer, schema, snapshotId, rowCountField] = fields;
  if (!producer || !schema || !snapshotId) {
    throw new PackDecodeError(`Line ${lineNo}: header has empty required field`);
  }
  let rowCount;
  if (rowCountField === "-") {
    rowCount = null;
  } else {
    const n = Number(rowCountField);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
      throw new PackDecodeError(
        `Line ${lineNo}: header rowCount '${rowCountField}' is not a non-negative integer or '-'`
      );
    }
    rowCount = n;
  }
  const header = { producer, schema, snapshotId, rowCount };
  if (fields.length > 4 && fields[4] !== "-") {
    const seq = Number(fields[4]);
    if (fields[4] === "" || !Number.isInteger(seq) || seq < 0) {
      throw new PackDecodeError(
        `Line ${lineNo}: header seq '${fields[4]}' is not a non-negative integer or '-'`
      );
    }
    header.seq = seq;
  }
  if (fields.length > 5 && fields[5] !== "") {
    header.parent = fields[5];
  }
  if (fields.length > 6 && fields[6] !== "-" && fields[6] !== "") {
    const kind = fields[6];
    if (kind !== "master" && kind !== "diff") {
      throw new PackDecodeError(
        `Line ${lineNo}: header kind '${kind}' is not 'master', 'diff', or '-'`
      );
    }
    header.kind = kind;
  }
  if (fields.length > 7 && fields[7] !== "-" && fields[7] !== "") {
    header.generated = fields[7];
  }
  return header;
}
function parseRow(body, columns, lineNo) {
  const cells = body.split("	");
  if (cells.length !== columns.length) {
    throw new PackDecodeError(
      `Line ${lineNo}: row has ${cells.length} cells, schema expects ${columns.length}`
    );
  }
  return cells.map((raw, i) => {
    if (raw === "-") return null;
    if (raw === "") return "";
    const col = columns[i];
    if (isInternedColumn(col.name)) {
      return raw;
    }
    return unescapeCell(raw);
  });
}
function resolveRows(rows, columns, dict) {
  for (const row of rows) {
    for (let i = 0; i < row.length; i++) {
      const col = columns[i];
      if (!isInternedColumn(col.name)) continue;
      const cell = row[i];
      if (cell === null || cell === "") continue;
      const escaped = dict.get(cell);
      if (escaped === void 0) {
        throw new PackDecodeError(
          `Unresolved dictionary key '${cell}' in column '${col.name}'`
        );
      }
      row[i] = unescapeCell(escaped);
    }
  }
}
export {
  PackDecodeError,
  PackEncodeError,
  PackEscapeError,
  decode,
  encode,
  encodeIncremental,
  escapeCell,
  isInternedColumn,
  unescapeCell
};
