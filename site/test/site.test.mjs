import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadContent, validate, idType } from '../lib/content.mjs';

const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.resolve(site, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'site-test-'));
process.on('exit', () => fs.rmSync(tmp, { recursive: true, force: true }));

const build = (out, root = repo) =>
  execFileSync('node', [path.join(site, 'build.mjs'), '--root', root, '--out', out], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);

// (1) idType
test('idType: допустимые идентификаторы', () => {
  const ok = { module: 'M00', lesson: 'M00.L01', lab: 'M00.LAB1', question: 'M00.Q01', activity: 'M00.A01', case: 'U01',
    source: 'SRC-01', proposal: 'KP-01', quiz: 'M00.QZ', assessment: 'M00.AS', solutions: 'M00.SOL' };
  for (const [t, id] of Object.entries(ok)) assert.equal(idType(id), t, id);
  for (const g of 'ABQODE') assert.equal(idType(`KC-${g}01`), 'capability');
});
test('idType: отрицательные', () => {
  for (const id of ['M00. L01', 'M00.L01 ', 'XYZ-1', 'KC-X01', 'KP-07', 'M10', '', null, 42]) assert.equal(idType(id), null, String(id));
});

// (2) реальный контент
test('контент репозитория проходит validate без errors', async () => {
  const { errors } = validate(await loadContent(repo));
  assert.deepEqual(errors, []);
});

// (3) негативные: временная копия контента
function copyContent() {
  const dst = fs.mkdtempSync(path.join(tmp, 'c-'));
  for (const p of ['modules', 'sources', 'labs', 'cases', 'paths', 'docs']) {
    const s = path.join(repo, p);
    if (fs.existsSync(s)) fs.cpSync(s, path.join(dst, p), { recursive: true, filter: (f) => !/[\\/](research|reviews|execution)([\\/]|$)/.test(f) });
  }
  return dst;
}
const edit = (file, fn) => fs.writeFileSync(file, fn(fs.readFileSync(file, 'utf8')));
const m00 = (root) => path.join(root, 'modules', 'M00-baseline');
const errorsOf = async (root) => validate(await loadContent(root));

test('негатив: неверный ID урока', async () => {
  const r = copyContent();
  edit(path.join(m00(r), 'lesson-01.md'), (s) => s.replace(/^id:.*$/m, 'id: "M00. L01"'));
  assert.ok((await errorsOf(r)).errors.length > 0);
});
test('негатив: дубликат ID', async () => {
  const r = copyContent();
  edit(path.join(m00(r), 'lesson-02.md'), (s) => s.replace(/^id:.*$/m, 'id: M00.L01'));
  assert.ok((await errorsOf(r)).errors.some((e) => /дубл/.test(e)));
});
test('негатив: несуществующий KC', async () => {
  const r = copyContent();
  edit(path.join(m00(r), 'lesson-01.md'), (s) => s.replace(/^capabilities:.*$/m, 'capabilities: [KC-A99]'));
  assert.ok((await errorsOf(r)).errors.some((e) => /KC-A99/.test(e)));
});
test('негатив: ссылка на неопубликованный файл', async () => {
  const r = copyContent();
  edit(path.join(m00(r), 'lesson-01.md'), (s) => s + '\n\n[внутр](../../research/notes.md)\n');
  const { errors, warnings } = await errorsOf(r);
  assert.ok(errors.length + warnings.length > 0);
  assert.ok(warnings.some((w) => /research\/notes\.md/.test(w)) || errors.some((e) => /research\/notes\.md/.test(e)));
});
test('негатив: запрещённый путь hidden/', async () => {
  const r = copyContent();
  fs.cpSync(m00(r), path.join(r, 'modules', 'hidden', 'M00'), { recursive: true });
  edit(path.join(r, 'modules', 'manifest.json'), (s) => s.replace(/modules\/M00-baseline/g, 'modules/hidden/M00'));
  assert.ok((await errorsOf(r)).errors.length > 0);
});
test('негатив: активность неизвестного типа', async () => {
  const r = copyContent();
  edit(path.join(m00(r), 'lab.md'), (s) => s + '\n\n```activity\n{"id":"M00.A98","type":"telepathy","title":"x","scenario":"normal","instruction":"x","mode":"simulation"}\n```\n');
  assert.ok((await errorsOf(r)).errors.some((e) => /A98|неизвестный тип/.test(e)));
});

// (4) сборка
const out1 = path.join(tmp, 'dist1'), out2 = path.join(tmp, 'dist2');
test('сборка: структура и детерминизм', () => {
  build(out1); build(out2);
  for (const p of ['index.html', 'manifest.json', 'm/M00/index.html', 'm/M00/lab/index.html', 'm/M00/quiz/index.html']) assert.ok(fs.existsSync(path.join(out1, p)), p);
  const a = JSON.parse(fs.readFileSync(path.join(out1, 'manifest.json'), 'utf8'));
  const b = JSON.parse(fs.readFileSync(path.join(out2, 'manifest.json'), 'utf8'));
  assert.match(a.digest, /^[0-9a-f]{64}$/);
  assert.equal(a.digest, b.digest);
  for (const [p, h] of Object.entries(a.files)) assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(out1, p))).digest('hex'), h, p);
});

