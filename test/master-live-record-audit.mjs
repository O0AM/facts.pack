import { readFile, access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const defaultFile = resolve(here, '..', 'research', '2026-06-14-pack-master-live-doc.html');
const file = resolve(process.argv[2] || defaultFile);
const html = await readFile(file, 'utf8');
const failures = [];
const checks = [];

function check(name, condition, detail = '') {
  checks.push({ name, ok: Boolean(condition), detail });
  if (!condition) failures.push(`${name}${detail ? `: ${detail}` : ''}`);
}

const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
const duplicateIds = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
let scriptError = '';
for (const script of scripts) {
  try { new vm.Script(script); } catch (error) { scriptError = error.message; break; }
}

check('doctype', /^<!doctype html>/i.test(html));
check('one h1', (html.match(/<h1\b/gi) || []).length === 1);
check('inline style present', /<style>[\s\S]+<\/style>/i.test(html));
check('no external stylesheets', !/<link\b[^>]*rel=["']?stylesheet/i.test(html));
check('no external scripts', !/<script\b[^>]*src=/i.test(html));
check('no remote URLs', !/https?:\/\//i.test(html));
check('unique IDs', duplicateIds.length === 0, duplicateIds.join(', '));
check('inline script syntax', !scriptError, scriptError);
check('signed attestation', /class="mark"[^>]*>\s*(CC|AG|OC|[A-Z]{2,12})\s*</i.test(html));
check('timestamped evidence', /Evidence snapshot:\s*2026-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\s+\+05:30/i.test(html));
check('license lock recorded', /AGPL-3\.0[\s\S]{0,160}commercial dual[- ]license/i.test(html));
check('release guard recorded', /No commit\s*\|\s*no publish\s*\|\s*no deploy/i.test(html));
check('refresh workflow linked', /MASTER-LIVE-RECORD-REFRESH\.md/i.test(html));

const findingCount = (html.match(/<details\b[^>]*class="[^"]*\bfinding\b[^"]*"/gi) || []).length;
const displayedFindingCount = Number((html.match(/id="finding-count"[^>]*>\s*(\d+)\s+shown/i) || [])[1]);
check('finding count matches DOM', findingCount === displayedFindingCount,
  `DOM=${findingCount}, label=${displayedFindingCount || 'missing'}`);

const checkboxTags = [...html.matchAll(/<input\b[^>]*type="checkbox"[^>]*data-key="([^"]+)"[^>]*>/gi)]
  .map((m) => ({ key: m[1], checked: /\bchecked\b/i.test(m[0]) }));
const truthBody = (html.match(/var truth\s*=\s*\{([^}]+)\}/i) || [])[1] || '';
const truth = new Map([...truthBody.matchAll(/([a-zA-Z0-9_]+)\s*:\s*(true|false)/g)]
  .map((m) => [m[1], m[2] === 'true']));
const checklistDrift = checkboxTags
  .filter(({ key, checked }) => !truth.has(key) || truth.get(key) !== checked)
  .map(({ key, checked }) => `${key}: html=${checked}, truth=${truth.get(key)}`);
check('checklist HTML matches truth seed', checklistDrift.length === 0, checklistDrift.join('; '));

const localLinks = [...new Set([...html.matchAll(/\bhref="([^"]+)"/gi)]
  .map((m) => m[1])
  .filter((href) => !href.startsWith('#') && !/^[a-z][a-z0-9+.-]*:/i.test(href)))];
const broken = [];
for (const href of localLinks) {
  try { await access(resolve(dirname(file), decodeURIComponent(href))); }
  catch { broken.push(href); }
}
check('local evidence links resolve', broken.length === 0, broken.join(', '));

const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const scrubbed = html
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/<script\b[\s\S]*?<\/script>/gi, '<script></script>')
  .replace(/<style\b[\s\S]*?<\/style>/gi, '<style></style>');
const stack = [];
const tagErrors = [];
for (const match of scrubbed.matchAll(/<\/?([a-zA-Z][\w:-]*)\b[^>]*>/g)) {
  const raw = match[0];
  const tag = match[1].toLowerCase();
  if (raw.startsWith('</')) {
    const expected = stack.pop();
    if (expected !== tag) tagErrors.push(`closed ${tag}, expected ${expected || 'none'}`);
  } else if (!voidTags.has(tag) && !raw.endsWith('/>')) {
    stack.push(tag);
  }
}
check('balanced HTML tags', stack.length === 0 && tagErrors.length === 0,
  [...tagErrors, ...stack.map((tag) => `unclosed ${tag}`)].join('; '));

for (const item of checks) {
  console.log(`${item.ok ? 'PASS' : 'FAIL'}  ${item.name}${item.detail ? ` - ${item.detail}` : ''}`);
}
console.log(`\n${checks.length - failures.length}/${checks.length} master-record checks pass`);
if (failures.length) process.exitCode = 1;
