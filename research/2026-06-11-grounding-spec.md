# FactsPack Wire-Format Spec — Deep Read Report

Sources (read completely):
- `D:\dev\ai agents\claude\factstack\docs\FACTSPACK.md` (333 lines, §1–§15)
- `D:\dev\ai agents\claude\factstack\docs\FACTSPACK_PROMPT.md` (165 lines)

---

## 1. Name / version string and self-versioning

Title: `# FactsPack (\`.pack\`) — Specification`

Status block (top of file, exact quote):

> "Canonical spec for the FactsPack wire format used by the Fun AI Coding Tools (FACTs) OS. Status: design-locked, implementation scheduled in **`docs/PLAN.md → Up next #1`**. Schema version: `1`. Last revised: 2026-04-24."

How it versions itself — §11 "Versioning" (exact quote, complete):

> "The header carries `<schemaName>-v<n>`. Rules:
> - Adding a column to an existing schema is a **major** version bump.
> - Removing or reordering columns is a **major** bump.
> - Adding a new table (`&`) under the same schema bundle is a **minor** bump (consumers MUST ignore unknown tables).
> - Adding a new line-type prefix anywhere is a **major** bump for the format itself, captured in `<producer>/<version>` (the first header field).
>
> Version-mismatched packs MUST be rejected with a clear error (no silent best-effort parsing). The dashboard and the AI client both pin the schema versions they understand."

So there are two version axes: format version lives in the first header field (`<producer>/<version>`, e.g. `facts/0.1`) and schema version in the second field (`<schemaName>-v<n>`). The spec doc itself states "Schema version: `1`".

---

## 2. Every normative rule, by section

### §4 Grammar (general)
- "A PACK file is a sequence of newline-terminated lines, UTF-8, with a one-character prefix per line"
- Line prefixes (from the grammar block): `#` header (informational), `@` dictionary entry, `&` schema declaration, `-` row (baseline), `+` row added (incremental), `x` row deleted (incremental).
- "Field separator: ASCII tab (`0x09`). Record separator: newline (`0x0A`). Reserved first-bytes: `# @ & - + x`. Anything else on the first byte of a line is undefined and **MUST be rejected**."
- Escaping: "Tabs and newlines inside any cell value escape as `\t` and `\n`. Backslash escapes itself as `\\`. **No other escapes are defined.**"

### §4.1 Header (`#`)
Example: `# facts/0.1  symbols-v1  88e9a1b2c310  5000`

Exact field list and order:
> "Fields after `# `:
> 1. **Producer/version** — e.g. `facts/0.1`, `analyze/0.3`.
> 2. **Schema/version** — combined `<schemaName>-v<n>`. Bumping `n` is a breaking change.
> 3. **Commit** (or any opaque snapshot id) — for cache keying.
> 4. **Row count** — total rows expected. May be `-` if streaming."

Normative: "The header is informational. Implementations **MAY** ignore it; producers **MUST** emit it."

### §4.2 Dictionary (`@`)
- "`@ K=V` declares that the literal token `K` expands to value `V` in **interned columns**... Keys are case-sensitive opaque tokens."
- Namespaces are **convention only**, not assigned semantics: "Convention: a single-letter prefix tied to the column it serves (`F` for file, `R` for ref/import target, `S` for symbol id) followed by a number." The spec defines only F (file), R (ref/import target), S (symbol id); examples also show `F1`, `F2`, `R3=react`. There is no T/L namespace anywhere in either file.
- Ordering: "Producers **SHOULD** emit the dictionary entries before any row that uses them in a streaming context, but consumers **MUST** tolerate forward references and finalize after the whole pack is read."

### §4.3 Schema (`&`)
- "Tab-separated tokens after `& `: 1. Table name (e.g. `symbols`). 2. Column names, in order."
- Case rule: "A column whose name is **uppercase** is interned: its cell values are dictionary keys to be expanded via the `@` table. A column whose name is lowercase carries literal values."
- "Multiple `&` declarations are allowed in one file — subsequent `-` rows bind to the most recent schema."

### §4.4 Rows (`-`, `+`, `x`)
- "`-` is a baseline row. Tab-separated cells, one per column in the active schema."
- "`+` is an addition. Same shape as `-`. Used in incremental packs."
- "`x` is a deletion. The single field after `x ` is the value of the row's primary-key column (column 1 by convention)."
- "Cells in interned columns **MUST** be dictionary keys. Cells in literal columns are raw strings (with the three escapes from §4 if needed)."
- Null/empty: "Empty cells are the empty string. The literal `-` (single dash) means 'no value / null'; if your data needs a literal hyphen, escape any other way (e.g. quote it from the producer side; PACK itself doesn't quote)."

### §5 LLM preamble
The canonical 8-line preamble (no MUST language; "Cache this once and PACK is free to consume forever").

