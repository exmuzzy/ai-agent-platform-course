# Review F02-R1 (independent-reviewer)

Проверено лично (открыты URL): R1-C02, C05, C07 (LICENSE, pyproject, base.py, test_base.py, installation.md, HEAD SHA через API), C10, C11, C12, C04 (частично: структура страницы), C06 не открывался. Итого 9 claims/фактов подтверждено, расхождений по числам нет. R1-C09 (OpenAI prompt caching) не удалось проверить: страница рендерится JS, текст не получен (не опровергнуто).

Подтверждено: MIT, Copyright GitHub, Inc.; pin c43849408… существует (дата 2026-11-07); version 1.3.3.dev0; entry point specify; классы IntegrationBase/Markdown/Toml/Yaml/SkillsIntegration; 4 названных теста существуют; `@vX.Y.Z` в installation.md; METR: 16 разработчиков, 246 задач, +19% времени; обновление: −18% (−38…+9), −4% (−15…+9); Microsoft: 4,867 и 26.08% (SE 10.3%); MCP: MUST/SHOULD по outputSchema; AGENTS.md: ближайший файл побеждает, пользовательский чат важнее.

## Findings

### REV-001
- Severity: minor
- Path: R1-architecture-agentic-dev.md, строка R1-C11
- Observation: METR в первоисточнике пишет «speedup of -18%» (термин «speedup» со знаком минус), packet переводит как «изменение времени −18%, меньше времени». Трактовка согласуется с контекстом METR, но в тексте источника «speedup» и знак двусмысленны; в строке C11 сказано «Минус означает меньше времени» без оговорки.
- Why it matters: автор урока может перепутать направление эффекта.
- Required change: добавить в C11 «METR называет это speedup; отрицательное значение интерпретировано как сокращение времени (в той же публикации +19% = дольше)».
- Verification: сверить фразу «speedup of -18%» в S10.

### REV-002
- Severity: minor
- Path: packet, раздел «Прочитанные материалы» (S08) и Delivery
- Observation: pyproject.toml pin содержит комментарий о bundled core assets для `specify init` без сети (air-gapped), что напрямую релевантно offline-практикуму, но не использовано; offline-воспроизводимость в Delivery названа непроверенной.
- Why it matters: возможное улучшение доказательной базы, не ошибка.
- Required change: опционально добавить ссылку на pyproject (строки про core_pack) как evidence для тезиса об offline-доставке, со статусом reported.
- Verification: открыть pyproject на pin, найти «air-gapped».

### REV-003
- Severity: minor
- Path: packet, S06/S07 и R1-C04, R1-C09
- Observation: статус verified для C04 и C09 опирается на живую документацию (S06/S07), которую я проверить в полном объёме не смог (S07 JS-страница; в S06 подтверждена лишь структура разделов, включая «Exit code 2 behavior per event»). Нет подтверждения от независимой организации; обе — вендорская документация.
- Why it matters: verified здесь означает «вендор так заявляет», а не независимое подтверждение.
- Required change: добавить в колонку «Где применим» формулировку «vendor documentation, независимо не проверено» для C04, C09 (и C02/C03/C05 как документация вендоров/экосистемы).
- Verification: перечитать колонки статусов.

### REV-004
- Severity: minor
- Path: packet, «Gaps и handoff» → Поиски
- Observation: исполнитель честно указал, что поиск issues/форумов о сбоях не делался; контрдовод закрыт METR, это приемлемо. Однако отсутствует контрдовод именно к spec-driven/thin-kernel подходу (сбои Spec Kit, issues).
- Why it matters: тезис «kernel+adapter» остаётся без критики.
- Required change: оставить как есть, но явно записать в Gaps: «контрдоводов к SDD/kernel паттерну не искали».
- Verification: прочитать раздел Gaps.

## Прочие проверки
- Только прочитанное в таблице: да, оговорки (S11 только abstract, тесты не запускались) честные. Выдуманных URL не найдено; реестр-delta согласован с packet (11 источников, claims_ids совпадают).
- Репозиторий: owner, pin, LICENSE, тесты — есть.
- Vendor не выдан за независимое: объединение групп указано; см. REV-003.
- Статусы: C13 disputed уместен; reported для исследований корректен.
- Достаточность: пример (возврат билета), контрпример (METR), offline-практикум — пригодны; harness везде unverified.
- Секретов, ПДн, крупных цитат нет.

Verdict: accept
