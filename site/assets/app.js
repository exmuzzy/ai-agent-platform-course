// Клиентское приложение курса. Vanilla ES module, без сети кроме загрузки собственных страниц и JSON.
// NOTE-W01: если в header нет элементов [data-role-switch], [data-save-file], [data-unsaved], [data-continue],
// app.js создаёт их сам (панель .app-toolbar в конце header). Поисковая форма и страница прогресса
// рендерятся в #main, если нет своих контейнеров [data-search-results] / [data-progress-root].
import { createProgress, recordRead, recordQuizAnswer, refreshQuiz, recordActivity, aggregateQuiz, aggregateLab, serialize, validateImport, kindOf, ROLES } from './progress.js';
import { initActivities, readActivity } from './activities.js';

const KEY = 'course-progress-v1';
const ROLE_NAMES = { USER: 'Пользователь', BUILDER: 'Строитель', ENGINEER: 'Инженер' };
const KIND_NAMES = { lesson: 'Урок', lab: 'Практика', quiz: 'Тест', case: 'Кейс' };
const ST_NAMES = { not_started: 'не начато', read: 'прочитано', partial: 'частично', self_reported: 'отмечено вами', auto_checked: 'проверено автоматически', failed: 'не сдан', passed: 'сдан' };

const app = { state: null, dirty: false, manifest: null, routes: null, searchIndex: null, root: '' };

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
function el(tag, attrs, text) {
  const e = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text != null) e.textContent = text;
  return e;
}
const rootPath = () => document.body.dataset.root || './';
const resolve = (rel) => new URL(rootPath() + rel, location.href).href;

/* ---------- состояние и хранилище ---------- */
function storage() { try { const s = window.localStorage; s.getItem(KEY); return s; } catch (e) { return null; } }
function persist() { const s = storage(); if (!s) return; try { s.setItem(KEY, JSON.stringify(app.state)); } catch (e) { /* нет места/запрещено */ } }
function loadStored(version) {
  const s = storage();
  if (!s) return null;
  try {
    const raw = s.getItem(KEY);
    if (!raw) return null;
    const r = validateImport(raw, app.manifest || { course_version: version });
    return r.ok ? r.state : null;
  } catch (e) { return null; }
}
function change(newState) {
  app.state = newState;
  app.dirty = true;
  persist();
  updateIndicator();
}
function updateIndicator() {
  $$('[data-unsaved]').forEach((n) => {
    n.textContent = app.dirty ? 'Есть несохранённые изменения' : 'Все изменения сохранены в файл';
    n.classList.toggle('is-dirty', app.dirty);
  });
}
window.addEventListener('beforeunload', (e) => { if (app.dirty) { e.preventDefault(); e.returnValue = ''; } });

/* ---------- данные ---------- */
async function getJSON(rel) {
  try {
    const r = await fetch(resolve(rel));
    if (!r.ok) return null;
    return await r.json();
  } catch (e) { return null; }
}
const units = () => (app.manifest && app.manifest.units) || [];
const unitMeta = (id) => units().find((u) => u.id === id);

function defaultRoutes() {
  const out = {};
  for (const role of ROLES) {
    const steps = units().filter((u) => !u.roles || u.roles.includes(role)).filter((u) => ['lesson', 'lab', 'quiz'].includes(u.kind)).map((u) => ({ ref: u.id, required: true }));
    out[role] = { title: ROLE_NAMES[role], steps };
  }
  return out;
}
const route = () => (app.routes && app.routes[app.state.route]) || { steps: [] };

/* ---------- готовность шагов ---------- */
function doneState(id) {
  const it = app.state.items[id];
  const k = kindOf(id);
  if (!it) return false;
  if (k === 'lesson' || k === 'case') return it.state === 'read';
  if (k === 'lab') return it.state === 'self_reported' || it.state === 'auto_checked';
  if (k === 'quiz') return it.state === 'passed';
  return false;
}
function nextStep() {
  const steps = route().steps || [];
  for (const s of steps) {
    if (s.required === false || doneState(s.ref)) continue;
    if (s.gate && !doneState(s.gate)) {
      const g = steps.find((x) => x.ref === s.gate);
      if (g && !doneState(g.ref)) return g;
    }
    return s;
  }
  return null;
}

