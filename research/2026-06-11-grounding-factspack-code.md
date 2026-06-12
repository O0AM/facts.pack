# factspack package report

Package root: `D:\dev\ai agents\claude\factstack\packages\factspack\` (`@factstack/factspack`, v0.0.0, private, ESM, exports raw TS via `./src/index.ts`, vitest + tsc only, zero runtime deps).

## 1. Public API (from `src/index.ts`)

**Functions**
- `encode(opts: EncodeOptions): string` — baseline pack (`-` rows). (`src/encode.ts:51`)
- `encodeIncremental(opts: IncrementalEncodeOptions): string` — patch pack (`+`/`x` rows). (`src/encode.ts:81`)
- `decode(text: string): DecodedPack` — (`src/decode.ts:50`)
- `escapeCell(s: string): string` / `unescapeCell(s: string): string` — (`src/escape.ts:18,49`)
- `isInternedColumn(colName: string): boolean` — true iff first char is A–Z (charCode 0x41–0x5A). (`src/types.ts:146`)

**Error classes** (all extend `Error`, tagged via `.name` for `instanceof` discrimination)
- `PackEncodeError` (`src/encode.ts:38`), `PackDecodeError` (`src/decode.ts:38`), `PackEscapeError` (`src/escape.ts:82`)

**Types** (`src/types.ts`)
- `PackColumn { name: string }`
- `PackRow = (string | null)[]` (null ⇒ wire `-`; empty string is distinct, wire empty cell)
- `PackTable { name; columns; rows }`
- `IncrementalTable { name; columns; addedRows: PackRow[]; deletedIds: string[] }`
- `PackHeader { producer: string; schema: string; snapshotId: string; rowCount: number | null }`
- `EncodeOptions { header; tables: PackTable[] }`, `IncrementalEncodeOptions { header; tables: IncrementalTable[] }`
- `DecodedTable { name; columns; rows; addedRows; deletedIds }`
- `DecodedPack { header: PackHeader; tables: Map<string, DecodedTable> }` (map iteration order = `&` declaration order)

## 2. encode() / encodeIncremental()

**Strategy**: two-pass — rows are rendered first (interning as a side effect), then output is assembled as `header \n dictLines \n tableLines \n` (`assemble`, `src/encode.ts:150-156`). Dict entries therefore always precede all rows.

**Header rendering** (`renderHeader`, `src/encode.ts:104-120`): emits `# <producer>\t<schema>\t<snapshotId>\t<rowCount>`. Validates `producer`, `schema`, `snapshotId` are non-empty strings with no tab/newline (throws `PackEncodeError` otherwise). `rowCount === null` serializes as `-`. In `encode()`, a null rowCount is **auto-computed** as the sum of rows across all tables (`src/encode.ts:66-70`); in `encodeIncremental()` a null rowCount is **forced to `0`** (patch-only convention, `src/encode.ts:95-98`). A caller-supplied non-null rowCount is passed through unverified in both modes.

**Schema lines** (`declSchemaLine`, `src/encode.ts:122-132`): `& <name>\t<col1>\t<col2>…`; rejects empty / tab / newline in table and column names. Each table emits its own `&` line; zero-column tables are accepted by the encoder (decode would reject them — untested asymmetry).

**Dictionary interning** (`Encoder` class, `src/encode.ts:174-219`):
- Only columns whose **name starts with an uppercase ASCII letter** intern (`isInternedColumn`, used at `rowLine`, `src/encode.ts:139`). Lowercase-first columns are literal (escaped raw strings).
- **Per-column id namespaces**, not one: `maps: Map<colName, Map<literal, key>>` and `counters: Map<colName, number>`. Key = `${colName}${counter}` (`F1`, `F2`, … independently `R1`, `R2`, …) (`intern`, `src/encode.ts:200-214`). The namespace is shared **across tables** for same-named columns (single `Encoder` per pack), so `F` in `symbols` and `F` in `imports` share keys.
- New keys append `@ K=V` lines (value escaped) in mint order.

**Row emission** (`rowLine`, `src/encode.ts:134-148`): prefix `-` (baseline) or `+` (incremental additions); `null` → `-`, `''` → empty cell, interned column → dict key, literal column → `escapeCell(value)`. Cell count must equal column count exactly — mismatch throws (`assertSchemaShape`, `src/encode.ts:186-196`); no padding or truncation. Deletions emit `x <escaped id>` one per id; empty ids rejected (`src/encode.ts:90-93`).

**Trailing newline**: always exactly one `\n` at EOF (`assemble`, `src/encode.ts:155`).

## 3. decode() — rejections vs. tolerances

