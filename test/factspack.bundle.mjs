// packages/factspack/src/escape.ts
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

// packages/factspack/src/sha256.ts
var K = new Uint32Array([
  1116352408,
  1899447441,
  3049323471,
  3921009573,
  961987163,
  1508970993,
  2453635748,
  2870763221,
  3624381080,
  310598401,
  607225278,
  1426881987,
  1925078388,
  2162078206,
  2614888103,
  3248222580,
  3835390401,
  4022224774,
  264347078,
  604807628,
  770255983,
  1249150122,
  1555081692,
  1996064986,
  2554220882,
  2821834349,
  2952996808,
  3210313671,
  3336571891,
  3584528711,
  113926993,
  338241895,
  666307205,
  773529912,
  1294757372,
  1396182291,
  1695183700,
  1986661051,
  2177026350,
  2456956037,
  2730485921,
  2820302411,
  3259730800,
  3345764771,
  3516065817,
  3600352804,
  4094571909,
  275423344,
  430227734,
  506948616,
  659060556,
  883997877,
  958139571,
  1322822218,
  1537002063,
  1747873779,
  1955562222,
  2024104815,
  2227730452,
  2361852424,
  2428436474,
  2756734187,
  3204031479,
  3329325298
]);
function rotr(x, n) {
  return x >>> n | x << 32 - n;
}
function sha256hex(input) {
  const bytes = new TextEncoder().encode(input);
  const len = bytes.length;
  const bitLen = len * 8;
  const padded = (Math.floor((len + 8) / 64) + 1) * 64;
  const msg = new Uint8Array(padded);
  msg.set(bytes);
  msg[len] = 128;
  const view = new DataView(msg.buffer);
  view.setUint32(padded - 8, Math.floor(bitLen / 4294967296), false);
  view.setUint32(padded - 4, bitLen >>> 0, false);
  const h = new Uint32Array([
    1779033703,
    3144134277,
    1013904242,
    2773480762,
    1359893119,
    2600822924,
    528734635,
    1541459225
  ]);
  const w = new Uint32Array(64);
  for (let off = 0; off < padded; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const x = w[i - 15];
      const y = w[i - 2];
      const s0 = rotr(x, 7) ^ rotr(x, 18) ^ x >>> 3;
      const s1 = rotr(y, 17) ^ rotr(y, 19) ^ y >>> 10;
      w[i] = w[i - 16] + s0 + w[i - 7] + s1 | 0;
    }
    let a = h[0];
    let b = h[1];
    let c = h[2];
    let d = h[3];
    let e = h[4];
    let f = h[5];
    let g = h[6];
    let hh = h[7];
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = e & f ^ ~e & g;
      const t1 = hh + S1 + ch + K[i] + w[i] | 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = a & b ^ a & c ^ b & c;
      const t2 = S0 + maj | 0;
      hh = g;
      g = f;
      f = e;
      e = d + t1 | 0;
      d = c;
      c = b;
      b = a;
      a = t1 + t2 | 0;
    }
    h[0] = h[0] + a | 0;
    h[1] = h[1] + b | 0;
    h[2] = h[2] + c | 0;
    h[3] = h[3] + d | 0;
    h[4] = h[4] + e | 0;
    h[5] = h[5] + f | 0;
    h[6] = h[6] + g | 0;
    h[7] = h[7] + hh | 0;
  }
  let hex = "";
  for (let i = 0; i < 8; i++) hex += (h[i] >>> 0).toString(16).padStart(8, "0");
  return hex;
}

// packages/factspack/src/types.ts
function isInternedColumn(colName) {
  if (colName.length === 0) return false;
  const c = colName.charCodeAt(0);
  return c >= 65 && c <= 90;
}
var STRICT_DEFAULT_LIMITS = {
  maxBytes: 64 * 1024 * 1024,
  // 64 MiB
  maxLines: 5e6,
  maxRows: 5e6,
  maxColumns: 4096,
  maxTables: 65536,
  maxDictEntries: 5e6
};

