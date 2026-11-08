// Загрузка и проверка контента по allowlist контракта (site/content-contract.json).
// NOTE-W01: renderMarkdown импортируется динамически из ./markdown.mjs (пишет W01-B), чтобы модуль загружался и без него.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import matter from 'gray-matter';

export const ROLES = ['USER', 'BUILDER', 'ENGINEER'];
export const ID = {
  module: /^M0[0-9]$/, lesson: /^M0[0-9]\.L0[1-9]$/, lab: /^M0[0-9]\.LAB[1-9]$/,
  question: /^M0[0-9]\.Q[0-9]{2}$/, activity: /^M0[0-9]\.A[0-9]{2}$/,
  case: /^U(0[1-9]|1[0-2])$/, source: /^SRC-[0-9]{2,3}$/, capability: /^KC-[ABQODE][0-9]{2}$/,
  proposal: /^KP-0[1-6]$/, quiz: /^M0[0-9]\.QZ$/, assessment: /^M0[0-9]\.AS$/, solutions: /^M0[0-9]\.SOL$/,
};
export function idType(id) {
  if (typeof id !== 'string' || /\s/.test(id)) return null;
  for (const [k, re] of Object.entries(ID)) if (re.test(id)) return k;
  return null;
}
const DENY = /(^|[\\/])(hidden|holdout|private|grader|oracle|\.local|research|workflow)([\\/]|$)/i;
const EXCLUDED_NAMES = new Set(['brief.md', 'evidence.json']);
const ACTIVITY_TYPES = ['checklist', 'field_check', 'decision', 'find_error'];
const ACTIVITY_COMMON = ['id', 'type', 'title', 'scenario', 'instruction', 'mode', 'roles', 'required', 'version'];
const ACTIVITY_FIELDS = {
  checklist: ['items'], field_check: ['input', 'fields', 'success', 'failure'],
  decision: ['input', 'options', 'correct', 'explanation', 'require_reason'],
  find_error: ['candidate', 'error_ids', 'explanation'],
};

function safePath(root, rel) {
  const abs = path.resolve(root, rel);
  const r = path.resolve(root);
  if (abs !== r && !abs.startsWith(r + path.sep)) throw new Error(`path traversal: ${rel}`);
  if (DENY.test(rel) || EXCLUDED_NAMES.has(path.basename(rel))) throw new Error(`denied path: ${rel}`);
  // запрет symlink на любом сегменте
  let cur = r;
  for (const seg of path.relative(r, abs).split(path.sep)) {
    cur = path.join(cur, seg);
    if (fs.existsSync(cur) && fs.lstatSync(cur).isSymbolicLink()) throw new Error(`symlink: ${rel}`);
  }
  return abs;
}
const exists = (root, rel) => { try { return fs.existsSync(safePath(root, rel)); } catch { return false; } };
const readText = (root, rel) => fs.readFileSync(safePath(root, rel), 'utf8');
const readJson = (root, rel) => JSON.parse(readText(root, rel));
function listDir(root, rel, filter) {
  if (!exists(root, rel)) return [];
  const out = [];
  for (const e of fs.readdirSync(safePath(root, rel), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (e.isSymbolicLink() || DENY.test(e.name) || EXCLUDED_NAMES.has(e.name)) continue;
    if (filter(e)) out.push(e.name);
  }
  return out;
}
function parseMd(root, rel) {
  const g = matter(readText(root, rel));
  return { file: rel, data: g.data, body: g.content };
}

export function canonicalFixtureHash(fx) {
  const sort = (v) => Array.isArray(v) ? v.map(sort) : v && typeof v === 'object'
    ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sort(v[k])])) : v;
  const s = JSON.stringify(sort({ ...fx, content_hash: null }));
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex');
}

