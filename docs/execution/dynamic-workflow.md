# Multi-agent dynamic workflow создания курса

Этот протокол рассчитан на недорогую модель, ограниченный контекст и возобновляемые сессии. Он не является реализацией конкретного orchestration API: исполнитель адаптирует его к фактически установленному runtime, не создавая новый engine.

## Канон состояния

`workflow/backlog.json` является единственным списком заданий разработки. Только оркестратор изменяет состояние, зависимости и ownership; workers не редактируют общий backlog и не объявляют свои задания завершёнными.

Состояние создания материалов и учебный прогресс владельца не смешиваются. Приватные traces, capability discovery и сырые отчёты размещаются в `.local/`; в публичное состояние переносится только очищенная сводка.

```text
planned → ready → running → review → done
                    ↓          ↓
                 blocked     rework → running
```

`ready` означает, что зависимости завершены и входы доступны. `done` означает, что результат проверен, принят и интегрирован в указанную ветку; одного успешного ответа worker недостаточно.

## Роли

| Роль | Задача | Запрет |
|---|---|---|
| Orchestrator | DAG, packets, приоритеты, состояние, интеграция, публикация | Не заменять все независимые проверки самооценкой |
| Source researcher | Проверенные source packets по конкретному модулю | Не превращать сниппет в факт |
| Curriculum author | Один урок/brief/контрольное задание по готовым входам | Не расширять scope и не писать весь курс |
| Lab engineer | Минимальный практикум, fixture, разрешённый patch harness | Не трогать production и не делать неразрешённые внешние действия |
| Reviewer | Независимое ревью содержимого, источников и негативных сценариев | Не переписывать весь модуль вместо точных замечаний |
| Integrator | Словарь, межмодульная связность, clean-checkout run | Не скрывать непроверенные пути ради релиза |

Роли назначаются фактически доступным моделям по [model routing](model-routing.md), а не одной модели автоматически. Разные модели используются, когда разрешены и дают проверяемую пользу; если доступна одна, независимые контексты и честный single-model fallback обязательны. Повышение расходов допустимо только в рамках разрешённой политики.

## Предполётный discovery runtime

В `F00` прочитай инструкции текущей среды и справку её CLI. Установи, доступны ли независимые subagents, ограничение параллелизма, worktree, файловые результаты, cancellation, usage и восстановление сессии; не предполагай конкретный язык workflow.

Отдельно установи доступные model IDs, инструменты каждой роли, разрешённые расходы и общий authoring budget. Не смешивай выбор моделей авторов с live API-практикумами; фактическое назначение сохраняется в `docs/execution/model-selection.md`.

Выбери один режим:

- **Native:** использовать существующий dynamic workflow runtime и его документированные API.
- **Portable:** оркестратор запускает обычных субагентов по этому DAG и сохраняет состояние в файлах.
- **Serial fallback:** если subagents недоступны, выполнить те же packets последовательно и явно сообщить об отсутствии параллельного запуска; независимое ревью остаётся требованием.

Нет права заявлять «dynamic workflow работает», если создан только JSON-план. В итоговом отчёте указываются режим, фактически запущенные задачи и evidence.

## Scheduler

Ниже приведён псевдокод, а не исполняемый API. Превратить его в команды можно только после discovery.

```text
load backlog + last checkpoint
reconcile interrupted tasks using worktree, actual diff and last evidence
validate dependency DAG and ownership

while session budget remains:
    promote planned tasks to ready only when dependencies and inputs are ready
    candidates = tasks in ready or explicitly approved rework
    exclude done, blocked, running, review, leased paths and unauthorized repair attempts
    rank by dependency-unblocking value, risk, then bounded scope

    for each candidate within free worker slots:
        if candidate is expandable:
            create its bounded child DAG once, record expanded=true and set running
        else:
            reserve owned paths, input snapshot and budget; persist running before dispatch
            dispatch minimal task packet

    on author/research/engineering result:
        validate result schema and actual changed paths
        run deterministic checks
        route to independent reviewer; set review

    on review result:
        validate verdict and evidence; do not recursively review the reviewer
        if accepted:
            integrate once, record commit/evidence, mark done
        elif repair_count < 2:
            increment and persist repair_count; set rework with exact findings
        else:
            mark blocked; continue independent work

    mark an expanded parent done only when all required children are accepted
    promote newly unblocked planned tasks to ready
    checkpoint after each accepted or blocked task
    if a dispatchable ready/rework task and a free slot exist:
        continue
    if active workers exist:
        wait for a worker/event, not a busy loop
    else:
        checkpoint blocked/remaining tasks and exit

emit completed / remaining / blocked / usage / next ready tasks
```