### §7 Incremental updates
- Patch signal: header comment in the example — "`# facts/0.1 symbols-v1 88e9a1b 0   ← row count 0 means "patch only"`"
- Application semantics: "A consumer applies these in order on top of an existing snapshot to produce the new state."
- Economics claim: "A long agent session therefore costs **one full PACK on the first call, then KB-sized deltas for the rest**".
- Note: patch packs re-declare the `@` dictionary entries and `&` schema they use (shown in the example).

### §8 Composition: multi-table packs
- "Each `&` line begins a new active schema. Rows under it share that schema until the next `&`."

### §9 Format-selection (consumer/producer obligations, informative)
- "The MCP verb declares its return format in its tool description. Browsers get JSON. Static exports get JSON. Only AI agents see PACK by default, and only on big-table verbs."

### §10 Reserved characters and edge cases (EOF, integrity-adjacent)
Table, exact rules:
- Tab `0x09`: "Field separator. Forbidden inside cells; escape as `\t`."
- Newline `0x0A`: "Record separator. Forbidden inside cells; escape as `\n`."
- `\\`: "Literal backslash."
- "Lines starting `# @ & - + x` | Reserved line types."
- "Empty line | Permitted; ignored."
- "BOM | Forbidden."
- "Non-UTF-8 | Forbidden; producers **MUST** validate."
- "`-` as a sole cell | Means null/missing. Producers **MUST** avoid emitting bare `-` for legitimate single-character data; if that data exists, escape elsewhere or interpose a sentinel value."

EOF rule (exact): "Producers **MUST** emit a `\n` at end of file. Consumers **MUST** accept a missing final `\n`."

### §11 Versioning — quoted in full above. Key MUSTs: "consumers MUST ignore unknown tables"; "Version-mismatched packs MUST be rejected with a clear error (no silent best-effort parsing)."

### §12 Implementation notes (informative)
Encoder "emits `@` entries before first use"; decoder "yields rows as `(table, []string)` pairs"; round-trip invariant "decode(encode(x)) == x up to interning order". Reference Python decoder planned at `analyze/lib/factspack.py`.

### §13 Anti-patterns (normative-by-prohibition)
- "Don't use PACK as a storage format."
- "Don't put binary data in cells. Base64-encode at the producer if you must"
- "Don't intern columns that won't repeat."
- "Don't emit JSON-style nesting in cells... Promote it to its own table."
- "Don't ship PACK to browsers."

### §15 Cross-references (doc-maintenance obligation)
> "Any change to this spec is a contract change and MUST update those three docs in the same commit, per **`CLAUDE.md → Living docs`**." (the three docs: `docs/APP_SPEC.md → Data contracts → FactsPack`, `docs/PLAN.md → Up next #1`, `docs/ROADMAP.md → Next up #1`)

**Size limits:** none anywhere in either file. No checksums or integrity mechanisms beyond row count.

---

## 3. Schema tag and version-bump/rejection semantics

The schema tag in this spec is **not** `agent-v1` — examples use `symbols-v1` and `multi-v1`. Field definition (§4.1, exact): "**Schema/version** — combined `<schemaName>-v<n>`. Bumping `n` is a breaking change."

Rejection semantics (§11, exact): "Version-mismatched packs MUST be rejected with a clear error (no silent best-effort parsing). The dashboard and the AI client both pin the schema versions they understand."

Consumer-side echo in FACTSPACK_PROMPT.md Decoding rule 1: "Reject if the schema version isn't one you understand."

---

## 4. What FACTSPACK_PROMPT.md is

Yes — it is a self-contained paste-ready prompt to teach LLMs the format, for both decoding and encoding. Its preamble (exact):

> "Copy everything below the next horizontal rule into any LLM chat (system prompt or first user message). It's self-contained — no references to external files. Once pasted, the model can both **decode** PACK responses from tools and **emit** PACK when asked."

Key instruction sets:
- **8 decoding rules** (numbered), notably: "Read the header (`#`)... Reject if the schema version isn't one you understand."; "Forward references are allowed — finalize after the whole pack is read in non-streaming mode."; "`+` rows are additions; apply on top of an existing snapshot."; "`x rowId` deletes by primary key (column 1 by convention)."; "A bare `-` cell means null/missing."; "Reverse `\t \n \\` escapes inside cell values."
- **8 encoding rules**, notably: "Write the `#` header with producer/version, schema/version, an opaque snapshot id (commit SHA when available), and the row count."; "Choose interned columns (uppercase names) for any column whose values repeat across many rows"; "Don't quote strings — PACK has no quoting layer."; "Don't emit binary data."
- Adds one anti-pattern absent from the spec: "**Don't omit the header.**"
- Patch signal: "`row count = 0` in the header signals 'patch only.'"
- Ends with: "You don't need to know more about FACTs to use PACK. Treat any PACK payload as a self-describing tabular response."

---

## 5. Existing coverage of the asked-about themes