/* ---------- header ---------- */
function ensureToolbar() {
  const header = $('header') || document.body.insertBefore(el('header'), document.body.firstChild);
  let bar = $('.app-toolbar', header);
  const need = ['[data-role-switch]', '[data-save-file]', '[data-unsaved]', '[data-continue]'].some((s) => !$(s, header));
  if (!need) return;
  if (!bar) { bar = el('div', { class: 'app-toolbar' }); header.append(bar); }
  if (!$('[data-role-switch]', header)) {
    const lab = el('label', null, 'Роль: ');
    const sel = el('select', { 'data-role-switch': '' });
    ROLES.forEach((r) => sel.append(el('option', { value: r }, ROLE_NAMES[r])));
    lab.append(sel); bar.append(lab);
  }
  if (!$('[data-continue]', header)) bar.append(el('a', { 'data-continue': '', href: '#' }, 'Продолжить'));
  if (!$('[data-unsaved]', header)) bar.append(el('span', { 'data-unsaved': '', role: 'status' }));
  if (!$('[data-save-file]', header)) bar.append(el('button', { type: 'button', 'data-save-file': '' }, 'Сохранить прогресс в файл'));
}
function bindHeader() {
  ensureToolbar();
  $$('[data-role-switch]').forEach((sel) => {
    sel.value = app.state.route;
    sel.onchange = () => { change({ ...app.state, route: sel.value }); applyRole(); updateContinue(); updatePager(); if (document.body.dataset.page === 'progress') renderProgressPage(); initQuizzes(); };
  });
  $$('[data-save-file]').forEach((b) => { b.onclick = exportFile; });
  updateIndicator();
  updateContinue();
}
function updateContinue() {
  const step = nextStep();
  $$('[data-continue]').forEach((a) => {
    const m = step && unitMeta(step.ref);
    if (m) { a.hidden = false; a.setAttribute('href', resolve(m.url)); a.textContent = 'Продолжить: ' + m.title; }
    else if (!step && (route().steps || []).length) { a.hidden = false; a.removeAttribute('href'); a.textContent = 'Маршрут пройден'; }
    else a.hidden = true;
  });
}
function exportFile() {
  const blob = new Blob([serialize(app.state)], { type: 'application/json' });
  const a = el('a', { href: URL.createObjectURL(blob), download: 'course-progress.json' });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  app.dirty = false; updateIndicator();
}

/* ---------- роли ---------- */
function applyRole() {
  const role = app.state.route.toLowerCase();
  $$('.role-block[data-role]').forEach((b) => {
    const mine = b.dataset.role === role;
    const wrap = b.parentElement && b.parentElement.classList.contains('role-other-wrap') ? b.parentElement : null;
    if (mine) {
      if (wrap) { wrap.replaceWith(b); }
      else { const d = b.closest('details'); if (d && !d.classList.contains('role-other-wrap')) d.open = true; }
    } else if (!wrap && !b.closest('details')) {
      const d = el('details', { class: 'role-other-wrap' });
      d.append(el('summary', null, 'Материал для другой роли (необязательно)'));
      b.replaceWith(d); d.append(b);
    }
  });
}

/* ---------- pager ---------- */
function updatePager() {
  const unit = document.body.dataset.unit;
  const steps = (route().steps || []).map((s) => s.ref);
  const i = steps.indexOf(unit);
  if (i < 0) return;
  const set = (rel, ref) => {
    const a = $('.pager a[rel="' + rel + '"]'); const m = ref && unitMeta(ref);
    if (a && m) { a.setAttribute('href', resolve(m.url)); a.textContent = (rel === 'next' ? 'Далее: ' : 'Назад: ') + m.title; a.hidden = false; }
    else if (a && !m) a.hidden = true;
  };
  set('prev', steps[i - 1]); set('next', steps[i + 1]);
}