Новая находка не означает перепланирование всего курса. При изменении API обновляется конкретный практикум; при пробеле в источниках добавляется targeted research task; при несоответствии личного harness корректируется его adapter или fixture. Перед массовым авторством F02 выполняется по [протоколу исследования](research-workflow.md); после исследования обязательно переходить к урокам и лабораторным.

## Декомпозиция parent task

`P00` и `A01`–`A09` являются expandable tasks. До запуска авторов оркестратор формирует до восьми прямых children, каждое с отдельным scope; child не имеет права создавать собственных subagents.

Рекомендуемый child DAG:

```text
SOURCES → OUTLINE → LESSON-1 ┐
                   LESSON-2 ├→ LAB → ASSESSMENT → REVIEW
                            ┘
```

`LESSON-1` и `LESSON-2` можно выполнять параллельно после общего outline. LAB начинается после согласования контрактов, а не обязательно после полного текста обоих уроков, если это явно отражено в task packet.

Восемь children: SOURCES, OUTLINE, LESSON-1, LESSON-2, LAB, ASSESSMENT, REVIEW, INTEGRATE. Общие исследования можно переиспользовать из `F02`; не запускай повторный обзор всей индустрии в каждом модуле.

Назначенные модулю case studies U01–U12 автор создаёт вместе с соответствующим lesson packet, не превышая трёх изменяемых файлов. F03 фиксирует ownership case-карточек; готовый case переиспользуется по ссылке, а не переписывается другими модулями.

Поле `case_ids` задаёт единственного владельца в верхнеуровневом backlog. Children получают `use_case_ids` в packet и временную аренду write paths, но не дублируют ownership; `parent_id` не означает зависимость child от завершения собственного parent.

Parent нельзя завершить до `done` всех обязательных children. Если LAB требует более трёх файлов или несвязанного patch harness, выдели отдельную bounded task с явными зависимостями, но не увеличивай глубину агентного дерева.

## Изоляция и конкурентная запись

Каждому пишущему worker выделяется отдельный worktree и ветка `course/<task-id>` от известного baseline. Пути task packet являются allowlist: изменение за их пределами отклоняется, даже если оно выглядит полезным.

Только оркестратор изменяет backlog, общий `sources/registry.json` и выполняет merge/integration. Integrator-worker возвращает для них delta; glossary, README и другие общие файлы он может менять лишь по явно выданной эксклюзивной аренде. Два workers не пишут общий файл одновременно.

Перед интеграцией проверяются baseline, конфликт путей и фактический diff. Нельзя накатывать patch второй раз после crash; если commit уже интегрирован, обновляется состояние, а не повторяется действие.

## Harness как изменяемая лабораторная база

Владелец разрешил менять и публиковать собственный harness. Для каждого изменения нужен отдельный worktree, исходный commit, учебная гипотеза, минимальный patch, тесты до/после и rollback.

Если два модуля требуют изменения одного компонента harness, они не выполняются параллельно в одном scope. Оркестратор выбирает последовательность или общий patch task, затем авторы модулей используют зафиксированную учебную версию.

Разрешение не распространяется на production deployment, реальные клиентские данные, изменение видимости других репозиториев, выгрузку секретов и чужих закрытых компонентов. Публичная ветка не является безопасным staging для ещё не очищенных исходников.

## Context и бюджет

Worker получает максимум одну тему, до трёх изменяемых файлов, нужные выдержки из glossary, source packet и конкретные acceptance criteria. Не передавай ему все прошлые диалоги, весь harness или весь текст этого плана.

Значения по умолчанию для первого запуска:

