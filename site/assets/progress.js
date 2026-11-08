// Чистая логика прогресса (без DOM). Работает в браузере и в Node.
// NOTE-W01: validateImport принимает необязательные manifest.versions {id: v} для проверки версий вопросов/активностей;
// без него версии сверяются позже, в aggregateQuiz/aggregateLab.
export const SCHEMA = 'course-progress/1';
export const ROLES = ['USER', 'BUILDER', 'ENGINEER'];
export const MAX_IMPORT = 262144;
const KIND_STATES = {
  lesson: ['not_started', 'read'],
  case: ['not_started', 'read'],
  lab: ['not_started', 'partial', 'self_reported', 'auto_checked'],
  quiz: ['not_started', 'failed', 'passed'],
};
const FORBIDDEN = ['name', 'email', 'employee_id', 'token', 'key', 'free_text_answers'];
const TOP_KEYS = ['schema', 'course_version', 'route', 'exported_at', 'items'];
const ITEM_KEYS = ['kind', 'content_version', 'state', 'score', 'attempts', 'critical_failed', 'questions', 'activities'];
const ID_RE = /^(M0[0-9]\.L0[1-9]|M0[0-9]\.LAB[1-9]|M0[0-9]\.QZ|U(0[1-9]|1[0-2]))$/;
const QID_RE = /^M0[0-9]\.Q[0-9]{2}$/;
const AID_RE = /^M0[0-9]\.A[0-9]{2}$/;

export function kindOf(id) {
  if (/\.LAB\d$/.test(id)) return 'lab';
  if (/\.L\d\d$/.test(id)) return 'lesson';
  if (/\.QZ$/.test(id)) return 'quiz';
  if (/^U\d\d$/.test(id)) return 'case';
  return null;
}

export function createProgress(courseVersion) {
  return { schema: SCHEMA, course_version: String(courseVersion || ''), route: 'USER', items: {} };
}

const clone = (o) => JSON.parse(JSON.stringify(o));

function ensureItem(state, id, kind, version) {
  let it = state.items[id];
  if (!it) it = state.items[id] = { kind, content_version: String(version || ''), state: 'not_started', attempts: 0 };
  it.content_version = String(version || it.content_version || '');
  return it;
}

export function recordRead(state, unit) {
  const s = clone(state);
  const kind = unit.kind || kindOf(unit.id);
  if (kind !== 'lesson' && kind !== 'case') return s;
  const it = ensureItem(s, unit.id, kind, unit.version);
  it.state = 'read';
  return s;
}

const roleQs = (quiz, role) => (quiz.questions || []).filter((q) => !q.roles || q.roles.includes(role));
const qv = (q) => (Number.isInteger(q.version) ? q.version : 1);

export function aggregateQuiz(state, quiz, role) {
  const it = (state.items || {})[quiz.id || ('' + quiz.module + '.QZ')] || {};
  const rec = it.questions || {};
  const qs = roleQs(quiz, role || state.route);
  const ratio = typeof quiz.pass_ratio === 'number' ? quiz.pass_ratio : 0.7;
  let answered = 0, correct = 0, criticalFailed = false;
  for (const q of qs) {
    const r = rec[q.id];
    if (!r || r.v !== qv(q)) continue;
    answered++;
    if (r.correct) correct++;
    else if (q.critical) criticalFailed = true;
  }
  const total = qs.length;
  const score = total ? correct / total : 0;
  let st = 'not_started';
  if (total && answered === total) st = score >= ratio && !criticalFailed ? 'passed' : 'failed';
  return { state: st, score, total, answered, correct, critical_failed: criticalFailed, pass_ratio: ratio };
}