/* ---------- чтение ---------- */
function initMarkRead() {
  $$('button[data-mark-read]').forEach((b) => {
    const id = b.dataset.unit || document.body.dataset.unit;
    const sync = () => { const r = doneState(id); b.setAttribute('aria-pressed', r ? 'true' : 'false'); b.textContent = r ? 'Прочитано' : 'Отметить как прочитанное'; };
    sync();
    b.onclick = () => {
      const m = unitMeta(id) || {};
      change(recordRead(app.state, { id, kind: kindOf(id), version: m.version || document.body.dataset.version }));
      sync(); updateContinue();
    };
  });
}

/* ---------- тесты ---------- */
const qver = (q) => (Number.isInteger(q.version) ? q.version : 1);
export function initQuiz(node) {
  if (node.dataset.ready) return;
  let quiz;
  try { quiz = JSON.parse($('script[type="application/json"]', node).textContent); } catch (e) { node.append(el('p', { role: 'alert' }, 'Не удалось прочитать тест.')); return; }
  node.dataset.ready = '1';
  const meta = { ...quiz, id: node.dataset.quiz, version: node.dataset.version || quiz.version };
  const role = app.state.route;
  const qs = (quiz.questions || []).filter((q) => !q.roles || q.roles.includes(role));
  node.replaceChildren(node.firstElementChild);
  const summary = el('div', { class: 'quiz-summary', role: 'status', 'aria-live': 'polite' });
  const renderSummary = () => {
    const a = aggregateQuiz(app.state, meta, role);
    summary.replaceChildren();
    if (!qs.length) { summary.append(el('p', null, 'Для вашей роли в этом тесте нет вопросов, тест не засчитывается.')); return; }
    summary.append(el('p', null, 'Отвечено: ' + a.answered + ' из ' + a.total + '. Верно: ' + a.correct + ' (' + Math.round(a.score * 100) + '%), порог ' + Math.round(a.pass_ratio * 100) + '%.'));
    if (a.critical_failed) summary.append(el('p', { class: 'result-fail' }, 'Критический вопрос отвечен неверно: тест не засчитывается, пока вы не ответите на него верно.'));
    summary.append(el('p', { class: a.state === 'passed' ? 'result-ok' : '' }, 'Итог: ' + (a.state === 'passed' ? 'тест сдан' : a.state === 'failed' ? 'тест не сдан, повторите вопросы с ошибками' : 'ответьте на все вопросы')));
  };
  if (!qs.length) { renderSummary(); node.append(summary); return; }
  node.append(el('p', null, 'Вопросов для роли «' + ROLE_NAMES[role] + '»: ' + qs.length + '.'));
  qs.forEach((q, qi) => {
    const form = el('form', { class: 'question', novalidate: '' });
    form.addEventListener('submit', (e) => e.preventDefault());
    const fs = el('fieldset');
    const lg = el('legend', null, (qi + 1) + '. ' + q.prompt);
    fs.append(lg);
    if (q.critical) fs.append(el('p', { class: 'critical-note' }, 'Критический вопрос: ошибка блокирует сдачу теста.'));
    const multi = q.type === 'multi' || (q.correct || []).length > 1;
    const labels = {};
    (q.options || []).forEach((o) => {
      const iid = q.id.replace(/\W/g, '_') + '_' + o.id;
      const lab = el('label', { for: iid, class: 'choice' });
      lab.append(el('input', { type: multi ? 'checkbox' : 'radio', name: q.id, id: iid, value: o.id }), document.createTextNode(' ' + o.text));
      labels[o.id] = lab; fs.append(lab);
    });
    const fb = el('div', { class: 'feedback', role: 'status', 'aria-live': 'polite' });
    const btn = el('button', { type: 'button' }, 'Ответить');
    const retry = el('button', { type: 'button', hidden: '' }, 'Попробовать ещё раз');
    form.append(fs, btn, retry, fb);
    const prev = ((app.state.items[meta.id] || {}).questions || {})[q.id];
    if (prev && prev.v === qver(q)) fb.textContent = 'Ранее: ' + (prev.correct ? 'верно' : 'неверно') + '. Попыток: ' + prev.attempts + '.';
    btn.onclick = () => {
      const sel = $$('input:checked', form).map((i) => i.value);
      if (!sel.length) { fb.replaceChildren(el('p', { class: 'result-fail' }, 'Выберите ответ.')); return; }
      change(recordQuizAnswer(app.state, meta, { ...q, version: qver(q) }, sel));
      const ok = app.state.items[meta.id].questions[q.id].correct;
      fb.replaceChildren(el('p', { class: ok ? 'result-ok' : 'result-fail' }, ok ? 'Верно.' : 'Неверно.'));
      fb.append(el('p', null, q.explanation || ''));
      if (!ok) sel.forEach((id) => { const w = (q.wrong_explanations || {})[id]; if (w && !(q.correct || []).includes(id)) fb.append(el('p', { class: 'wrong-expl' }, 'Вариант «' + (labels[id].textContent.trim()) + '»: ' + w)); });
      $$('input', form).forEach((i) => { i.disabled = true; });
      btn.hidden = true;
      if (!ok) { retry.hidden = false; }
      renderSummary(); updateContinue();
    };
    retry.onclick = () => { $$('input', form).forEach((i) => { i.disabled = false; i.checked = false; }); btn.hidden = false; retry.hidden = true; fb.replaceChildren(); $('input', form).focus(); };
    node.append(form);
  });
  node.append(summary);
  renderSummary();
}
function initQuizzes() {
  $$('.quiz[data-quiz]').forEach((n) => {
    if (n.dataset.ready && n.dataset.role !== app.state.route) { // роль сменилась: перерисовать
      const s = $('script[type="application/json"]', n);
      n.replaceChildren(s); delete n.dataset.ready;
    }
    initQuiz(n); n.dataset.role = app.state.route;
  });
}

