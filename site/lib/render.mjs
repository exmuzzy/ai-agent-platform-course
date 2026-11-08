// Шаблоны страниц сайта курса.
// NOTE-W01: форма Content не зафиксирована в INTERFACES; принято (см. acc-функции ниже, всё необязательное терпимо к отсутствию):
//  content.version | content.course.version; content.manifest.modules[{id,status,path}];
//  content.modules[{id,title,status,version,summary,roles,est_minutes_by_role,prerequisites,
//     readme|lesson-объекты: {path, body|src}, lessons[{id,title,version,roles,est_minutes,path,body}],
//     lab{...}, assessment{...}, solutions{...}, quiz (разобранный quiz.json)}];
//  content.cases[{id,title,path,body}], content.routes{USER|BUILDER|ENGINEER:{title,outcome,steps}} (иначе строятся по умолчанию),
//  content.docs{glossary,kernel,roadmap,learningPaths,problemPatterns,fixtureContract,proposals[]}: {path,body,title},
//  content.sources (registry.json: {sources[]}), content.fixtures[{id,path,json}].
// NOTE-W01: manifest.json и files/* пишет build.mjs; здесь выдаются search-index.json, routes.json, 404.html и страницы.
// NOTE-W01: переключение видимости ролевых блоков (details для невыбранных ролей) выполняет клиент (app.js); без JS показаны все блоки с подписью.
import path from 'node:path';
import { renderMarkdown, escapeHtml as esc, jsonForScript } from './markdown.mjs';

const ROLES = ['USER', 'BUILDER', 'ENGINEER'];
const ROLE_NAME = { USER: 'Пользователь', BUILDER: 'Строитель', ENGINEER: 'Инженер' };
const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'";
const body = (x) => (x ? x.body ?? x.src ?? x.content ?? '' : '');
const noH1 = (h) => h.replace(/<h1[^>]*>[\s\S]*?<\/h1>\n?/g, '');
const strip = (s) => s.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
const modNum = (id) => id.replace(/\D/g, '');

function relUrl(fromDir, toPage) { // оба без ведущего '/', toPage оканчивается '/' или файл
  let r = path.posix.relative(fromDir || '.', toPage.replace(/index\.html$/, ''));
  if (toPage.endsWith('index.html') || toPage.endsWith('/')) r = (r ? r + '/' : './');
  return r || './';
}
const rootOf = (dir) => (dir ? dir.split('/').map(() => '..').join('/') + '/' : './');