export function aggregateLab(state, lab, role) {
  const rec = ((state.items || {})[lab.id] || {}).activities || {};
  const r = role || state.route;
  const req = (lab.activities || []).filter((a) => a.required !== false && (!a.roles || a.roles.includes(r)));
  let done = 0, allSelf = true;
  for (const a of req) {
    const x = rec[a.id];
    const v = Number.isInteger(a.v) ? a.v : (Number.isInteger(a.version) ? a.version : 1);
    if (x && x.v === v && (x.state === 'auto_checked' || x.state === 'self_reported')) {
      done++;
      if (x.state !== 'self_reported') allSelf = false;
    }
  }
  let st = 'not_started';
  if (req.length && done === req.length) st = allSelf ? 'self_reported' : 'auto_checked';
  else if (done > 0) st = 'partial';
  return { state: st, done, total: req.length };
}

export function recordQuizAnswer(state, quizMeta, questionMeta, selected) {
  const s = clone(state);
  const it = ensureItem(s, quizMeta.id, 'quiz', quizMeta.version);
  it.questions = it.questions || {};
  const corr = [...(questionMeta.correct || [])].sort().join('|');
  const sel = [...new Set(selected || [])].sort().join('|');
  const ok = corr === sel && sel !== '';
  const prev = it.questions[questionMeta.id];
  it.questions[questionMeta.id] = { v: qv(questionMeta), correct: ok, attempts: (prev ? prev.attempts : 0) + 1 };
  it.attempts = (it.attempts || 0) + 1;
  return refreshQuiz(s, quizMeta);
}

export function refreshQuiz(state, quizMeta) {
  const s = clone(state);
  const it = ensureItem(s, quizMeta.id, 'quiz', quizMeta.version);
  if (quizMeta.questions) {
    const a = aggregateQuiz(s, quizMeta, s.route);
    it.state = a.state; it.score = a.score; it.critical_failed = a.critical_failed;
  }
  return s;
}

export function recordActivity(state, labMeta, activity, status) {
  const s = clone(state);
  const it = ensureItem(s, labMeta.id, 'lab', labMeta.version);
  it.activities = it.activities || {};
  if (status) it.activities[activity.id] = { v: activity.v || 1, state: status };
  else delete it.activities[activity.id];
  it.state = aggregateLab(s, labMeta, s.route).state;
  return s;
}

export function serialize(state) {
  const out = clone(state);
  out.exported_at = new Date().toISOString();
  return JSON.stringify(out, null, 2);
}

function scanForbidden(o, path, errors) {
  if (Array.isArray(o)) return o.forEach((x, i) => scanForbidden(x, path + '[' + i + ']', errors));
  if (o && typeof o === 'object') {
    for (const k of Object.keys(o)) {
      if (FORBIDDEN.includes(k)) errors.push('Запрещённое поле «' + k + '» (' + path + ')');
      scanForbidden(o[k], path + '.' + k, errors);
    }
  }
}
const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
const isInt = (x) => Number.isInteger(x) && x >= 0;