export function defaultRoutes(modules, manifest) {
  const routes = {};
  const published = modules.filter((m) => m.published);
  for (const role of ROLES) {
    const steps = [];
    for (const m of published) {
      for (const l of m.lessons) if (!l.data.roles || l.data.roles.includes(role)) steps.push({ ref: l.data.id, required: true });
      if (m.lab && (!m.lab.data.roles || m.lab.data.roles.includes(role))) steps.push({ ref: m.lab.data.id, required: true });
      const qs = (m.quiz?.questions || []).filter((q) => !q.roles || q.roles.includes(role));
      if (qs.length) steps.push({ ref: `${m.id}.QZ`, required: true });
    }
    routes[role] = {
      role, title: { USER: 'Маршрут пользователя', BUILDER: 'Маршрут сборщика', ENGINEER: 'Маршрут инженера' }[role],
      version: '0.1.0', outcome: '', steps, generated: true,
      planned: (manifest?.modules || []).filter((m) => m.status === 'planned').map((m) => m.id),
    };
  }
  return routes;
}

export async function loadContent(root) {
  root = path.resolve(root);
  const c = { root, errors: [], manifest: null, modules: [], routes: {}, cases: [], reference: {}, sources: null, fixtures: [], loadErrors: [] };
  const guard = (fn, what) => { try { return fn(); } catch (e) { c.loadErrors.push(`${what}: ${e.message}`); return null; } };
  let renderMarkdown = null;
  try { ({ renderMarkdown } = await import('./markdown.mjs')); } catch { renderMarkdown = null; }
  c.renderMarkdown = renderMarkdown;

  c.manifest = guard(() => readJson(root, 'modules/manifest.json'), 'modules/manifest.json');
  c.sources = guard(() => readJson(root, 'sources/registry.json'), 'sources/registry.json');
  for (const mm of c.manifest?.modules || []) {
    const mod = { id: mm.id, dir: mm.path, status: mm.status, published: mm.status !== 'planned', manifest: mm, lessons: [], lab: null, quiz: null };
    if (mod.published) {
      guard(() => {
        mod.readme = parseMd(root, `${mm.path}/README.md`);
        for (const f of listDir(root, mm.path, (e) => e.isFile() && /^lesson-\d+\.md$/.test(e.name))) mod.lessons.push(parseMd(root, `${mm.path}/${f}`));
        mod.lab = parseMd(root, `${mm.path}/lab.md`);
        mod.assessment = parseMd(root, `${mm.path}/assessment.md`);
        mod.solutions = parseMd(root, `${mm.path}/solutions.md`);
        mod.quiz = readJson(root, `${mm.path}/quiz.json`);
      }, `module ${mm.id}`);
      mod.activities = [];
      if (mod.lab && renderMarkdown) {
        guard(() => { mod.activities = renderMarkdown(mod.lab.body, { root, kind: 'lab', file: mod.lab.file }).activities || []; }, `activities ${mm.id}`);
      } else if (mod.lab) {
        mod.activities = extractActivities(mod.lab.body, c.loadErrors);
      }
    }
    c.modules.push(mod);
  }
  // справочники
  const ref = { glossary: 'docs/glossary.md', kernel: 'docs/kernel-capabilities.md', roadmap: 'docs/kernel-roadmap.md', fixtureContract: 'docs/fixture-contract.md', learningPaths: 'docs/learning-paths.md', problemPatterns: 'docs/problem-patterns.md' };
  for (const [k, rel] of Object.entries(ref)) c.reference[k] = guard(() => parseMd(root, rel), rel);
  c.reference.proposals = listDir(root, 'docs/kernel-proposals', (e) => e.isFile() && /^KP-.*\.md$/.test(e.name))
    .map((f) => guard(() => parseMd(root, `docs/kernel-proposals/${f}`), f)).filter(Boolean);
  c.cases = listDir(root, 'cases', (e) => e.isFile() && /^U.*\.md$/.test(e.name)).map((f) => guard(() => parseMd(root, `cases/${f}`), f)).filter(Boolean);
  for (const d of listDir(root, 'labs/fixtures', (e) => e.isDirectory())) {
    const rel = `labs/fixtures/${d}/fixture.json`;
    if (exists(root, rel)) { const fx = guard(() => readJson(root, rel), rel); if (fx) c.fixtures.push({ file: rel, data: fx, raw: readText(root, rel) }); }
  }
  // маршруты
  const def = defaultRoutes(c.modules, c.manifest);
  for (const role of ROLES) {
    const rel = `paths/${role.toLowerCase()}.json`;
    c.routes[role] = exists(root, rel) ? (guard(() => readJson(root, rel), rel) || def[role]) : def[role];
  }
  return c;
}