const htmlFiles = () => walk(out1).filter((f) => f.endsWith('.html'));
test('dist: нет внешних src/href кроме <a href>, нет inline-скриптов, есть CSP', () => {
  for (const f of htmlFiles()) {
    const h = fs.readFileSync(f, 'utf8'), rel = path.relative(out1, f);
    for (const m of h.matchAll(/<(\w+)\b[^>]*?\s(?:src|href)="(https?:)?\/\/[^"]*"[^>]*>/gi)) assert.equal(m[1].toLowerCase(), 'a', `${rel}: внешний ресурс ${m[0]}`);
    for (const m of h.matchAll(/<script\b([^>]*)>/gi)) {
      assert.ok(/src="[^"h/][^"]*"|type="application\/json"/.test(m[1]), `${rel}: inline script ${m[0]}`);
    }
    assert.ok(!/\son\w+="/i.test(h), `${rel}: inline-обработчик`);
    assert.match(h, /<meta[^>]+http-equiv="Content-Security-Policy"[^>]+script-src 'self'/i, `${rel}: нет CSP`);
  }
});
test('dist: замкнутость относительных ссылок, один h1, lang=ru', () => {
  for (const f of htmlFiles()) {
    const h = fs.readFileSync(f, 'utf8'), rel = path.relative(out1, f);
    if (rel !== '404.html') assert.equal((h.match(/<h1[\s>]/g) || []).length, 1, `${rel}: h1`);
    assert.match(h, /<html[^>]*\blang="ru"/, `${rel}: lang`);
    for (const m of h.matchAll(/\s(?:src|href)="([^"]*)"/g)) {
      const u = m[1];
      if (!u || u.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(u) || u.startsWith('//')) continue;
      const clean = decodeURIComponent(u.split('#')[0].split('?')[0]);
      if (!clean) continue;
      let t = path.resolve(path.dirname(f), clean);
      if (fs.existsSync(t) && fs.statSync(t).isDirectory()) t = path.join(t, 'index.html');
      assert.ok(t.startsWith(out1) && fs.existsSync(t), `${rel}: битая ссылка ${u}`);
    }
  }
});

// (5) progress.js
const P = await import(pathToFileURL(path.join(site, 'assets', 'progress.js')).href);
const mf = { course_version: '0.1.1', units: [{ id: 'M00.L01' }, { id: 'M00.QZ' }, { id: 'M00.LAB1' }] };
const good = () => ({ schema: 'course-progress/1', course_version: '0.1.1', route: 'BUILDER', exported_at: '2026-01-01T00:00:00Z',
  items: { 'M00.L01': { kind: 'lesson', content_version: '0.1.1', state: 'read' },
    'M00.QZ': { kind: 'quiz', content_version: '0.1.1', state: 'passed', score: 1, attempts: 1, questions: { 'M00.Q01': { v: 1, correct: true, attempts: 1 } } } } });
test('progress: валидный файл и round-trip', () => {
  const r = P.validateImport(JSON.stringify(good()), mf);
  assert.equal(r.ok, true); assert.equal(r.state.route, 'BUILDER'); assert.equal(r.state.items['M00.L01'].state, 'read');
  const r2 = P.validateImport(P.serialize(r.state), mf);
  assert.equal(r2.ok, true); assert.deepEqual(r2.state.items, r.state.items);
});
test('progress: отказ без изменения состояния', () => {
  const cur = P.createProgress('0.1.1'); const snap = JSON.stringify(cur);
  const bad = [
    '{not json', '[]', '"x"',
    JSON.stringify({ ...good(), schema: 'course-progress/2' }),
    JSON.stringify({ ...good(), extra: 1 }),
    JSON.stringify({ ...good(), route: 'ADMIN' }),
    JSON.stringify({ ...good(), email: 'a@b.c' }),
    JSON.stringify({ ...good(), items: { 'M00.L01': { kind: 'lesson', content_version: '1', state: 'passed' } } }),
    JSON.stringify({ ...good(), items: { 'M00.LAB1': { kind: 'lab', content_version: '1', state: 'auto_checked', activities: { 'M00.A01': { v: 1, state: 'reviewer_verified' } } } } }),
    JSON.stringify({ ...good(), items: { 'M00.L01': { kind: 'lesson', content_version: '1', state: 'read', foo: 1 } } }),
    ' '.repeat(262145),
  ];
  for (const t of bad) { const r = P.validateImport(t, mf); assert.equal(r.ok, false, t.slice(0, 60)); assert.equal(r.state, null); assert.ok(r.errors.length); }
  assert.equal(JSON.stringify(cur), snap);
});
test('progress: неизвестный ID отбрасывается с предупреждением', () => {
  const g = good(); g.items.U99 = { kind: 'case', content_version: '1', state: 'read' };
  const r = P.validateImport(JSON.stringify(g), mf);
  assert.equal(r.ok, true); assert.ok(!r.state.items.U99); assert.ok(r.warnings.length);
});
test('progress: неполный lab даёт partial, пустой набор вопросов не даёт passed', () => {
  let s = P.createProgress('0.1.1'); s.route = 'USER';
  const lab = { id: 'M00.LAB1', version: '1', activities: [{ id: 'M00.A01' }, { id: 'M00.A02' }] };
  s = P.recordActivity(s, lab, { id: 'M00.A01' }, 'auto_checked');
  assert.equal(s.items['M00.LAB1'].state, 'partial');
  assert.notEqual(P.aggregateQuiz(s, { id: 'M00.QZ', questions: [] }, 'USER').state, 'passed');
});
