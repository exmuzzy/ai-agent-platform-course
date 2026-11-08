# Пробелы исследования (F02)
Собрано из разделов Gaps пакетов R1–R4 и замечаний reviewer. Пробел не равен отсутствию факта.

## R1-architecture-agentic-dev

- **Поиски:** выполнены `Anthropic building effective agents`, `METR early 2025 experienced developers AI productivity`, два обращения с `Microsoft AI coding developer productivity randomized trials`; GitHub API использован для HEAD SHA и списка файлов Spec Kit. Репозиторий и практический разбор сбоя найдены; целенаправленный поиск issues/форумов не выполнялся, поскольку минимум контрдовода закрыт METR.
- **Доступ:** финальные fetch выбранных материалов успешны. Один общий вывод инструментов был усечён; существенные материалы затем прочитаны точечными extraction-fetch. У extraction тестов усечена часть вывода; выше использованы только видимые конкретные тесты, не заявляется аудит всего файла.
- **Противоречия:** положительный результат Microsoft и отрицательный исторический METR относятся к разным задачам/популяциям/outcomes; обновление METR отдельно показывает проблему измерения новых практик, а не отменяет исторический эксперимент. Независимой репликации и причинного доказательства выгод thin-client/kernel здесь нет.
- **Следующий bounded task:** после доступа к baseline за 60 минут составить matrix «AGENTS/skills/hooks/MCP/cache/pin/replay» с smoke-test на capability, затем проверить одну ФТ end-to-end. До такой проверки все assertions о существующем harness остаются `unverified`.
- **Уже можно писать:** дерево выбора code/workflow/agent, различение instructions/procedural skills/lifecycle hooks/tool contracts, исторически ограниченный разбор продуктивности и synthetic offline-практикум. Устаревающие детали caching/hooks давать с датой проверки, без цен и универсальных обещаний.
- **Передача:** предложения реестра находятся в `R1-architecture-agentic-dev-registry-delta.json`; общий `sources/registry.json` не редактировался.

## R2-evals-economics

- **Реально выполненные поиски/неудачи:** arXiv:2403.07889 — неверный ID (статья про THz RIS), исправлено на 2406.18665; полный текст RouteLLM не читался (только abstract) — конкретные проценты по бенчмаркам не подтверждены. Для C10 зафиксирован SHA HEAD main (см. S3) и открыт LICENSE.md. Попытка перенести список OWASP Agentic Top 10 (для R3) не удалась: страница не отдала список в извлекаемом виде.
- **Не покрыто за лимит:** FinOps-фреймворки (FinOps Foundation), готовые TCO-калькуляторы, кейсы публичных отказов от ИИ-фич (кроме METR), отдельный GitHub Discussions/HN тред по сбоям мультиагентов (C08 опирается на пост практика и вендорский пост S8, а не на тред обсуждения); статьи про dev/holdout методологию вне S1.
- **Противоречия:** C08 (Cognition, S5) против Anthropic (S8): мультиагентный research +90.2% на внутреннем eval, но ~15× токенов и «нужна высокая ценность задачи». Обе стороны — вендорские позиции, независимой проверки нет; для U09 подавать как баланс, не как установленный спор.
- **Следующий bounded task:** найти и прочитать 1–2 публичных пост-мортема отказа от ИИ-фичи с цифрами (GitHub issue/HN) и методичку FinOps Foundation по AI-стоимости; дополнить C09 формулой CPAO из первоисточника.
- **Уже можно писать без ожидания:** урок по трёхуровневым evals (U06), секцию LLM-as-judge с bias и калибровкой (U06/U09), секцию кеша и роутинга с оговорками о датах цен (U10), контрпример METR (U10), offline-практикум из «Синтеза».

## R3-security-ops

Выполненные действия: 10 fetch/чтений (см. таблицу), включая LICENSE и файлы Temporal на закреплённом commit. Поиск (search) практических обсуждений, failure mode «duplicate activity execution после timeout»: запросы «Temporal activity executed twice duplicate execution after timeout idempotency issue» и «Temporal community forum activity ran twice duplicate». Результат: найдены обсуждения community.temporal.io (темы 4391, 1162, 12882, 19866); прочитана тема 4391 (S9, C19, reported). Остальные темы видны только в сниппетах и как claims не используются. Обсуждений обхода approvals вне S7 не искали.
Не получено: описания рисков OWASP (только названия), содержание OTel GenAI semconv, код worker/SDK Temporal и сквозной тест duplicate execution, практики sandbox и сетевой изоляции, kill switch/SLO/CI/CD rollback, supply chain skills/tools, пост-мортемы вне MCP-примера. Контрдовод: независимая критика есть в S1 (Willison, не форум), практическое обсуждение дублей — S9 (форум Temporal, не независимое воспроизведение).
Практикум: добавить baseline с двойным возвратом, дедупликацию по ключу на стороне мок-сервиса и разрешённые успешные обращения (запрет всех вызовов не считается прохождением).
Следующий bounded task: OTel GenAI репозиторий, описания рисков OWASP, один независимый пост-мортем. Уже можно писать: модуль о trifecta/Rule of Two, идемпотентности и практикум на билетной системе.

## R4-strategy-adoption

- **Проверенные поиски:** СКОЛКОВО «Директор по ИИ…»; RAND AI projects fail; Klarna AI customer service humans; MIT NANDA failure methodology; Microsoft document permissions; AWS operating model; NBER generative AI at work. По GitHub: tree pinned commit, auth/test files; неудачный `gh search issues` с repository в строке запроса, затем отдельный `--repo` дал пусто; REST search `repo:Azure-Samples/azure-search-openai-demo is:issue authentication` нашёл #2086, затем прочитаны body/comments.
- **Доступ:** fetch issue #2086 вернул `SLS_CRAWL_FAILED/broken_content`; прочитан через GitHub API. HTML СКОЛКОВО очищен недостаточно для вкладок: повторный fetch с raw HTML позволил прочитать все 9 блоков; скрипт не исполнялся.
- **Ограничения:** нет primary MIT NANDA/Gartner, независимого аудита Klarna, полного текста/методов NBER, доказанного полного отказа компании от агентной платформы. Версии issue 2024 и текущего repo различаются; перенос дефекта не допускается.
- **Следующий bounded task:** прочитать первичный MIT NANDA и методы опубликованной версии NBER; уточнить календарные расхождения SRC-01 у организатора, если нужен официальный календарь. Отдельно проверить определения U01/U02/U05/U12 и harness.
- **Уже можно писать:** развилку code/workflow/agent, паспорт и stage gates пилота, knowledge ownership/ACL, роли и stop authority, различие demo/pilot/production и статистических знаменателей. Delta передаётся оркестратору; общий registry не менялся.