// packages/factspack/src/encode.ts
var PackEncodeError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "PackEncodeError";
  }
};
function encode(opts) {
  if (opts.header.kind === "diff") {
    throw new PackEncodeError("encode() produces a 'master'; use encodeIncremental() for kind='diff'");
  }
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
  if (opts.header.rowCount != null && opts.header.rowCount !== total) {
    throw new PackEncodeError(
      `master header rowCount=${opts.header.rowCount} must equal the baseline row total ${total} (or be null)`
    );
  }
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
  if (opts.header.kind === "master") {
    throw new PackEncodeError("encodeIncremental() produces a 'diff'; use encode() for kind='master'");
  }
  if (opts.header.rowCount != null && opts.header.rowCount !== 0) {
    throw new PackEncodeError(
      `diff header rowCount must be the 0 sentinel (or null), got ${opts.header.rowCount}`
    );
  }
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
    rowCount: opts.header.rowCount ?? 0,
    /* v0.2a — this entry point ONLY produces diffs, so STAMP kind=diff on the
       wire even when the caller omits it. Without this a kindless diff header
       decodes as a master and the strict decoder rejects the encoder's own
       valid output (it carries +/x operations). */
    kind: "diff"
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
    if (/^end rows=\d+ tables=\d+ sha256=[0-9a-f]{12}$/.test(text)) {
      throw new PackEncodeError(
        `Legend line collides with the reserved \`; end\` trailer form: ${text}`
      );
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
  const sha = sha256hex(body).slice(0, 12);
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

// packages/factspack/src/decode.ts
var PackDecodeError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "PackDecodeError";
  }
};
function decode(text, opts) {
  const mode = opts?.mode ?? "strictV02";
  const limits = mode === "strictV02" ? { ...STRICT_DEFAULT_LIMITS, ...opts?.limits } : { ...opts?.limits };
  if (text.length > 0 && text.charCodeAt(0) === 65279) {
    throw new PackDecodeError("BOM detected at start of pack \u2014 forbidden by spec \xA710");
  }
  if (limits.maxBytes !== void 0 && text.length > limits.maxBytes) {
    throw new PackDecodeError(`Pack exceeds maxBytes limit: ${text.length} > ${limits.maxBytes}`);
  }
  const lines = text.split("\n");
  if (limits.maxLines !== void 0 && lines.length > limits.maxLines) {
    throw new PackDecodeError(`Pack exceeds maxLines limit: ${lines.length} > ${limits.maxLines}`);
  }
  let totalRows = 0;
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
        if (limits.maxDictEntries !== void 0 && dict.size >= limits.maxDictEntries) {
          throw new PackDecodeError(`Line ${i + 1}: pack exceeds maxDictEntries limit (${limits.maxDictEntries})`);
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
        if (limits.maxColumns !== void 0 && columns.length > limits.maxColumns) {
          throw new PackDecodeError(`Line ${i + 1}: table '${name}' exceeds maxColumns limit (${limits.maxColumns})`);
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
          if (limits.maxTables !== void 0 && tables.size >= limits.maxTables) {
            throw new PackDecodeError(`Line ${i + 1}: pack exceeds maxTables limit (${limits.maxTables})`);
          }
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
        if (limits.maxRows !== void 0 && ++totalRows > limits.maxRows) {
          throw new PackDecodeError(`Line ${i + 1}: pack exceeds maxRows limit (${limits.maxRows})`);
        }
        active.rows.push(row);
        break;
      }
      case 43: {
        if (!active) {
          throw new PackDecodeError(`Line ${i + 1}: row '+' with no active schema`);
        }
        const row = parseRow(body, active.columns, i + 1);
        if (limits.maxRows !== void 0 && ++totalRows > limits.maxRows) {
          throw new PackDecodeError(`Line ${i + 1}: pack exceeds maxRows limit (${limits.maxRows})`);
        }
        active.addedRows.push(row);
        break;
      }
      case 120: {
        if (!active) {
          throw new PackDecodeError(`Line ${i + 1}: row 'x' with no active schema`);
        }
        if (limits.maxRows !== void 0 && ++totalRows > limits.maxRows) {
          throw new PackDecodeError(`Line ${i + 1}: pack exceeds maxRows limit (${limits.maxRows})`);
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
  if (mode === "strictV02") {
    if (!trailer) {
      throw new PackDecodeError(
        "strict v0.2: pack requires a `; end` trailer \u2014 use decodeLegacy() for pre-v0.2 packs"
      );
    }
    enforceStrictV02(header, tables, trailer);
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
    const sha = sha256hex(text.slice(0, trailer.start)).slice(0, 12);
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
function decodeStrict(text, limits) {
  return decode(text, limits ? { mode: "strictV02", limits } : { mode: "strictV02" });
}
function decodeLegacy(text, limits) {
  return decode(text, limits ? { mode: "legacy", limits } : { mode: "legacy" });
}
function enforceStrictV02(header, tables, trailer) {
  for (const t of tables.values()) {
    if (header.kind === "diff") {
      if (t.rows.length > 0) {
        throw new PackDecodeError(
          `strict v0.2: kind=diff but table '${t.name}' carries ${t.rows.length} baseline '-' row(s)`
        );
      }
    } else if (t.addedRows.length > 0 || t.deletedIds.length > 0) {
      throw new PackDecodeError(
        `strict v0.2: kind=${header.kind ?? "master"} but table '${t.name}' carries incremental '+'/'x' operations`
      );
    }
  }
  if (header.kind === "diff") {
    if (header.rowCount !== 0) {
      throw new PackDecodeError(
        `strict v0.2: kind=diff header rowCount must be the 0 sentinel, got ${header.rowCount}`
      );
    }
  } else if (header.rowCount !== null && header.rowCount !== trailer.rows) {
    throw new PackDecodeError(
      `strict v0.2: master header rowCount=${header.rowCount} but trailer rows=${trailer.rows}`
    );
  }
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
  } else if (/^\d+$/.test(rowCountField)) {
    rowCount = Number(rowCountField);
  } else {
    throw new PackDecodeError(
      `Line ${lineNo}: header rowCount '${rowCountField}' is not a non-negative integer or '-'`
    );
  }
  const header = { producer, schema, snapshotId, rowCount };
  if (fields.length > 4 && fields[4] !== "-") {
    if (!/^\d+$/.test(fields[4])) {
      throw new PackDecodeError(
        `Line ${lineNo}: header seq '${fields[4]}' is not a non-negative integer or '-'`
      );
    }
    header.seq = Number(fields[4]);
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

// packages/factspack/src/chain.ts
function keyOf(row, keyIndex, where) {
  const k = row[keyIndex];
  if (k === null || k === void 0) {
    throw new Error(`computeDiff/applyChain: null primary key at column ${keyIndex} in ${where}`);
  }
  return k;
}
function serializeRow(row) {
  return row.map((c) => c === null ? "\0" : c).join("");
}
function computeDiff(prev, next, opts = {}) {
  const ki = opts.keyIndex ?? 0;
  const out = [];
  const names = /* @__PURE__ */ new Set([...prev.tables.keys(), ...next.tables.keys()]);
  for (const name of names) {
    const p = prev.tables.get(name);
    const n = next.tables.get(name);
    if (n && !p) {
      if (n.rows.length > 0) {
        out.push({ name, columns: n.columns, addedRows: n.rows.map((r) => r.slice()), deletedIds: [] });
      }
      continue;
    }
    if (p && !n) {
      const deletedIds2 = p.rows.map((r) => keyOf(r, ki, `prev.${name}`));
      if (deletedIds2.length > 0) out.push({ name, columns: p.columns, addedRows: [], deletedIds: deletedIds2 });
      continue;
    }
    if (!p || !n) continue;
    const prevByKey = /* @__PURE__ */ new Map();
    for (const r of p.rows) prevByKey.set(keyOf(r, ki, `prev.${name}`), serializeRow(r));
    const addedRows = [];
    const deletedIds = [];
    const seen = /* @__PURE__ */ new Set();
    for (const r of n.rows) {
      const k = keyOf(r, ki, `next.${name}`);
      seen.add(k);
      const prevSer = prevByKey.get(k);
      if (prevSer === void 0) {
        addedRows.push(r.slice());
      } else if (prevSer !== serializeRow(r)) {
        addedRows.push(r.slice());
        deletedIds.push(k);
      }
    }
    for (const r of p.rows) {
      const k = keyOf(r, ki, `prev.${name}`);
      if (!seen.has(k)) deletedIds.push(k);
    }
    if (addedRows.length > 0 || deletedIds.length > 0) {
      out.push({ name, columns: n.columns, addedRows, deletedIds });
    }
  }
  return out;
}
function applyChain(master, diffs, opts = {}) {
  const ki = opts.keyIndex ?? 0;
  const tables = /* @__PURE__ */ new Map();
  for (const [name, t] of master.tables) {
    tables.set(name, { columns: t.columns, rows: t.rows.map((r) => r.slice()) });
  }
  for (const diff of diffs) {
    for (const [name, dt] of diff.tables) {
      let t = tables.get(name);
      if (!t) {
        t = { columns: dt.columns, rows: [] };
        tables.set(name, t);
      }
      if (dt.deletedIds.length > 0) {
        const del = new Set(dt.deletedIds);
        t.rows = t.rows.filter((r) => !del.has(keyOf(r, ki, `applied.${name}`)));
      }
      for (const r of dt.addedRows) t.rows.push(r.slice());
    }
  }
  return tables;
}

// packages/factspack/src/canonicalize.ts
function canonicalizePath(path) {
  return path.replace(/\\/g, "/");
}
function canonicalizeNumber(n) {
  if (!Number.isFinite(n)) {
    throw new RangeError(`Non-finite number cannot be canonicalized: ${n}`);
  }
  return String(n);
}

// ../../facts-pack/test/_encode-auto.ts
var DEFAULT_TUNING = { minValues: 3, minSavings: 30 };
function coerce(v) {
  if (v === null || v === void 0) return null;
  if (v === "") return "";
  return String(v);
}
function cleanName(name) {
  const t = String(name).trim().replace(/\s+/g, "_");
  return t.length ? t : "col";
}
function dedupeColumnNames(names) {
  const taken = new Set(names);
  const seen = /* @__PURE__ */ new Set();
  return names.map((name) => {
    if (!seen.has(name)) {
      seen.add(name);
      return name;
    }
    let n = 2;
    let candidate = `${name}_${n}`;
    while (seen.has(candidate) || taken.has(candidate)) candidate = `${name}_${++n}`;
    seen.add(candidate);
    return candidate;
  });
}
function prefixSeed(name) {
  const m = name.match(/[a-zA-Z]/);
  return (m ? m[0] : "V").toUpperCase();
}
function worthInterning(values, tuning) {
  if (values.length < tuning.minValues) return false;
  let total = 0;
  const uniq = /* @__PURE__ */ new Map();
  for (const v of values) {
    total += v.length;
    uniq.set(v, (uniq.get(v) ?? 0) + 1);
  }
  const idLen = 1 + String(uniq.size).length;
  let uniqLen = 0;
  for (const v of uniq.keys()) uniqLen += v.length;
  const internedCost = uniqLen + uniq.size * (3 + idLen) + values.length * idLen;
  return total - internedCost >= tuning.minSavings;
}
function canonicalHeader(h, tables) {
  const kind = h.kind ?? "master";
  const key = [h.producer, h.schema, kind, JSON.stringify(tables)].join("\0");
  const out = {
    producer: h.producer,
    schema: h.schema,
    snapshotId: sha256hex(key).slice(0, 12),
    rowCount: h.rowCount,
    kind
  };
  if (h.seq !== void 0) out.seq = h.seq;
  if (h.parent !== void 0) out.parent = h.parent;
  return out;
}
function encodeAuto(opts) {
  const tuning = { ...DEFAULT_TUNING, ...opts.tuning };
  const groups = /* @__PURE__ */ new Map();
  const tableMeta = opts.tables.map((t) => {
    const clean = t.columns.map(cleanName);
    const groupKeys = clean.map((c) => c.toUpperCase());
    clean.forEach((_, ci) => {
      const gk = groupKeys[ci];
      let g = groups.get(gk);
      if (!g) {
        g = { values: [] };
        groups.set(gk, g);
      }
      for (const row of t.rows) {
        const cell = coerce(row[ci]);
        if (cell !== null && cell !== "") g.values.push(cell);
      }
    });
    return { clean, groupKeys };
  });
  const decision = /* @__PURE__ */ new Map();
  const usedPrefix = /* @__PURE__ */ new Set();
  for (const [gk, g] of groups) {
    if (!isInternedColumn(gk) || usedPrefix.size >= 26 || !worthInterning(g.values, tuning)) {
      decision.set(gk, { interned: false });
      continue;
    }
    let p = prefixSeed(gk);
    while (usedPrefix.has(p)) p = p === "Z" ? "A" : String.fromCharCode(p.charCodeAt(0) + 1);
    usedPrefix.add(p);
    decision.set(gk, { interned: true, prefix: p });
  }
  const tables = opts.tables.map((t, ti) => {
    const { clean, groupKeys } = tableMeta[ti];
    const decisions = groupKeys.map((gk) => decision.get(gk));
    const baseNames = clean.map((name, ci) => decisions[ci].interned ? name.toUpperCase() : name.toLowerCase());
    const wireNames = dedupeColumnNames(baseNames);
    const columns = wireNames.map((name, ci) => {
      const d = decisions[ci];
      return d.interned && d.prefix !== void 0 ? { name, internGroup: d.prefix } : { name };
    });
    const rows = t.rows.map((r) => clean.map((_, ci) => coerce(r[ci])));
    return { name: t.name, columns, rows };
  });
  const header = opts.canonical ? canonicalHeader(opts.header, tables) : opts.header;
  return opts.meta !== void 0 ? encode({ header, tables, meta: opts.meta }) : encode({ header, tables });
}
export {
  PackDecodeError,
  PackEncodeError,
  PackEscapeError,
  STRICT_DEFAULT_LIMITS,
  applyChain,
  canonicalizeNumber,
  canonicalizePath,
  computeDiff,
  decode,
  decodeLegacy,
  decodeStrict,
  encode,
  encodeAuto,
  encodeIncremental,
  escapeCell,
  isInternedColumn,
  unescapeCell
};