- **Concurrency:** 4 workers; отдельный orchestrator; nested delegation запрещена.
- **Input:** мягкий предел 12 000 токенов на packet; превышение требует разбиения.
- **Output:** ориентир до 5 000 токенов; код и артефакты писать в файлы, краткий ответ до 600 слов.
- **Repairs:** максимум 2 после первичного review, затем `blocked`.
- **Session:** использовать предел runtime/утверждённый authoring budget; без него выполнить только bounded bootstrap до четырёх worker tasks и один раз запросить недостающий лимит по model-routing. С заданным лимитом checkpoint не останавливает готовые задачи.
- **Live labs:** по умолчанию выключены; включаются только при отдельном разрешении, model/config pin и установленном лимите. Разрешённые модели авторов курса используют authoring budget, не этот выключатель.

Эти числа являются ограничителями запуска, а не обещанием цены или достаточности ресурсов. Если runtime не сообщает токены, это записывается как `unknown`; символы или размеры файлов нельзя выдавать за API usage.

## Review и исправления

Reviewer возвращает решение `accept`, `rework` или `blocked`, severity, точные пути/фрагменты, объяснение и проверку, которая должна пройти. Проверяются минимум: результат обучения, факты, воспроизводимость, безопасность, соответствие уже существующему harness и отсутствие лишних компонентов.

Repair packet содержит только diff, замечания и затронутые входы. Повторное полное ревью всего курса требуется лишь при изменении общих контрактов; в остальных случаях используется delta review плюс релевантные regression tests.

`repair_count` считает уже выделенные попытки: значения 1 и 2 разрешают соответствующий repair dispatch. После неуспешной второй попытки задача блокируется; создание нового child ID или смена модели не обнуляет счётчик исходной логической задачи.

## Checkpoint и восстановление

После каждого принятого/заблокированного задания сохраняй очищенную запись: task id, исходный и результирующий commit, status, evidence, review verdict, следующий шаг. Сырые tool outputs не должны автоматически попадать в публичный журнал.

Приватный checkpoint также сохраняет `run_id`, единицу/общий лимит, consumed/reserved budget, `bootstrap_used`, `repair_count` по каждому логическому task id, expanded parent IDs, активные leases/worker IDs/deadlines и `release_candidate_commit`. Новая сессия или смена модели не обнуляет эти значения; новую квоту можно назначить только по новой явной политике/авторизации.

После остановки:

1. Сверь фактические worktrees, diff и commits с task state.
2. Не считай `running` завершённым по времени последнего heartbeat.
3. Запусти проверки незавершённых результатов.
4. Передай на review только то, что действительно создано.
5. Продолжи с ближайших ready tasks, не повторяя принятые исследования и изменения.

До dispatch восстанови бюджет и счётчики. Если расход прерванного worker неизвестен, не возвращай его резерв автоматически: сохрани консервативно зарезервированным до reconcile; при неизвестном остатке останови новые вызовы и уточни лимит.

Если stale lease относится к живому процессу, сначала останови или дождись его. Нельзя освобождать путь только потому, что worker не ответил быстро.

## Условия остановки

Заблокируй конкретную ветку при неясных правах на экспорт harness, обнаружении секрета, отсутствии требуемого доступа, повторяющемся критическом дефекте, исчерпании лимита или невозможности проверить опасную операцию. Независимые безопасные задания продолжаются.

На уровне всего запуска остановись при отмене владельцем, нарушении публичной границы или недостоверности общего baseline. Не трать следующие итерации на сокрытие проблемы или отключение проверок.

## Проверка кандидата в релиз

По умолчанию Q01 ждёт F04: весь очищенный harness должен быть интегрирован до общего dry-run и privacy review. При отдельно одобренной fixture edition применяется явная альтернативная ветка из [harness-adapter](../harness-adapter.md), а не фиктивное завершение F04.

После Q01 зафиксируй `release_candidate_commit`. Q02 и Q03 проверяют этот commit и записывают его в evidence; изменение материалов, источников, кода, зависимостей или конфигурации после него переводит затронутые gates в `rework` и требует нового кандидата и проверок.

Добавление очищенных отчётов/метаданных релиза без изменения проверенного содержимого не вызывает бесконечную перепроверку само́го отчёта. Такой финальный diff отдельно проходит publication/privacy review; в handoff сохраняется связь с проверенным commit.