function extractActivities(body, errs) {
  const out = [];
  for (const m of body.matchAll(/```activity\s*\n([\s\S]*?)```/g)) {
    try { out.push(JSON.parse(m[1])); } catch (e) { errs.push(`activity JSON: ${e.message}`); }
  }
  return out;
}

export function validate(c) {
  const errors = [...(c.loadErrors || [])];
  const warnings = [];
  const seen = new Map();
  const reg = (id, where, type) => {
    if (idType(id) !== type) errors.push(`${where}: неверный формат ID «${id}» (ожидается тип ${type})`);
    else if (seen.has(id)) errors.push(`${where}: дублирующийся ID «${id}» (также в ${seen.get(id)})`);
    else seen.set(id, where);
  };
  const srcIds = new Set((c.sources?.sources || []).map((s) => s.id));
  for (const s of srcIds) if (!ID.source.test(s)) errors.push(`sources/registry.json: неверный ID источника «${s}»`);
  const kcText = c.reference?.kernel?.body || '';
  const kcs = new Set([...kcText.matchAll(/\bKC-[ABQODE][0-9]{2}\b/g)].map((m) => m[0]));
  const checkSrc = (list, where) => {
    if (!Array.isArray(list)) { errors.push(`${where}: source_ids должен быть списком`); return; }
    for (const s of list) if (!srcIds.has(s)) errors.push(`${where}: источник «${s}» отсутствует в реестре`);
  };
  const need = (data, fields, where) => { for (const f of fields) if (data?.[f] === undefined || data?.[f] === null) errors.push(`${where}: нет обязательного поля frontmatter «${f}»`); };
  const checkRoles = (r, where) => { if (!Array.isArray(r) || !r.length || r.some((x) => !ROLES.includes(x))) errors.push(`${where}: roles должен быть непустым списком из ${ROLES.join('|')}`); };

  for (const m of c.modules) {
    if (!ID.module.test(m.id)) errors.push(`modules/manifest.json: неверный ID модуля «${m.id}»`);
    if (!m.published) continue;
    const w = m.dir;
    if (!m.readme) { errors.push(`${w}: нет README.md или модуль не загружен`); continue; }
    const rd = m.readme.data;
    need(rd, ['id', 'title', 'version', 'roles', 'summary', 'prerequisites', 'source_ids', 'est_minutes_by_role'], `${w}/README.md`);
    if (rd.id !== m.id) errors.push(`${w}/README.md: id «${rd.id}» не совпадает с manifest «${m.id}»`);
    checkRoles(rd.roles, `${w}/README.md`); checkSrc(rd.source_ids, `${w}/README.md`);
    reg(String(rd.id), `${w}/README.md`, 'module');
    if (!m.lessons.length) errors.push(`${w}: нет уроков`);
    for (const l of m.lessons) {
      const d = l.data;
      need(d, ['id', 'title', 'version', 'roles', 'est_minutes', 'source_ids', 'cases', 'capabilities'], l.file);
      reg(String(d.id), l.file, 'lesson'); checkRoles(d.roles, l.file); checkSrc(d.source_ids, l.file);
      for (const k of d.capabilities || []) {
        if (!ID.capability.test(k)) errors.push(`${l.file}: неверный формат KC «${k}»`);
        else if (!kcs.has(k)) errors.push(`${l.file}: ${k} не найден в docs/kernel-capabilities.md`);
      }
      for (const k of d.cases || []) if (!ID.case.test(k)) errors.push(`${l.file}: неверный ID кейса «${k}»`);
    }
    if (m.lab) {
      const d = m.lab.data;
      need(d, ['id', 'title', 'version', 'roles', 'est_minutes', 'mode', 'source_ids'], m.lab.file);
      reg(String(d.id), m.lab.file, 'lab'); checkRoles(d.roles, m.lab.file); checkSrc(d.source_ids, m.lab.file);
      if (!['simulation', 'mock_verified', 'live_verified'].includes(d.mode)) errors.push(`${m.lab.file}: недопустимый mode «${d.mode}»`);
    }
    for (const [key, type] of [['assessment', 'assessment'], ['solutions', 'solutions']]) {
      const f = m[key]; if (!f) continue;
      need(f.data, ['id', 'version'], f.file); reg(String(f.data.id), f.file, type);
    }
    // активности
    const aseen = new Set();
    for (const a of m.activities || []) {
      const wa = `${m.lab?.file} активность «${a?.id}»`;
      if (idType(a?.id) !== 'activity') { errors.push(`${wa}: неверный ID активности`); continue; }
      if (aseen.has(a.id)) errors.push(`${wa}: дубль`); aseen.add(a.id); reg(a.id, wa, 'activity');
      if (!ACTIVITY_TYPES.includes(a.type)) { errors.push(`${wa}: неизвестный тип «${a.type}»`); continue; }
      const allowed = new Set([...ACTIVITY_COMMON, ...ACTIVITY_FIELDS[a.type]]);
      for (const k of Object.keys(a)) if (!allowed.has(k)) warnings.push(`${wa}: неизвестное поле «${k}»`);
      for (const f of ['title', 'scenario', 'instruction', 'mode']) if (!a[f]) errors.push(`${wa}: нет поля «${f}»`);
      if (a.scenario && !['normal', 'forbidden', 'error'].includes(a.scenario)) errors.push(`${wa}: недопустимый scenario «${a.scenario}»`);
      if (a.version !== undefined && !Number.isInteger(a.version)) errors.push(`${wa}: version должен быть целым`);
      if (a.roles) checkRoles(a.roles, wa);
      const miss = ACTIVITY_FIELDS[a.type].filter((f) => a[f] === undefined && !['require_reason', 'success', 'failure'].includes(f));
      for (const f of miss) errors.push(`${wa}: нет поля «${f}»`);
      if (a.type === 'decision' && a.options && !a.options.some((o) => o.id === a.correct)) errors.push(`${wa}: correct не найден в options`);
      if (a.type === 'find_error' && a.candidate && (a.error_ids || []).some((e) => !a.candidate.some((x) => x.id === e))) errors.push(`${wa}: error_ids вне candidate`);
    }
    // quiz
    const q = m.quiz; const wq = `${w}/quiz.json`;
    if (!q) { errors.push(`${wq}: не загружен`); continue; }
    if (q.schema !== 'course-quiz/1') errors.push(`${wq}: schema должен быть course-quiz/1`);
    if (q.module !== m.id) errors.push(`${wq}: module «${q.module}» ≠ «${m.id}»`);
    if (q.pass_ratio !== undefined && !(typeof q.pass_ratio === 'number' && q.pass_ratio >= 0 && q.pass_ratio <= 1)) errors.push(`${wq}: pass_ratio вне 0..1`);
    reg(`${m.id}.QZ`, wq, 'quiz');
    if (!Array.isArray(q.questions) || !q.questions.length) errors.push(`${wq}: нет вопросов`);
    for (const x of q.questions || []) {
      const wx = `${wq} ${x?.id}`;
      reg(String(x.id), wx, 'question');
      if (!['single', 'multi', 'boolean', 'find_error'].includes(x.type)) errors.push(`${wx}: неизвестный тип «${x.type}»`);
      checkRoles(x.roles, wx); checkSrc(x.source_ids || [], wx);
      if (typeof x.prompt !== 'string' || !x.prompt) errors.push(`${wx}: нет prompt`);
      if (typeof x.critical !== 'boolean') errors.push(`${wx}: critical должен быть boolean`);
      if (!Number.isInteger(x.version)) errors.push(`${wx}: version должен быть целым`);
      if (!x.explanation) errors.push(`${wx}: нет explanation`);
      const oids = (x.options || []).map((o) => o.id);
      if (!oids.length) errors.push(`${wx}: нет options`);
      if (new Set(oids).size !== oids.length) errors.push(`${wx}: дубли id вариантов`);
      if (!Array.isArray(x.correct) || !x.correct.length) errors.push(`${wx}: correct пуст`);
      else {
        for (const k of x.correct) if (!oids.includes(k)) errors.push(`${wx}: correct «${k}» нет в options`);
        if (x.type !== 'multi' && x.correct.length !== 1) errors.push(`${wx}: для ${x.type} должен быть ровно один correct`);
      }
      for (const o of oids) if (!(x.correct || []).includes(o) && !x.wrong_explanations?.[o]) errors.push(`${wx}: нет объяснения для неверного варианта «${o}»`);
    }
  }
  // кейсы и предложения
  for (const k of c.cases) { reg(String(k.data.id), k.file, 'case'); }
  for (const p of c.reference.proposals || []) { const id = path.basename(p.file).slice(0, 5); if (!ID.proposal.test(id)) errors.push(`${p.file}: неверный ID предложения`); }
  // маршруты
  const units = new Set();
  for (const m of c.modules.filter((x) => x.published)) {
    for (const l of m.lessons) units.add(l.data.id);
    if (m.lab) units.add(m.lab.data.id);
    units.add(`${m.id}.QZ`);
  }
  for (const k of c.cases) units.add(k.data.id);
  for (const role of ROLES) {
    const r = c.routes[role];
    if (!r || !Array.isArray(r.steps)) { errors.push(`маршрут ${role}: нет steps`); continue; }
    for (const s of r.steps) {
      if (!units.has(s.ref)) errors.push(`маршрут ${role}: шаг «${s.ref}» не найден среди опубликованных юнитов`);
      if (typeof s.required !== 'boolean') errors.push(`маршрут ${role}: у шага «${s.ref}» required должен быть boolean`);
      if (s.gate && !units.has(s.gate)) errors.push(`маршрут ${role}: gate «${s.gate}» не найден`);
    }
  }
  // fixture
  for (const f of c.fixtures) {
    const h = canonicalFixtureHash(f.data);
    if (f.data.content_hash !== h) errors.push(`${f.file}: content_hash не совпадает (ожидается ${h})`);
  }
  // замкнутость ссылок (warnings)
  const allow = [/^modules\/M0\d[^/]*\/(README|lesson-[^/]+|lab|assessment|solutions)\.md$/, /^docs\/(glossary|kernel-capabilities|kernel-roadmap|fixture-contract|learning-paths|problem-patterns)\.md$/, /^docs\/kernel-proposals\/[^/]+\.md$/, /^cases\/U[^/]*\.md$/, /^labs\/fixtures\//, /^sources\/registry\.json$/];
  const docs = [...c.modules.flatMap((m) => [m.readme, ...m.lessons, m.lab, m.assessment, m.solutions]), ...c.cases, ...Object.values(c.reference).flat()].filter(Boolean);
  for (const d of docs) {
    for (const mm of d.body.matchAll(/\]\(([^)\s#]+)(#[^)]*)?\)/g)) {
      const href = mm[1];
      if (/^[a-z][a-z0-9+.-]*:/i.test(href)) continue;
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(d.file), href));
      if (!allow.some((re) => re.test(target))) warnings.push(`${d.file}: ссылка вне allowlist «${href}» будет заменена нессылочным текстом`);
    }
    if (/<(?!a id="t\d+"><\/a>)[a-z][^>]*>/i.test(d.body.replace(/```[\s\S]*?```/g, '').replace(/`[^`]*`/g, ''))) warnings.push(`${d.file}: возможный сырой HTML (будет экранирован)`);
  }
  return { errors, warnings };
}
