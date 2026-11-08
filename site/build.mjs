// CLI: node build.mjs [--root ..] [--out dist]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadContent, validate } from './lib/content.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const root = path.resolve(opt('root', path.join(here, '..')));
const out = path.resolve(opt('out', path.join(here, 'dist')));
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

const content = await loadContent(root);
const { errors, warnings } = validate(content);
for (const w of warnings) console.warn(`предупреждение: ${w}`);
if (errors.length) {
  console.error(`Сборка остановлена: ${errors.length} ошиб(ок) в контенте:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

let render;
try { ({ renderSite: render } = await import('./lib/render.mjs')); }
catch (e) { console.error(`Не удалось загрузить lib/render.mjs: ${e.message}`); process.exit(1); }

// Адаптер: форма результата loadContent -> форма, ожидаемая lib/render.mjs.
const doc = (d) => d && ({ ...d.data, id: d.data?.id, title: d.data?.title, version: d.data?.version != null ? String(d.data.version) : undefined, roles: d.data?.roles, est_minutes: d.data?.est_minutes, path: d.file, body: d.body, data: d.data });
function toRenderContent(c) {
  const modules = c.modules.filter((m) => m.published).map((m) => {
    const r = m.readme;
    return {
      id: m.id, status: m.status, path: m.dir, title: r.data.title, version: String(r.data.version), summary: r.data.summary,
      roles: r.data.roles, est_minutes_by_role: r.data.est_minutes_by_role, prerequisites: r.data.prerequisites || [],
      readme: doc(r), lessons: m.lessons.map(doc), lab: doc(m.lab), assessment: doc(m.assessment), solutions: doc(m.solutions), quiz: m.quiz,
    };
  });
  const ref = c.reference;
  const docs = {
    glossary: doc(ref.glossary), kernel: doc(ref.kernel), roadmap: doc(ref.roadmap), learningPaths: doc(ref.learningPaths),
    problemPatterns: doc(ref.problemPatterns), fixtureContract: doc(ref.fixtureContract),
    proposals: (ref.proposals || []).map((p) => ({ ...doc(p), id: p.data?.id || path.basename(p.file).slice(0, 5) })),
  };
  const routes = {};
  for (const [k, v] of Object.entries(c.routes || {})) if (v && Array.isArray(v.steps)) routes[k] = v;
  return {
    version: String(modules[0]?.version ?? '0'), manifest: c.manifest, modules, routes, docs, sources: c.sources,
    cases: c.cases.map((k) => ({ ...doc(k), id: k.data.id })),
    fixtures: c.fixtures.map((f) => ({ id: path.basename(path.dirname(f.file)), path: f.file, json: f.data })),
  };
}
const files = new Map(await render(toRenderContent(content)));

// assets и files/
const addDir = (dir, prefix) => {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const p = path.join(dir, e.name);
    if (e.isSymbolicLink()) continue;
    if (e.isDirectory()) addDir(p, `${prefix}/${e.name}`);
    else files.set(`${prefix}/${e.name}`, fs.readFileSync(p));
  }
};
addDir(path.join(here, 'assets'), 'assets');
for (const f of content.fixtures) files.set(`files/${path.basename(path.dirname(f.file))}/fixture.json`, f.raw);
files.delete('manifest.json');

let commit = 'unknown';
try { commit = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || 'unknown'; } catch {}

const hashes = {};
for (const p of [...files.keys()].sort()) hashes[p] = sha(files.get(p));
const digest = sha(Object.keys(hashes).map((p) => `${p}:${hashes[p]}`).join('\n'));
const units = [];
for (const m of content.modules.filter((x) => x.published)) {
  units.push({ id: m.id, kind: 'module', version: String(m.readme.data.version), title: m.readme.data.title, url: `m/${m.id}/`, roles: m.readme.data.roles });
  m.lessons.forEach((l) => units.push({ id: l.data.id, kind: 'lesson', version: String(l.data.version), title: l.data.title, url: `m/${m.id}/${path.basename(l.file, '.md')}/`, roles: l.data.roles }));
  if (m.lab) units.push({ id: m.lab.data.id, kind: 'lab', version: String(m.lab.data.version), title: m.lab.data.title, url: `m/${m.id}/lab/`, roles: m.lab.data.roles });
  units.push({ id: `${m.id}.QZ`, kind: 'quiz', version: String(m.quiz.version), title: `Тест ${m.id}`, url: `m/${m.id}/quiz/`, roles: m.quiz.questions.length ? [...new Set(m.quiz.questions.flatMap((q) => q.roles))].sort() : [] });
}
for (const k of content.cases) units.push({ id: k.data.id, kind: 'case', version: String(k.data.version ?? '1'), title: k.data.title, url: `cases/${k.data.id}/`, roles: k.data.roles || [] });
const courseVersion = String(content.modules.find((m) => m.published)?.readme.data.version ?? '0');
const manifest = { course_version: courseVersion, built_from_commit: commit, digest, units, files: hashes };
files.set('manifest.json', JSON.stringify(manifest, null, 2) + '\n');

fs.rmSync(out, { recursive: true, force: true });
for (const [p, data] of [...files.entries()].sort()) {
  if (p.includes('..') || path.isAbsolute(p)) { console.error(`Недопустимый путь вывода: ${p}`); process.exit(1); }
  const dest = path.join(out, p);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, data);
}
console.log(`Готово: ${files.size} файлов в ${out}, digest ${digest.slice(0, 12)}`);