| Theme | Coverage in spec |
|---|---|
| Freshness/staleness | Only indirectly: header field 3 "**Commit** (or any opaque snapshot id) — for cache keying" (§4.1). No timestamps, TTL, or staleness semantics. |
| Commit SHAs | §4.1 commit field; PROMPT encoding rule 1: "an opaque snapshot id (commit SHA when available)". |
| Immutability | Not stated. Closest: incremental packs "apply... in order on top of an existing snapshot" (§7), implying snapshots are identified by commit, but no immutability guarantee. |
| File naming | Only the extension `.pack` (title). PACK is explicitly "not a storage format" (§2, §13) so on-disk naming is out of scope by design. |
| Multi-file packs/chains | Not covered. §8 covers multi-**table** single packs; §7 covers patches over a prior snapshot in the same session, but no chaining/manifest of multiple files. |
| Legends/self-description | §1 claims "self-describing"; mechanism is the `&` schema line + `@` dictionary + §5 8-line preamble. No human legend line type. |
| Truncation detection | Weak: header row count ("total rows expected. May be `-` if streaming") gives a checkable count; EOF rule tolerates missing final `\n` (which actually *hampers* truncation detection). No checksum. |
| Ranked ordering | Not covered. No statement that row order is meaningful, except §7 "applies these in order" for patches. |
| Ref hints | Only the `R` dictionary-key convention ("`R` for ref/import target", §4.2) and the `imports`/`to` example column. No hint semantics. |

---

## 6. Gaps (spec is silent on)

1. **Row-count mismatch handling** — header says "total rows expected" but no rule for what a consumer does if actual ≠ declared (error? warn? truncation signal?).
2. **Duplicate dictionary keys** — no rule for `@ F1=a` followed by `@ F1=b` (last-wins? error?).
3. **Undefined dictionary key in an interned cell** — cells "MUST be dictionary keys", but consumer behavior on a missing key is unspecified.
4. **Column-count mismatch in rows** — rows with fewer/more cells than the active schema: no rule.
5. **Rows before any `&` line** — undefined.
6. **`+`/`x` in a baseline (non-zero row count) pack** — legality unspecified; conversely whether `-` rows may appear in a patch pack.
7. **`x` for a nonexistent row id / `+` for an existing id** — upsert vs error unspecified.
8. **Primary key** — "column 1 by convention" only; no way to declare a different PK in the schema line.
9. **Patch chain ordering/identity** — nothing ties a patch to the snapshot it patches (the commit field changes are not specified across patches; the §7 example reuses `88e9a1b`). No sequence numbers, no base-snapshot reference.
10. **Header field separator** — examples show two-space and single-space separation; §4 says fields are tab-separated generally, but the header's own separator is never explicitly stated.
11. **Mixed-case or non-ASCII column names** — interning is keyed on "uppercase" vs "lowercase" with no rule for `Id`, digits, or non-Latin names.
12. **Size limits** — none: no max line length, cell length, dictionary size, table count, or pack size.
13. **Integrity** — no checksum/hash; only the informational row count.
14. **Types** — all cells are strings; no numeric/boolean typing, so `l 42` vs `"42"` is consumer guesswork.
15. **Ordering guarantees** — whether row order is significant or stable (e.g. ranked results) is unstated.
16. **Empty-string vs null in `x` field and dictionary values** — `@ K=` (empty value) legality unspecified.
17. **Escapes of literal `\t`-the-two-characters** — the escape set is defined but there's no formal unescape ambiguity discussion (e.g. `\x` for unknown x).
18. **Multiple headers** — whether a pack may contain more than one `#` line (e.g. concatenated packs) is unspecified.
19. **Whitespace** — examples use multi-space alignment in fenced blocks despite "field separator: tab"; treatment of runs of tabs or leading/trailing spaces inside cells is unspecified.
20. **Staleness/TTL, file naming, multi-file chaining, ref-hint semantics, immutability** — all absent (see §5 table above).
21. **`agent-v1`** — no `agent-*` schema is defined anywhere; only `symbols-v1` and `multi-v1` appear as examples, and no registry of valid schema names exists.

---

## FACTS table

| Fact | Exact quote | Section |
|---|---|---|
| Spec version string | "Schema version: `1`. Last revised: 2026-04-24." (status block); header carries "`<schemaName>-v<n>`. Bumping `n` is a breaking change." | preamble; §4.1, §11 |
| Schema tag | "**Schema/version** — combined `<schemaName>-v<n>`" — examples: `symbols-v1`, `multi-v1`. No `agent-v1` exists in either doc. | §4.1; examples §6, §8 |
| Header field list | "1. **Producer/version**… 2. **Schema/version**… 3. **Commit** (or any opaque snapshot id) — for cache keying. 4. **Row count** — total rows expected. May be `-` if streaming." | §4.1 |
| Row markers | "`-` is a baseline row… `+` is an addition… `x` is a deletion. The single field after `x ` is the value of the row's primary-key column (column 1 by convention)." | §4.4 |
| Escape set | "Tabs and newlines inside any cell value escape as `\t` and `\n`. Backslash escapes itself as `\\`. No other escapes are defined." | §4 (table in §10) |
| EOF rule | "Producers MUST emit a `\n` at end of file. Consumers MUST accept a missing final `\n`." | §10 |
