# Внутренние интерфейсы сайта (для W01)

Единственный источник форматов входа: [content-contract.json](content-contract.json). Этот файл фиксирует границы между модулями сборщика и клиента, чтобы их могли писать раздельно.

## Файлы и ответственность

| Файл | Назначение | Экспорт |
|---|---|---|
| `site/package.json`, `package-lock.json` | зависимости (`markdown-it`, `gray-matter`), скрипты `build`, `test`, `serve` | |
| `site/build.mjs` | точка входа: читает репозиторий, вызывает lib, пишет `site/dist` | CLI `node build.mjs [--out dist] [--root ..]` |
| `site/lib/content.mjs` | загрузка и проверка контента: frontmatter, ID, quiz.json, activity-блоки, маршруты, allowlist, замкнутость ссылок, KC/SRC существуют, content_hash fixture | `loadContent(root)` -> `Content`; `validate(content)` -> `{errors, warnings}` |
| `site/lib/markdown.mjs` | markdown-it (`html:false`), контейнеры `::: user/builder/engineer`, fenced ```activity (-> JSON-контейнер), якоря глоссария, замена внеallowlist-ссылок | `renderMarkdown(src, ctx)` -> `{html, activities, headings, text}` |
| `site/lib/render.mjs` | HTML-шаблоны всех типов страниц, поиск, manifest | `renderSite(content) -> Map<path, string|Buffer>` |
| `site/assets/app.js` | клиентская навигация (fetch + history), выбор роли, поиск, страница прогресса, предупреждения | ES module |
| `site/assets/progress.js` | чистая логика прогресса (без DOM): state, агрегаты, export/import/validate | экспорт `createProgress`, `validateImport`, `aggregateQuiz`, `aggregateLab` |
| `site/assets/quiz.js`, `activities.js` | интерактив тестов и активностей | инициализация по `data-` атрибутам |
| `site/assets/style.css` | единый стиль | |

## Структура вывода (`dist/`)

`index.html`; `route/{user,builder,engineer}/index.html`; `m/M00/index.html`, `m/M00/lesson-01/index.html`, `m/M00/lab/index.html`, `m/M00/quiz/index.html`, `m/M00/solutions/index.html`; `cases/U01/index.html`; `reference/{glossary,kernel,sources}/index.html`; `search/index.html`; `progress/index.html`; `downloads/index.html`; `assets/*`; `files/*` (скачиваемые учебные файлы, включая fixture); `search-index.json`; `routes.json`; `manifest.json`; `404.html`.

## DOM-контракт страницы

- `<body data-root="../../" data-page="lesson|lab|quiz|solutions|route|case|reference|search|progress|home|downloads" data-unit="M00.L01" data-version="0.1.1">`; все ссылки относительные от `data-root`.
- Один `<main id="main" tabindex="-1">`; skip-link на `#main`; заголовок страницы в `<h1>`.
- Ролевые блоки: `<section class="role-block" data-role="builder|engineer|user">` (внутри `<details>` для не выбранных ролей).
- Активность: `<div class="activity" data-activity="M00.A01" data-type="field_check"><script type="application/json">{...}</script></div>`.
- Тест: `<div class="quiz" data-quiz="M00.QZ" data-version="0.1.1"><script type="application/json">{quiz.json}</script></div>`.
- Кнопки «Далее/Назад»: `<nav class="pager"><a rel="prev">`, `<a rel="next">` по порядку маршрута (`routes.json`) для выбранной роли; по умолчанию порядок модуля.
- Отметка «прочитано»: кнопка `button[data-mark-read]` (чтение не засчитывается открытием страницы).
- CSP meta: `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'`.

## Данные

- `routes.json`: `{"USER": {"title","outcome","steps":[{"ref","required","gate"}]}, ...}`.
- `manifest.json`: `{"course_version","built_from_commit","digest","units":[{"id","kind","version","title","url","roles"}],"files":{"path":"sha256"}}`; `digest` = sha256 от отсортированных строк `path:sha256`.
- `search-index.json`: `[{"id","title","kind","url","text"}]`, `text` ≤ 2000 символов в нижнем регистре без разметки.

## Состояние клиента

Хранится в одном объекте `course-progress/1` (см. контракт). `app.js` держит его в памяти документа; `localStorage` ключ `course-progress-v1` используется, только если запись/чтение удались. Индикатор «есть несохранённые изменения» и кнопка «Сохранить прогресс в файл» присутствуют на всех страницах (общий header). `beforeunload` предупреждает при несохранённых изменениях.