/* ---------- практика ---------- */
function initLab() {
  const nodes = $$('.activity[data-activity]');
  if (!nodes.length) return;
  const labId = document.body.dataset.unit;
  const labMeta = () => ({ id: labId, version: document.body.dataset.version, activities: nodes.map((n) => { const a = readActivity(n) || {}; return { id: n.dataset.activity, v: Number.isInteger(a.version) ? a.version : 1, required: a.required, roles: a.roles }; }) });
  const progress = {
    getActivity: (id) => ((app.state.items[labId] || {}).activities || {})[id],
    setActivity: (a, status) => { change(recordActivity(app.state, labMeta(), { id: a.id, v: a.v }, status)); updateContinue(); },
  };
  initActivities(document, progress);
}

/* ---------- поиск ---------- */
const fold = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е');
export function searchDocs(index, q) {
  const toks = fold(q).split(/[^a-zа-я0-9]+/).filter(Boolean);
  if (!toks.length) return [];
  const res = [];
  for (const d of index) {
    const title = fold(d.title), text = fold(d.text);
    const words = new Set(text.split(/[^a-zа-я0-9]+/)), tw = title.split(/[^a-zа-я0-9]+/);
    let score = 0, ok = true;
    for (const t of toks) {
      let s = 0;
      if (tw.includes(t)) s = 10; else if (tw.some((w) => w.startsWith(t))) s = 6;
      if (words.has(t)) s += 2; else if ([...words].some((w) => w.startsWith(t))) s += 1;
      if (!s) { ok = false; break; }
      score += s;
    }
    if (ok) res.push({ d, score });
  }
  return res.sort((a, b) => b.score - a.score).map((r) => r.d);
}
async function initSearch() {
  if (document.body.dataset.page !== 'search') return;
  const main = $('#main');
  let out = $('[data-search-results]'), input = $('[data-search-input]') || $('input[type="search"]', main);
  if (!input) {
    const f = el('form', { role: 'search' }); const l = el('label', { for: 'q' }, 'Поиск по курсу ');
    input = el('input', { type: 'search', id: 'q', autocomplete: 'off' }); f.append(l, input); f.addEventListener('submit', (e) => e.preventDefault()); main.append(f);
  }
  if (!out) { out = el('div', { 'data-search-results': '', role: 'status', 'aria-live': 'polite' }); main.append(out); }
  if (!app.searchIndex) app.searchIndex = (await getJSON('search-index.json')) || [];
  const run = () => {
    out.replaceChildren();
    const q = input.value.trim();
    if (!q) return;
    const r = searchDocs(app.searchIndex, q).slice(0, 30);
    if (!r.length) { out.append(el('p', null, 'Ничего не найдено.')); return; }
    out.append(el('p', null, 'Найдено: ' + r.length));
    const ul = el('ul');
    r.forEach((d) => { const li = el('li'); const a = el('a', { href: resolve(d.url) }, d.title); li.append(a, document.createTextNode(' — ' + (d.kind || ''))); ul.append(li); });
    out.append(ul);
  };
  input.addEventListener('input', run);
  const q0 = new URLSearchParams(location.search).get('q');
  if (q0 && !input.value) input.value = q0;
  run();
}