export function validateImport(text, manifest) {
  const errors = [], warnings = [];
  const fail = () => ({ ok: false, errors, warnings, state: null });
  if (typeof text !== 'string') { errors.push('Файл не прочитан'); return fail(); }
  let size = text.length;
  if (typeof TextEncoder !== 'undefined') size = new TextEncoder().encode(text).length;
  if (size > MAX_IMPORT) { errors.push('Файл больше 262144 байт'); return fail(); }
  let d;
  try { d = JSON.parse(text); } catch (e) { errors.push('Файл не является корректным JSON'); return fail(); }
  if (!isObj(d)) { errors.push('Корень файла должен быть объектом'); return fail(); }
  scanForbidden(d, '$', errors);
  for (const k of Object.keys(d)) if (!TOP_KEYS.includes(k)) errors.push('Неизвестное поле «' + k + '»');
  if (d.schema !== SCHEMA) errors.push('Неверная схема файла (ожидается ' + SCHEMA + ')');
  if (typeof d.course_version !== 'string') errors.push('Нет course_version');
  if (!ROLES.includes(d.route)) errors.push('Недопустимая роль');
  if (d.exported_at !== undefined && (typeof d.exported_at !== 'string' || isNaN(Date.parse(d.exported_at)))) errors.push('Недопустимая дата exported_at');
  if (!isObj(d.items)) errors.push('Нет объекта items');
  if (errors.length) return fail();

  const units = new Map(((manifest && manifest.units) || []).map((u) => [u.id, u]));
  const versions = (manifest && manifest.versions) || {};
  const state = createProgress((manifest && manifest.course_version) || d.course_version);
  state.route = d.route;
  if (manifest && manifest.course_version && d.course_version !== manifest.course_version)
    warnings.push('Версия курса в файле (' + d.course_version + ') отличается от текущей (' + manifest.course_version + '): устаревшие ответы будут отброшены');

  for (const [id, it] of Object.entries(d.items)) {
    if (!ID_RE.test(id) || (units.size && !units.has(id))) { warnings.push('Неизвестный ID отброшен: ' + id); continue; }
    if (!isObj(it)) { errors.push('Запись ' + id + ' не объект'); continue; }
    for (const k of Object.keys(it)) if (!ITEM_KEYS.includes(k)) errors.push('Неизвестное поле «' + k + '» в ' + id);
    const states = KIND_STATES[it.kind];
    if (!states || it.kind !== kindOf(id)) { errors.push('Недопустимый kind в ' + id); continue; }
    if (!states.includes(it.state)) { errors.push('Недопустимое сочетание ' + it.kind + '/' + it.state + ' в ' + id); continue; }
    if (typeof it.content_version !== 'string') { errors.push('Нет content_version в ' + id); continue; }
    if (it.attempts !== undefined && !isInt(it.attempts)) errors.push('Неверные attempts в ' + id);
    if (it.score !== undefined && (typeof it.score !== 'number' || it.score < 0 || it.score > 1 || it.kind !== 'quiz')) errors.push('Неверный score в ' + id);
    if (it.critical_failed !== undefined && (typeof it.critical_failed !== 'boolean' || it.kind !== 'quiz')) errors.push('Неверный critical_failed в ' + id);
    if (it.questions !== undefined && (it.kind !== 'quiz' || !isObj(it.questions))) errors.push('Неверные questions в ' + id);
    if (it.activities !== undefined && (it.kind !== 'lab' || !isObj(it.activities))) errors.push('Неверные activities в ' + id);
    const out = { kind: it.kind, content_version: it.content_version, state: it.state };
    if (it.attempts !== undefined) out.attempts = it.attempts;
    if (it.score !== undefined) out.score = it.score;
    if (it.critical_failed !== undefined) out.critical_failed = it.critical_failed;
    if (isObj(it.questions)) {
      out.questions = {};
      for (const [q, r] of Object.entries(it.questions)) {
        if (!QID_RE.test(q)) { warnings.push('Неизвестный вопрос отброшен: ' + q); continue; }
        if (!isObj(r) || Object.keys(r).some((k) => !['v', 'correct', 'attempts'].includes(k)) || !isInt(r.v) || typeof r.correct !== 'boolean' || !isInt(r.attempts)) { errors.push('Неверная запись вопроса ' + q); continue; }
        if (versions[q] !== undefined && versions[q] !== r.v) { warnings.push('Версия вопроса ' + q + ' устарела, результат отброшен'); continue; }
        out.questions[q] = { v: r.v, correct: r.correct, attempts: r.attempts };
      }
    }
    if (isObj(it.activities)) {
      out.activities = {};
      for (const [a, r] of Object.entries(it.activities)) {
        if (!AID_RE.test(a)) { warnings.push('Неизвестная активность отброшена: ' + a); continue; }
        if (!isObj(r) || Object.keys(r).some((k) => !['v', 'state'].includes(k)) || !isInt(r.v) || !['self_reported', 'auto_checked', 'failed'].includes(r.state)) { errors.push('Неверная запись активности ' + a + ' (reviewer_verified недопустим)'); continue; }
        if (versions[a] !== undefined && versions[a] !== r.v) { warnings.push('Версия активности ' + a + ' устарела, результат отброшен'); continue; }
        out.activities[a] = { v: r.v, state: r.state };
      }
    }
    state.items[id] = out;
  }
  if (errors.length) return fail();
  return { ok: true, errors, warnings, state };
}
