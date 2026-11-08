# Независимое review F02-R3

Дата: 2026-11-08. Проверены оба файла packet, шаблон research-packet и требования глубины, source packets и review contract. Независимо заново открыты все 8 URL из таблицы источников; проверены 15 claims C1–C15, а также число коммитов и обозначение версии S4.

## Проверка claims по первоисточникам

| Claims | Результат независимой проверки |
|---|---|
| C1, C2 | Подтверждены как позиция автора: перечислены private data, untrusted content, external communication; формулировка про «95%» действительно сопровождается «a failing grade», а не результатом собственного benchmark. Статус `reported` корректен ([Willison, определения и Guardrails](https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/)). |
| C3, C4 | Подтверждены как утверждения Meta: «no more than two», перечисление A/B/C и необходимость supervision при всех трёх; присутствует «fundamental, unsolved weakness in all LLMs». Независимое доказательство эффективности из этого не следует, и packet его не заявляет ([Meta, Agents Rule of Two](https://ai.meta.com/blog/practical-ai-agent-security/)). |
| C5, C6 | Подтверждены как описание демонстрации: issue в публичном repo приводит к извлечению приватных данных и публичному PR; инструменты не должны быть скомпрометированы. Независимого воспроизведения нет, поэтому `reported` уместен ([Invariant, Attack Setup / Detecting Toxic Agent Flows](https://invariantlabs.ai/blog/mcp-github-vulnerability)). |
| C7 | Текст про default confirmations и «Always Allow» присутствует, но относится к Claude Desktop в описанном эксперименте; общая формулировка packet теряет эту границу применимости. Фраза источника: «Claude Desktop by default requires the user to confirm individual tool calls» ([Invariant, Attack Demonstration](https://invariantlabs.ai/blog/mcp-github-vulnerability)). |
| C8, C9 | Все четыре vulnerable conditions и заявленные названия тем присутствуют. URL с 2025-06-18 действительно возвращает страницу с «Version 2025-11-25»; она также предупреждает, что latest version имеет дату 2026-07-28, поэтому материал нельзя переименовывать в актуальную спецификацию без дополнительной проверки ([MCP, Security Best Practices](https://modelcontextprotocol.io/specification/2025-06-18/basic/security_best_practices)). |
| C10, C11, C12 | Подтверждены: падение worker до уведомления сервера вызывает retry, отсутствие идемпотентности не вызывает platform error, а дробление Activity увеличивает Event History. Документация отдельно уточняет, что ключи дедупликации исполняет вызываемый сервис, а не сама Activity; это полезно сохранить при реализации mock-API ([Temporal, Idempotency](https://docs.temporal.io/activity-definition)). |
| C13 | README подтверждает durable execution и происхождение из Cadence; LICENSE и tests видны в дереве. При повторном чтении показано 10 190 коммитов вместо 10 187 в packet, что само по себе является изменением живого счётчика, а не доказательством выдумки; страница показывает latest commit `74c71f9` ([Temporal repository](https://github.com/temporalio/temporal)). |
| C14 | В видимом тексте страницы стоят December 9, 2025, «more than 100 industry experts» и CC BY-SA v4.0 с оговоркой «Unless otherwise specified». Дата метаданных fetch отличается, но видимый текст подтверждает дату packet; `verified` допустим именно как проверенное содержание обложки, не независимый аудит числа участников и не проверка лицензии непрочитанного PDF ([OWASP, страница ресурса](https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/)). |
| C15 | Перенос подтверждён: «have moved to the OpenTelemetry GenAI semantic conventions repository». Footer также подтверждает Docs CC BY 4.0 в registry delta; проверка содержимого нового репозитория этим не заменяется ([OpenTelemetry, Moved](https://opentelemetry.io/docs/specs/semconv/gen-ai/)). |

## Findings

### REV-001

- **Severity:** major
- **Path:** `research/packets/R3-security-ops.md`, S6 / C13 / Gaps; `research/packets/R3-security-ops-registry-delta.json`, `R3-S6-temporal-repo`.
- **Observation:** Packet прямо сообщает, что pinned commit/tag, текст LICENSE, implementation и tests не прочитаны. Наличие файлов на главной странице подтверждено, но это не требуемый анализ открытого репозитория; надпись «MIT License» в README не заменяет чтение LICENSE ([Temporal repository](https://github.com/temporalio/temporal)).
- **Why it matters:** Шаблон и research-workflow требуют commit/tag, LICENSE, entry point, минимум релевантную реализацию и тест/пример. Честная маркировка gap предотвращает ложный факт, но не закрывает обязательный критерий приёмки и не даёт автору проверенной реализации для практикума.
- **Required change:** На одном закреплённом commit/tag прочитать LICENSE, entry point и минимальный релевантный путь исполнения с тестом/примером retries или идемпотентности. Записать точные пути, краткий вывод, границы применимости и фактические условия лицензии в S6 и delta; не добавлять прочитанное reviewer как якобы прочитанное автором.
- **Verification:** Повторный reviewer открывает указанный commit, LICENSE и названные implementation/test files; подтверждает их соответствие описанию. Не требуется запускать сторонний код или строить весь Temporal.

### REV-002

- **Severity:** major
- **Path:** `research/packets/R3-security-ops.md`, «Gaps и handoff».
- **Observation:** Автор явно сообщает «поисков через search не делалось» и отсутствие независимых issues/HN. Контрпример и обсуждение ограничений есть, однако документированной попытки поиска практических обсуждений нет; обещание будущего Temporal issue такой попыткой не является.
- **Why it matters:** Для M02–M06 workflow отдельно требует документированные попытки найти код и практические обсуждения. R3 покрывает M05/M06; обсуждение в статьях не отменяет этого требования. При этом не следует ошибочно утверждать, что packet вообще лишён контрсвидетельства: C2 и C5–C7 его дают.
- **Required change:** Выполнить ограниченный поиск по одному конкретному failure mode, например duplicate execution или обход approvals; открыть релевантный issue/discussion при наличии. Зафиксировать запросы, результат, прочитанный раздел и статус `reported`; если полезного обсуждения нет, честно записать реальные неудачные попытки. Уточнить фразу «только S2/S7»: независимая критика уже представлена S1, хотя это не форум.
- **Verification:** В handoff присутствуют фактические запросы и результаты либо конкретный открытый discussion URL с пересказом ограничения; vendor anecdote не получает статус независимого воспроизведения.

### REV-003

- **Severity:** minor
- **Path:** `research/packets/R3-security-ops.md`, C7.
- **Observation:** Формулировка «Подтверждение вызовов по умолчанию есть» не называет продукт и временной контекст. В источнике утверждение ограничено Claude Desktop в демонстрации от 2025-05-26, а сведения о «many users» не сопровождаются замером ([Invariant, Attack Demonstration](https://invariantlabs.ai/blog/mcp-github-vulnerability)).
- **Why it matters:** Автор урока может ошибочно перенести default policy на любой MCP-клиент или актуальную версию клиента. `reported` сохраняет происхождение утверждения, но не восполняет потерянную границу применимости.
- **Required change:** Начать claim словами «По сообщению Invariant, в использованном Claude Desktop…», сохранить `reported`, дату и оговорку об отсутствии количественных данных о распространённости Always Allow.
- **Verification:** Формулировка явно ограничена описанной демонстрацией и не утверждает универсальное или актуальное поведение MCP-клиентов.

## Достаточность, трассировка и безопасность

- **Материалы:** Все восемь URL доступны и содержат заявленные разделы; выдуманных источников или фактов по проверенной выборке не выявлено. Ретроспективно доказать чтение автором каждого фрагмента без его журнала невозможно, но таблица честно отмечает обрезанные и почти пустые страницы, а delta не добавляет непрочитанный PDF или новый OTel-репозиторий.
- **Статусы:** Разделение vendor claims и подтверждённого текста документации в основном корректно. Нет неподкреплённого перехода от демонстрации Invariant к независимому эксперименту; C16/C17 и применимость к harness остаются `unverified`.
- **Учебный пример и контрпример:** Билетная система показывает сочетание возможностей и неизвестный исход платежа; approvals/Always Allow дают пригодный контрпример. Это достаточно для эскиза урока в заявленном узком scope, но не для полного покрытия эксплуатации, observability и isolation.
- **Offline-практикум:** Предложение пригодно как дизайн: 20 синтетических обращений, 3 инъекции, timeout-after-success и счётчик возвратов. Это не реализованный и не выполненный lab; при дальнейшей разработке следует явно поставить baseline с двойным возвратом, проверку дедупликации на стороне mock-сервиса и разрешённые успешные обращения, чтобы запрет всех вызовов не считался прохождением.
- **Безопасность:** В проверенных файлах не обнаружены секреты, приватные идентификаторы участников демонстрации или большие заимствованные фрагменты. Имена публичных авторов сохранены как атрибуция; сценарий практикума заявлен синтетическим.

## Итог

Проверено 15 claims по 8 самостоятельно открытым URL. Findings: critical — 0, major — 2, minor — 1; принятие блокируют обязательные пробелы глубины, а не выдуманные источники.

Verdict: rework