/* ---------- страница прогресса ---------- */
function renderProgressPage() {
  if (document.body.dataset.page !== 'progress') return;
  const main = $('#main');
  let box = $('[data-progress-root]');
  if (!box) { box = el('div', { 'data-progress-root': '' }); main.append(box); }
  box.replaceChildren();
  const note = el('p', null, app.dirty ? 'Есть несохранённые изменения. Сохраните прогресс в файл, чтобы не потерять его при закрытии вкладки.' : 'Несохранённых изменений нет.');
  const tbl = el('table', { class: 'progress-table' });
  tbl.append(el('caption', null, 'Сводка по единицам курса (маршрут: ' + ROLE_NAMES[app.state.route] + ')'));
  const head = el('tr'); ['Единица', 'Тип', 'Прочитано', 'Тест', 'Практика'].forEach((h) => head.append(el('th', { scope: 'col' }, h)));
  tbl.append(el('thead')).firstChild.append(head);
  const tb = el('tbody');
  units().filter((u) => ['lesson', 'case', 'quiz', 'lab'].includes(u.kind)).forEach((u) => {
    const it = app.state.items[u.id];
    const tr = el('tr'); const th = el('th', { scope: 'row' }); th.append(el('a', { href: resolve(u.url) }, u.title)); tr.append(th, el('td', null, KIND_NAMES[u.kind]));
    let st = it ? it.state : 'not_started';
    if (u.kind === 'quiz' && it && it.questions) { const q = aggregateQuiz(app.state, { id: u.id, questions: (window.__quizCache || {})[u.id] }, app.state.route); if (it.score != null) st = it.state; void q; }
    const dash = '—';
    tr.append(el('td', null, u.kind === 'lesson' || u.kind === 'case' ? ST_NAMES[st] : dash), el('td', null, u.kind === 'quiz' ? ST_NAMES[st] + (it && it.score != null ? ' (' + Math.round(it.score * 100) + '%)' : '') : dash), el('td', null, u.kind === 'lab' ? ST_NAMES[st] : dash));
    tb.append(tr);
  });
  tbl.append(tb);
  const actions = el('div', { class: 'progress-actions' });
  const exp = el('button', { type: 'button' }, 'Сохранить прогресс в файл'); exp.onclick = () => { exportFile(); renderProgressPage(); };
  const impLab = el('label', { for: 'import-file' }, 'Загрузить прогресс из файла: ');
  const imp = el('input', { type: 'file', id: 'import-file', accept: 'application/json,.json' });
  const rst = el('button', { type: 'button' }, 'Сбросить прогресс');
  const msg = el('div', { class: 'import-msg', role: 'status', 'aria-live': 'polite' });
  imp.onchange = () => {
    const f = imp.files && imp.files[0]; if (!f) return;
    if (f.size > 262144) { msg.textContent = 'Файл больше 262144 байт, импорт отклонён.'; imp.value = ''; return; }
    const fr = new FileReader();
    fr.onload = () => {
      const r = validateImport(String(fr.result), app.manifest || { course_version: document.body.dataset.version });
      msg.replaceChildren();
      if (!r.ok) { msg.append(el('p', { class: 'result-fail' }, 'Файл отклонён.')); const ul = el('ul'); r.errors.slice(0, 10).forEach((e) => ul.append(el('li', null, e))); msg.append(ul); imp.value = ''; return; }
      if (!window.confirm('Заменить текущий прогресс данными из файла? Текущий прогресс будет потерян.' + (r.warnings.length ? '\nПредупреждений: ' + r.warnings.length : ''))) { imp.value = ''; return; }
      change(r.state); app.dirty = false; persist(); updateIndicator();
      renderProgressPage();
      const m = $('.import-msg');
      if (m && r.warnings.length) { const ul = el('ul'); r.warnings.slice(0, 10).forEach((w) => ul.append(el('li', null, w))); m.append(el('p', null, 'Импорт выполнен с предупреждениями:'), ul); }
      else if (m) m.textContent = 'Импорт выполнен.';
      const sel = $('[data-role-switch]'); if (sel) sel.value = app.state.route;
      applyRole(); updateContinue();
    };
    fr.onerror = () => { msg.textContent = 'Не удалось прочитать файл.'; };
    fr.readAsText(f);
  };
  rst.onclick = () => {
    if (!window.confirm('Удалить весь прогресс в этой вкладке? Действие нельзя отменить.')) return;
    change(createProgress(app.state.course_version)); app.dirty = false; persist(); updateIndicator(); updateContinue(); renderProgressPage();
  };
  actions.append(exp, el('br'), impLab, imp, el('br'), rst);
  box.append(note, tbl, actions, msg);
  const hint = el('p', null, 'Раздельные статусы: «прочитано» относится к урокам и кейсам, «тест» — к результату теста, «практика» — к лабораторной. Чтение не засчитывается открытием страницы.');
  box.append(hint);
}