export function renderSite(content) {
  const out = new Map();
  const version = content.version ?? content.course?.version ?? content.manifest?.course_version ?? '0.0.0';
  const courseTitle = content.course?.title ?? 'Курс по ИИ-агентам для сотрудников';
  const manifestMods = content.manifest?.modules ?? [];
  const mods = (content.modules ?? []).map((m) => ({ ...m }));
  const modById = new Map(mods.map((m) => [m.id, m]));
  const allMods = [];
  const ids = new Set([...manifestMods.map((m) => m.id), ...mods.map((m) => m.id)]);
  for (const id of [...ids].sort()) {
    const mm = manifestMods.find((m) => m.id === id) || {};
    const m = modById.get(id) || {};
    const status = mm.status ?? m.status ?? 'planned';
    const slug = (mm.path || m.path || '').split('/').pop().replace(/^M\d+-/, '');
    allMods.push({ ...m, id, status, title: m.title || (slug ? `${id}: ${slug}` : id), published: status !== 'planned' && !!modById.get(id) });
  }
  const pub = allMods.filter((m) => m.published);

  // ---------- карта путей репозитория -> страницы ----------
  const pageOf = new Map();
  for (const m of pub) {
    const base = `m/${m.id}/`;
    pageOf.set(`${m.path || ''}/README.md`, base);
    for (const l of m.lessons ?? []) pageOf.set(l.path, `${base}lesson-${l.id.slice(-2)}/`);
    if (m.lab) pageOf.set(m.lab.path, `${base}lab/`);
    if (m.assessment) pageOf.set(m.assessment.path, `${base}quiz/`);
    if (m.quiz) pageOf.set(m.quiz.path || `${m.path}/quiz.json`, `${base}quiz/`);
    if (m.solutions) pageOf.set(m.solutions.path, `${base}solutions/`);
  }
  for (const c of content.cases ?? []) pageOf.set(c.path, `cases/${c.id}/`);
  const d = content.docs ?? {};
  const docPages = [
    ['glossary', 'reference/glossary/', 'Глоссарий'],
    ['kernel', 'reference/kernel/', 'Каталог возможностей ядра'],
    ['roadmap', 'reference/kernel/', null],
    ['learningPaths', 'reference/learning-paths/', 'Маршруты обучения'],
    ['problemPatterns', 'reference/problem-patterns/', 'Типовые проблемы'],
    ['fixtureContract', 'reference/fixture-contract/', 'Контракт учебных наборов'],
  ];
  for (const [k, p] of docPages) if (d[k]?.path) pageOf.set(d[k].path, p);
  for (const p of d.proposals ?? []) pageOf.set(p.path, `reference/kernel/#${p.id}`);
  pageOf.set('sources/registry.json', 'reference/sources/');
  const fixtureFile = (f) => `files/${f.id}/fixture.json`;
  for (const f of content.fixtures ?? []) if (f.path) pageOf.set(f.path, fixtureFile(f));

  const makeUrlFor = (pageDir) => (target) => {
    const p = pageOf.get(target);
    if (!p) return null;
    const [pp, frag] = p.split('#');
    return relUrl(pageDir, pp) + (frag ? '#' + frag : '');
  };
  const md = (src, filePath, pageDir) => renderMarkdown(strip(src), { path: filePath, urlFor: makeUrlFor(pageDir) });

  // ---------- маршруты ----------
  const routes = {};
  for (const role of ROLES) {
    const given = content.routes?.[role];
    if (given) { routes[role] = given; continue; }
    const steps = [];
    for (const m of pub) {
      for (const l of m.lessons ?? []) if (!l.roles || l.roles.includes(role)) steps.push({ ref: l.id, required: true });
      if (m.lab && (!m.lab.roles || m.lab.roles.includes(role))) steps.push({ ref: m.lab.id, required: true });
      if (m.quiz) {
        const has = (m.quiz.questions ?? []).some((q) => !q.roles || q.roles.includes(role));
        if (has) steps.push({ ref: `${m.id}.QZ`, required: true });
      }
    }
    routes[role] = {
      title: `Маршрут: ${ROLE_NAME[role]}`,
      outcome: { USER: 'Безопасно ставить задачу ассистенту, проверять результат и вовремя передавать решение человеку.', BUILDER: 'Описывать повторяемую работу ассистента и проверять её по критериям.', ENGINEER: 'Проверять границы, права и воспроизводимость решений на уровне реализации.' }[role],
      steps,
    };
  }
  const unitUrl = new Map(); // id -> {url,title,kind}
  for (const m of pub) {
    unitUrl.set(m.id, { url: `m/${m.id}/`, title: m.title, kind: 'module' });
    for (const l of m.lessons ?? []) unitUrl.set(l.id, { url: `m/${m.id}/lesson-${l.id.slice(-2)}/`, title: l.title, kind: 'lesson' });
    if (m.lab) unitUrl.set(m.lab.id, { url: `m/${m.id}/lab/`, title: m.lab.title, kind: 'lab' });
    if (m.quiz) unitUrl.set(`${m.id}.QZ`, { url: `m/${m.id}/quiz/`, title: `Тест ${m.id}`, kind: 'quiz' });
  }
  for (const c of content.cases ?? []) unitUrl.set(c.id, { url: `cases/${c.id}/`, title: c.title, kind: 'case' });
  const defaultOrder = routes.USER.steps.map((s) => s.ref);
  const orderFor = (ref) => (defaultOrder.includes(ref) ? defaultOrder : [ref]);

  // ---------- layout ----------
  const nav = (root) => [
    ['', 'Главная'], ['route/user/', 'Маршруты'], ['reference/glossary/', 'Глоссарий'], ['reference/kernel/', 'Ядро'],
    ['reference/sources/', 'Источники'], ['search/', 'Поиск'], ['progress/', 'Прогресс'], ['downloads/', 'Файлы'],
  ].map(([h, t]) => `<a href="${root}${h}">${t}</a>`).join('\n');

  function layout({ dir, page, unit, title, h1, main, pager, extra = '' }) {
    const root = rootOf(dir);
    const fullTitle = h1 === courseTitle || page === 'home' ? courseTitle : `${title} — ${courseTitle}`;
    return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<title>${esc(fullTitle)}</title>
<link rel="stylesheet" href="${root}assets/style.css">
<script type="module" src="${root}assets/app.js"></script>
</head>
<body data-root="${root}" data-page="${page}"${unit ? ` data-unit="${esc(unit)}"` : ''} data-version="${esc(version)}">
<a class="skip-link" href="#main">Перейти к содержимому</a>
<header class="site-header">
<div class="header-row">
<a class="site-title" href="${root}">${esc(courseTitle)}</a>
<div class="header-tools">
<label class="role-picker">Роль
<select data-role-switch aria-label="Выбор роли">
${ROLES.map((r) => `<option value="${r}">${ROLE_NAME[r]} (${r})</option>`).join('\n')}
</select></label>
<span class="unsaved" data-unsaved hidden role="status">Есть несохранённые изменения</span>
<a class="continue" data-continue href="#" hidden>Продолжить</a>
<button type="button" class="btn" data-save-file>Сохранить прогресс в файл</button>
</div>
</div>
<nav class="site-nav" aria-label="Основная навигация">
${nav(root)}
</nav>
</header>
<main id="main" tabindex="-1">
<h1>${esc(h1)}</h1>
${main}
${pager || ''}
</main>
<footer class="site-footer">
<p>Симуляция не доказывает доступ к рабочим системам и не заменяет его. Хостинг может хранить IP-адреса посетителей в журналах. Результаты самопроверки не являются аттестацией.</p>
<p>Версия курса: ${esc(version)}. Прогресс хранится в браузере и в файле, который вы сохраняете сами.</p>
</footer>
${extra}
</body>
</html>
`;
  }

  function pagerFor(dir, ref) {
    const order = orderFor(ref);
    const i = order.indexOf(ref);
    if (i < 0) return '';
    const root = rootOf(dir);
    const link = (r, rel, label) => {
      const u = unitUrl.get(r);
      return u ? `<a rel="${rel}" href="${root}${u.url}">${label}: ${esc(u.title)}</a>` : '';
    };
    const prev = i > 0 ? link(order[i - 1], 'prev', 'Назад') : '';
    const next = i < order.length - 1 ? link(order[i + 1], 'next', 'Далее') : '';
    if (!prev && !next) return '';
    return `<nav class="pager" aria-label="Переход по маршруту">${prev}${next}</nav>`;
  }
  const readBtn = (id) => `<p><button type="button" class="btn" data-mark-read="${esc(id)}" aria-pressed="false">Отметить как прочитанное</button></p>`;
  const toc = (hs) => {
    const items = hs.filter((h) => h.level === 2);
    return items.length > 1 ? `<nav class="toc" aria-label="Содержание страницы"><ul>${items.map((h) => `<li><a href="#${h.id}">${esc(h.text)}</a></li>`).join('')}</ul></nav>` : '';
  };
  const index = [];
  const put = (p, html, rec) => { out.set(p, html); if (rec) index.push(rec); };
  const addIndex = (id, title, kind, url, text) => index.push({ id, title, kind, url, text: text.toLowerCase().replace(/\s+/g, ' ').slice(0, 2000) });

  function docPage({ dir, page, unit, title, src, filePath, ref, kind, id, extraBefore = '', extraAfter = '' }) {
    const r = md(src, filePath, dir);
    r.html = r.html.replace(/<h1[^>]*>[\s\S]*?<\/h1>\n?/, ''); // единственный h1 — в шаблоне страницы
    const main = `${extraBefore}${toc(r.headings.filter((h) => h.level > 1))}<article class="prose">${r.html}</article>${extraAfter}`;
    put(`${dir}/index.html`, layout({ dir, page, unit, title, h1: title, main: main + (ref ? readBtn(ref) : ''), pager: ref ? pagerFor(dir, ref) : '' }));
    addIndex(id || unit || dir, title, kind || page, `${dir}/`, r.text);
    return r;
  }

  // ---------- модули ----------
  for (const m of pub) {
    const dir = `m/${m.id}`;
    const root = rootOf(dir);
    const lessonsList = (m.lessons ?? []).map((l) => `<li><a href="${root}m/${m.id}/lesson-${l.id.slice(-2)}/">${esc(l.title)}</a> <span class="meta">${l.est_minutes ? l.est_minutes + ' мин' : ''}</span></li>`).join('');
    const parts = [
      lessonsList,
      m.lab ? `<li><a href="${root}${dir}/lab/">${esc(m.lab.title)}</a> <span class="meta">практикум</span></li>` : '',
      m.quiz ? `<li><a href="${root}${dir}/quiz/">Тест по модулю ${m.id}</a></li>` : '',
      m.solutions ? `<li><a href="${root}${dir}/solutions/">Разбор решений</a></li>` : '',
    ].join('');
    const nextStep = `<h2>Содержание модуля</h2><ul class="unit-list">${parts}</ul>`;
    const r = m.readme || { path: `${m.path}/README.md`, body: m.body || '' };
    docPage({ dir, page: 'route', unit: m.id, title: m.title, src: body(r), filePath: r.path || `${m.path}/README.md`, kind: 'module', id: m.id, extraAfter: nextStep });
    (m.lessons ?? []).forEach((l) => {
      docPage({ dir: `${dir}/lesson-${l.id.slice(-2)}`, page: 'lesson', unit: l.id, title: l.title, src: body(l), filePath: l.path, ref: l.id, kind: 'lesson', id: l.id });
    });
    if (m.lab) {
      const ldir = `${dir}/lab`;
      docPage({ dir: ldir, page: 'lab', unit: m.lab.id, title: m.lab.title, src: body(m.lab), filePath: m.lab.path, ref: m.lab.id, kind: 'lab', id: m.lab.id });
    }
    if (m.quiz) {
      const qdir = `${dir}/quiz`;
      const quizJson = m.quiz.json ?? m.quiz;
      const ass = m.assessment ? md(body(m.assessment), m.assessment.path, qdir) : null;
      const quizHtml = `<div class="quiz" data-quiz="${m.id}.QZ" data-version="${esc(quizJson.version ?? version)}"><script type="application/json">${jsonForScript(quizJson)}</script><noscript><p>Для прохождения теста нужен JavaScript. Вопросы и ответы приведены в разборе решений.</p></noscript></div>`;
      const asideHtml = ass ? `<details class="assessment-info"><summary>Критерии оценивания</summary><div class="prose">${noH1(ass.html)}</div></details>` : '';
      const main = `${quizHtml}${asideHtml}`;
      put(`${qdir}/index.html`, layout({ dir: qdir, page: 'quiz', unit: `${m.id}.QZ`, title: `Тест ${m.id}`, h1: `Тест ${m.id}`, main, pager: pagerFor(qdir, `${m.id}.QZ`) }));
      addIndex(`${m.id}.QZ`, `Тест ${m.id}`, 'quiz', `${qdir}/`, (quizJson.questions ?? []).map((q) => q.prompt).join(' '));
    }
    if (m.solutions) {
      docPage({ dir: `${dir}/solutions`, page: 'solutions', unit: m.solutions.id || `${m.id}.SOL`, title: `Разбор решений ${m.id}`, src: body(m.solutions), filePath: m.solutions.path, kind: 'solutions', id: m.solutions.id || `${m.id}.SOL` });
    }
  }

  // ---------- кейсы ----------
  for (const c of content.cases ?? []) {
    docPage({ dir: `cases/${c.id}`, page: 'case', unit: c.id, title: c.title || `Кейс ${c.id}`, src: body(c), filePath: c.path, ref: c.id, kind: 'case', id: c.id });
  }

  // ---------- справочники ----------
  if (d.glossary) docPage({ dir: 'reference/glossary', page: 'reference', title: 'Глоссарий', src: body(d.glossary), filePath: d.glossary.path, kind: 'reference', id: 'glossary' });
  for (const [k, p, t] of docPages.slice(3)) if (d[k]) docPage({ dir: p.replace(/\/$/, ''), page: 'reference', title: t, src: body(d[k]), filePath: d[k].path, kind: 'reference', id: k });

  { // ядро
    const dir = 'reference/kernel';
    const cap = d.kernel ? md(body(d.kernel), d.kernel.path, dir) : { html: '', text: '', headings: [] };
    const html = noH1(cap.html).replace(/<table>([\s\S]*?)<\/table>/g, (whole, inner) => {
      const head = /<thead>([\s\S]*?)<\/thead>/.exec(inner);
      if (!head) return whole;
      const cols = [...head[1].matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((x) => x[1].replace(/<[^>]+>/g, '').trim());
      const si = cols.indexOf('Статус');
      if (si < 0) return whole;
      const tagged = inner.replace(/<tbody>([\s\S]*)<\/tbody>/, (_, tb) => '<tbody>' + tb.replace(/<tr>([\s\S]*?)<\/tr>/g, (_r, row) => {
        const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((x) => x[1].replace(/<[^>]+>/g, '').trim());
        return `<tr data-status="${esc(cells[si] || '')}">${row}</tr>`;
      }) + '</tbody>');
      return `<table data-kc-table>${tagged}</table>`;
    });
    const statuses = [...new Set([...html.matchAll(/data-status="([^"]+)"/g)].map((x) => x[1]))].sort();
    const filter = statuses.length ? `<p class="filter"><label>Фильтр по статусу <select data-status-filter><option value="">Все</option>${statuses.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join('')}</select></label></p>` : '';
    const props = (d.proposals ?? []).map((p) => {
      const r = md(body(p), p.path, dir);
      return `<section class="proposal" id="${esc(p.id)}"><h3>${esc(p.id)}: ${esc(p.title || '')}</h3><p class="status">Статус: гипотеза (hypothesis), требует проверки</p>${r.html.replace(/<h1[^>]*>[\s\S]*?<\/h1>/, '')}</section>`;
    }).join('');
    const road = d.roadmap ? md(body(d.roadmap), d.roadmap.path, dir) : null;
    const main = `<p class="notice">Это справочник по ядру harness-kernel. Статус «implemented» означает подтверждение публичным аудитом, а не работу у сотрудника; предложения KP и дорожная карта имеют статус hypothesis.</p>
<h2 id="catalog">Каталог возможностей</h2>${filter}<div class="prose">${html}</div>
<h2 id="proposals">Предложения (KP), статус hypothesis</h2>${props}
${road ? `<h2 id="roadmap">Дорожная карта, статус hypothesis</h2><div class="prose">${noH1(road.html)}</div>` : ''}`;
    put(`${dir}/index.html`, layout({ dir, page: 'reference', title: 'Ядро: возможности и предложения', h1: 'Ядро: возможности, предложения, дорожная карта', main }));
    addIndex('kernel', 'Ядро: возможности и предложения', 'reference', `${dir}/`, cap.text + (road ? ' ' + road.text : ''));
  }

  { // источники
    const dir = 'reference/sources';
    const list = content.sources?.sources ?? content.sources ?? [];
    const rows = (Array.isArray(list) ? list : []).map((s) => `<tr id="${esc(s.id)}"><td>${esc(s.id)}</td><td>${s.url && String(s.url).startsWith('https://') ? `<a href="${esc(s.url)}" rel="noopener noreferrer">${esc(s.title)}</a>` : esc(s.title)}</td><td>${esc(s.publisher || '')}</td><td>${esc(s.type || '')}</td><td>${esc(s.access || '')}</td></tr>`).join('');
    const main = `<p>Проверено: ${esc(content.sources?.checked_on || 'дата не указана')}. ${esc(content.sources?.scope || '')}</p><div class="table-wrap" tabindex="0" role="region" aria-label="Таблица источников"><table><thead><tr><th>ID</th><th>Источник</th><th>Издатель</th><th>Тип</th><th>Доступ</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    put(`${dir}/index.html`, layout({ dir, page: 'reference', title: 'Источники', h1: 'Источники', main }));
    addIndex('sources', 'Источники', 'reference', `${dir}/`, (Array.isArray(list) ? list : []).map((s) => `${s.id} ${s.title} ${s.publisher || ''}`).join(' '));
  }

  { // поиск
    const dir = 'search';
    const main = `<form role="search" data-search-form action="./"><label for="q">Запрос</label> <input id="q" type="search" name="q" autocomplete="off"> <button type="submit" class="btn">Искать</button></form>
<div data-search-results aria-live="polite"></div><noscript><p>Для поиска нужен JavaScript.</p></noscript>`;
    put(`${dir}/index.html`, layout({ dir, page: 'search', title: 'Поиск', h1: 'Поиск по курсу', main }));
  }

  { // прогресс
    const dir = 'progress';
    const main = `<p>Прогресс хранится только у вас: в памяти страницы, при доступности в браузере, и в файле, который вы сохраняете. Имена и личные данные в файл не попадают. Результаты самопроверки не являются аттестацией.</p>
<div class="actions">
<button type="button" class="btn" data-export-progress>Экспорт в файл</button>
<label class="btn file-btn">Импорт из файла <input type="file" accept="application/json,.json" data-import-progress></label>
<button type="button" class="btn danger" data-reset-progress>Сброс</button>
</div>
<div data-progress-message role="status" aria-live="polite"></div>
<h2>Единицы курса</h2>
<ul class="unit-list" data-progress-list>
${[...unitUrl.entries()].filter(([, u]) => u.kind !== 'module').map(([id, u]) => `<li data-unit-row="${esc(id)}" data-kind="${u.kind}"><a href="${rootOf(dir)}${u.url}">${esc(u.title)}</a> <span class="meta">${esc(id)}</span> <span class="state" data-unit-state>не начато</span></li>`).join('\n')}
</ul>`;
    put(`${dir}/index.html`, layout({ dir, page: 'progress', title: 'Прогресс', h1: 'Мой прогресс', main }));
  }

  { // файлы
    const dir = 'downloads';
    const fx = (content.fixtures ?? []).map((f) => `<li><a href="${rootOf(dir)}${fixtureFile(f)}" download>${esc(f.id)}: fixture.json</a> <span class="meta">учебный синтетический набор</span></li>`).join('');
    const main = `<p>Файлы для самостоятельной работы. Данные вымышленные.</p><ul class="unit-list">${fx || '<li>Файлов пока нет.</li>'}</ul>`;
    put(`${dir}/index.html`, layout({ dir, page: 'downloads', title: 'Файлы', h1: 'Файлы для скачивания', main }));
  }

  // ---------- маршрут по ролям ----------
  for (const role of ROLES) {
    const dir = `route/${role.toLowerCase()}`;
    const root = rootOf(dir);
    const rt = routes[role];
    const done = new Set(rt.steps.map((s) => s.ref));
    const stepItems = rt.steps.map((s) => {
      const u = unitUrl.get(s.ref);
      return u ? `<li data-step="${esc(s.ref)}"><a href="${root}${u.url}">${esc(u.title)}</a> <span class="meta">${s.required ? 'обязательно' : 'по желанию'}${s.gate ? `, после ${esc(s.gate)}` : ''}</span> <span class="state" data-unit-state></span></li>` : '';
    }).join('');
    const planned = allMods.filter((m) => !m.published).map((m) => `<li class="planned">${esc(m.title)} <span class="meta">в разработке</span></li>`).join('');
    const main = `<p class="lead">${esc(rt.outcome)}</p>
<p class="role-switch">${ROLES.map((r) => `<a class="btn${r === role ? ' current' : ''}" href="${root}../${r.toLowerCase()}/"${r === role ? ' aria-current="page"' : ''}>${ROLE_NAME[r]}</a>`).join(' ')}</p>
<h2>Шаги</h2><ol class="unit-list">${stepItems}</ol>
${planned ? `<h2>Позже</h2><ul class="unit-list">${planned}</ul>` : ''}`;
    put(`${dir}/index.html`, layout({ dir, page: 'route', title: rt.title || `Маршрут ${role}`, h1: rt.title || `Маршрут ${role}`, main }));
    addIndex(`route.${role}`, rt.title || role, 'route', `${dir}/`, rt.outcome || '');
  }

  { // главная
    const root = './';
    const first = (r) => routes[r].steps.map((s) => unitUrl.get(s.ref)).find(Boolean);
    const startUrl = first('USER')?.url || '';
    const map = allMods.map((m) => m.published
      ? `<li class="module published"><a href="${root}m/${m.id}/">${esc(m.title)}</a> <span class="badge">${esc(m.status)}</span></li>`
      : `<li class="module planned">${esc(m.title)} <span class="badge">в разработке</span></li>`).join('');
    const main = `<p class="lead">Практический курс о том, как безопасно и осознанно работать с ИИ-ассистентами и агентами: поставить задачу, проверить результат и вовремя передать решение человеку. Все учебные данные вымышленные.</p>
<p class="role-cards">${ROLES.map((r) => `<a class="btn" href="${root}route/${r.toLowerCase()}/">Маршрут: ${ROLE_NAME[r]}</a>`).join(' ')}</p>
<p class="actions"><a class="btn primary" data-start-course href="${root}${startUrl}" data-start-urls='${esc(JSON.stringify(Object.fromEntries(ROLES.map((r) => [r, first(r)?.url || '']))))}'>Начать курс</a> <a class="btn" data-continue-course href="${root}progress/" hidden>Продолжить</a></p>
<h2>Карта модулей</h2><ol class="module-map">${map}</ol>
<p class="notice">Статусы: draft — материал в работе и ещё не прошёл независимую проверку; planned — модуль только запланирован, ссылок и процентов нет.</p>`;
    put('index.html', layout({ dir: '', page: 'home', title: courseTitle, h1: courseTitle, main }));
  }

  // 404
  put('404.html', layout({ dir: '', page: 'home', title: 'Страница не найдена', h1: 'Страница не найдена', main: '<p>Такой страницы нет. Вернитесь на <a href="./">главную</a> или воспользуйтесь <a href="search/">поиском</a>.</p>' }));
  // 404 лежит в корне, но может отдаваться по любому URL; относительные ссылки там необязательны.

  out.set('routes.json', JSON.stringify(routes, null, 2) + '\n');
  index.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  out.set('search-index.json', JSON.stringify(index) + '\n');
  return out;
}