**Rejects** (all `PackDecodeError`, with 1-based line numbers, except escape failures which are `PackEscapeError` from `unescapeCell`):
- BOM (U+FEFF) at byte 0 (`src/decode.ts:51-56`)
- Any non-empty line shorter than 2 chars or without a space at index 1 (`src/decode.ts:79-83`)
- Unknown line prefix — anything outside `# @ & - + x` ("reserved-byte violation", `src/decode.ts:161-166`)
- No `#` header anywhere (`src/decode.ts:170-172`); duplicate `#` header (`:88-90`)
- Header with <4 tab fields (`parseHeader`, `:188-192`); any of the first 3 fields empty (`:194-196`); rowCount not `-` and not a non-negative integer (`:201-207`)
- `@` line with no `=` or empty key (`:96-98`); duplicate dictionary key (re-definition forbidden, `:101-105`)
- `&` line with no table name (`:112-114`) or zero columns (`:116-118`); same table name redeclared with different columns (`:121-127`)
- `-`/`+`/`x` line with no active schema (`:136-137, :144-145, :152-153`)
- Row cell count ≠ active schema column count (`parseRow`, `:214-218`)
- Unresolved dictionary key in an interned column after the end-of-stream resolution sweep (`resolveRows`, `:242-246`) — forward references are legal, missing entries are not
- Unknown escape (`\x`), unterminated trailing `\`, or `\` + literal tab inside any cell/dict value (`unescapeCell`, `src/escape.ts:61-74`)

**Silently tolerates**:
- Missing final newline; empty lines anywhere (`:73`)
- Header with **more than 4 fields** — extras are ignored (`parseHeader` destructures only 4). This is the forward-compat seam for (5a).
- **rowCount is parsed but NEVER verified** against actual decoded rows. A pack claiming 500 rows with 3 decodes fine.
- **No truncation detection**: a pack cut at any line boundary decodes successfully (mid-line cuts usually fail on cell count or unresolved keys, by luck not by design). There is no trailer/checksum.
- Unused dictionary entries; `x` lines in baseline packs; interleaved/duplicate `&` re-declarations (allowed if columns match — rows append to the same table); `@`/`&` lines after rows.
- **Schema tag is not validated at all** — `header.schema` is parsed faithfully; the doc comment (`src/decode.ts:22-25`) explicitly delegates version checking to the caller. Same for `producer`.
- Interned-column key *shape* is unconstrained: any string resolving in the dict passes; a lowercase-prefixed key, or a key not matching its column letter, decodes fine.

One round-trip hole worth knowing: a literal-column cell whose value is exactly the string `"-"` encodes as a bare `-` (`escapeCell('-')` is identity, `rowLine` only special-cases `null`) and **decodes back as `null`** (`parseRow`, `:224`). Lossy, untested (fuzz alphabet excludes `-`).

## 4. Test coverage — 103 tests total

**encode.test.ts (15)**: produces the canonical 5-row symbols pack · orders dict entries before table rows · reuses a dict key for repeated literals · per-column counters are independent · emits multiple & blocks with shared dictionary · serializes null as bare `-` · serializes empty string distinct from null · escapes tabs and newlines in literal columns · escapes the dict value when interning a literal that contains tabs · rejects header.producer with a tab · rejects empty table name · rejects column name with a tab · rejects row with wrong number of cells · emits + and x lines under the schema declaration (incl. rowCount forced to 0) · rejects empty deleted id.

**decode.test.ts (25)**: decodes the spec §6 single-table example · tolerates forward dictionary references · handles missing trailing newline · skips empty lines · decodes null cells (bare `-`) and empty cells · decodes multi-table packs · decodes incremental packs with + and x rows · decodes streaming-mode header (rowCount `-`) · rejects: no header, header missing fields, duplicate header, unknown line prefix, zero columns, wrong cell count, row with no active schema, unresolved dictionary key, duplicate dictionary key, schema redeclared with different columns, malformed @ entry, missing space after prefix, BOM, non-numeric rowCount, negative rowCount · unescapes `\t \n \\` in literal columns · unescapes dict values.

**escape.test.ts (25)**: escapeCell identity on empty / no-reserved-bytes / UTF-8 (incl. U+2028 not treated as newline); escapes tab, newline, backslash, all three together (7) · unescapeCell identity + each escape + interleaved (6) · rejects trailing backslash, unknown escape, backslash+tab (3) · 9 parametrized escape↔unescape round-trip cases incl. control bytes 1..32 (9).

**round-trip.test.ts (38)**: 6 fixed `decode(encode(T)) ≡ T` cases (no interning; all interned; null+empty matrix; all escape chars; multi-table shared interned column; UTF-8/emoji) · 1 incremental round-trip (`addedRows`/`deletedIds` survive) · 30 deterministic fuzz cases (mulberry32, seed 0xFAC75AC4: 1–3 tables, 1–6 columns ~40% interned, 0–39 rows, cells from `'abcdefghij \t\n\\日'`, 5%/5% null/empty) · 1 token-cost check (PACK < 50% of JSON byte size on a 100-row heavy-intern table).

**NOT tested**: rowCount verification / truncation behavior (no such behavior exists); schema-tag mismatch handling (no such behavior exists); the `"-"`-literal-cell → null lossy round-trip; header with >4 fields; CRLF line endings (`\r` would silently land inside cell/column-name values); encode of zero-column tables (encoder allows, decoder rejects); `encodeIncremental` in the fuzz suite; `x` lines in baseline packs; dict keys colliding with literal-looking strings; non-string cell types (numbers) sneaking past TS at runtime; byte-for-byte golden of a full pack (goldens use `toContain` fragments only).

## 5. Change difficulty (each: where + lockstep?)

- **(a) New header fields (commit sha, parent hash, seq)** — *Easy, append-only is forward-compatible.* Encode: extend `PackHeader` (`src/types.ts:86`) and `renderHeader` (`src/encode.ts:104-120` — add to the validation loop and the template at `:119`). Decode: `parseHeader` (`src/decode.ts:186-210`) already **ignores fields beyond index 3**, so old decoders tolerate new packs if fields are appended at the end; new decoder changes only to *read* them (extend the destructure, keep `< 4` check if optional). Lockstep required only if the new fields are mandatory.
- **(b) Legend/comment block after header** — *Easy but lockstep mandatory.* Needs a new line prefix (e.g. `;`). Decode's `default` case (`src/decode.ts:161-166`) hard-rejects unknown prefixes, so old decoders reject the new pack — add a switch case (ignore or collect) in `decode()` and an emitter in `assemble`/`encode` (`src/encode.ts:150-156, :72`). Schema-tag bump advisable.
- **(c) Inline ref hints (`F12~name.ts`)** — *Small code, breaking wire change.* Encode: change the return of `Encoder.intern` or the interned branch of `rowLine` (`src/encode.ts:143, :200-214`) to append `~hint`. Decode: `resolveRows` (`src/decode.ts:234-250`) currently does `dict.get(cell)` — `F12~name.ts` throws "Unresolved dictionary key". Must strip at the first `~` before lookup. **Lockstep required**; `~` is safe as a separator since keys are `[colName][int]`.
- **(d) Single unified id namespace** — *Trivial; decoder needs zero changes.* Only `Encoder` changes: collapse `maps`/`counters` (`src/encode.ts:176-177`) to one map + one counter with a fixed prefix (`src/encode.ts:200-214`). The decoder's dict is already a single flat `Map<string,string>` (`src/decode.ts:63`) and never inspects key shape — old decoders read new packs fine.
- **(e) End-of-pack trailer line** — *Easy, lockstep mandatory* (same reason as (b): reserved-byte rejection at `src/decode.ts:161-166`). Encode: append in `assemble` (`src/encode.ts:150-156`). Decode: new switch case + (the actual payoff) a post-loop presence check near `src/decode.ts:170` for truncation detection — which currently does not exist at all.
- **(f) Per-table ranked ordering / in-degree column** — *Zero changes in this package.* Row order is caller-controlled and preserved end-to-end; an in-degree column is just another `PackColumn` + cell. Lives in the producers: `packages/emit/src/pack.ts` / `apps/mcp-server/src/pack-responses.ts`. Decode unchanged (additive columns don't even need a schema bump if consumers key by name, per the comment at `emit/src/pack.ts:351`).
- **(g) Relative-day timestamps** — *Zero changes in this package* — cells are opaque strings; conversion is the caller's job. Only if you want a reference-epoch header field does it become case (a). Decode unchanged.

## 6. Where `'factstack/0.3.10'` and `'agent-v1'` live

**Not in the library code.** Inside this package they appear only as doc examples (`src/types.ts:76,79`) and as the round-trip test fixture (`test/round-trip.test.ts:23-24`). The real constants live in the callers:
- `D:\dev\ai agents\claude\factstack\packages\emit\src\pack.ts:32` — `const PRODUCER = 'factstack/0.3.10'`; `:37` — `const SCHEMA = 'agent-v3'` (the live agent.pack tag is **agent-v3**, not agent-v1; v1 survives only in docs and the fixture).
- `D:\dev\ai agents\claude\factstack\apps\mcp-server\src\pack-responses.ts:23` — `const PRODUCER = 'factstack/0.3.10'`, with per-tool schema tags passed to a local `header()` helper: `query-graph-v1`, `risks-v1`, `outline-v2`, `subgraph-v1`, `context-v1`, `envs-v1`, `learnings-v1` (lines 72–435).

## FACTS

| Fact | Value |
|---|---|
| Exported functions | `encode`, `encodeIncremental`, `decode`, `escapeCell`, `unescapeCell`, `isInternedColumn` (+ classes `PackEncodeError`, `PackDecodeError`, `PackEscapeError`) |
| Schema-tag validation in decode | **None** — `header.schema` only checked non-empty (`src/decode.ts:194-196`); version/tag matching explicitly delegated to the caller (`src/decode.ts:22-25`) |
| Test count | **103** (encode 15, decode 25, escape 25, round-trip 38 incl. 30 fuzz) |
| Files where schema tag is set | `packages\emit\src\pack.ts:37` (`agent-v3`), `apps\mcp-server\src\pack-responses.ts:72,100,156,283,375,399,435` (per-tool `*-v1`/`outline-v2`); fixture only: `packages\factspack\test\round-trip.test.ts:24` (`agent-v1`) |