/* ---------- навигация ---------- */
function pageInit() {
  bindHeader();
  applyRole();
  updatePager();
  initMarkRead();
  initQuizzes();
  initLab();
  initSearch();
  renderProgressPage();
}
function isInternalNav(a, e) {
  if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false;
  if (a.target && a.target !== '_self') return false;
  if (a.hasAttribute('download') || !a.getAttribute('href') || a.getAttribute('href') === '#') return false;
  const u = new URL(a.href, location.href);
  if (u.origin !== location.origin) return false;
  if (u.pathname === location.pathname && u.search === location.search) return false; // якорь на той же странице
  if (/\.(json|zip|csv|txt|md|pdf|png|svg)$/i.test(u.pathname) || /\/files\//.test(u.pathname)) return false;
  return true;
}
async function navigate(url, push) {
  try {
    const r = await fetch(url);
    const ct = r.headers.get('content-type') || '';
    if (!r.ok || !ct.includes('text/html')) throw new Error('bad');
    const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
    if (!doc.getElementById('main')) throw new Error('no main');
    if (push) history.pushState({}, '', url);
    for (const k of Object.keys(document.body.dataset)) delete document.body.dataset[k];
    for (const [k, v] of Object.entries(doc.body.dataset)) document.body.dataset[k] = v;
    document.title = doc.title;
    $$('body > :not(script[src])').forEach((n) => n.remove());
    [...doc.body.children].filter((n) => !(n.tagName === 'SCRIPT' && n.src)).forEach((n) => document.body.insertBefore(document.importNode(n, true), $('body > script[src]')));
    pageInit();
    const u = new URL(url, location.href);
    const target = u.hash && document.getElementById(decodeURIComponent(u.hash.slice(1)));
    if (target) target.scrollIntoView(); else window.scrollTo(0, 0);
    const main = $('#main'); if (main) main.focus({ preventScroll: !!target });
  } catch (e) {
    location.href = url; // запасной вариант: обычный переход
  }
}
document.addEventListener('click', (e) => {
  const a = e.target.closest && e.target.closest('a[href]');
  if (!isInternalNav(a, e)) return;
  e.preventDefault();
  navigate(a.href, true);
});
window.addEventListener('popstate', () => navigate(location.href, false));

/* ---------- старт ---------- */
async function start() {
  app.manifest = await getJSON('manifest.json');
  const routes = await getJSON('routes.json');
  app.routes = routes && Object.keys(routes).length ? routes : defaultRoutes();
  const version = (app.manifest && app.manifest.course_version) || document.body.dataset.version || '';
  app.state = loadStored(version) || createProgress(version);
  app.state.course_version = version || app.state.course_version;
  pageInit();
}
if (typeof document !== 'undefined' && document.body) start();
export { refreshQuiz, aggregateLab };
