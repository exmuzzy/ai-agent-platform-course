# Review F02-R4: R4-strategy-adoption

Reviewer: independent-reviewer. Проверено 10 claims напрямую по URL: C04, C05, C06, C07, C08, C09, C10/C11, C12, C03 (RAND), SRC-09 метаданные. SRC-01 (СКОЛКОВО, девять модулей) и Anthropic (C02) не открывались: не проверено.

## Подтверждено
- C04: RAND — «By some estimates, more than 80 percent…»; 50 industry + 15 academia, август–декабрь 2023. Верно.
- C03: пять причин совпадают с Takeaways, включая «слишком сложные задачи».
- C05: MS Learn, обновлено 17.09.2026; security filters — string comparison, не нативная проверка Entra; preview не рекомендуется для production. Верно.
- C06: commit 558ffd39… существует (2026-10-09), LICENSE=MIT, файлы authentication.py, test_authenticationhelper.py, app.py есть, README с Important Security Notice. Верно.
- C07: issue #2086 open, создан 2024-10-26, 1 комментарий от 2024-10-28. Верно.
- C08: Reuters 10.09.2025, цитата «over indexed… course correct», «back to hiring people». Верно.
- C09: AWS 28.10.2026, авторы и три модели (централизованная/децентрализованная/федеративная) совпадают.
- C10/C11: Hirji 15.09.2026; 95% = 52 интервью (предварительный MIT NANDA), 80% цитата RAND, 40% прогноз Gartner. Верно; статус disputed для C11 уместен.
- C12: NBER: 5,179 и 14% присутствуют в странице. Остальное по abstract не расширено.

## Findings

### REV-001
- Severity: minor
- Path: R4-strategy-adoption.md, таблица, строка R4-S03; registry-delta R4-S03.title
- Observation: заголовок «Root Causes of Failure» / «The Root Causes of Failure for AI Projects…»; на странице RAND заголовок «Why AI Projects Fail and How They Can Succeed».
- Why it matters: библиографическая неточность, затрудняет поиск.
- Required change: указать текущее название страницы (допустимо добавить прежнее в скобках).
- Verification: открыть URL RAND, сверить title.

### REV-002
- Severity: minor
- Path: R4-strategy-adoption.md, R4-C07 / R4-S06
- Observation: единственный комментарий («нужно войти под учётной записью Azure…») указывает на возможную пользовательскую ошибку; packet говорит лишь «не доказательство исправления».
- Why it matters: как «контрпример сбоя» issue слабее, чем выглядит; риск переоценки учебного аргумента.
- Required change: добавить в Ограничение: комментарий предполагает ошибку конфигурации/входа, а не дефект кода; использовать issue только как пример диагностики.
- Verification: прочитать комментарий в issue #2086. Также: заголовок в registry-delta без пробела перед запятой — сверить дословно.

### REV-003
- Severity: minor
- Path: R4-S10 / R4-C12
- Observation: C12 содержит «неоднородность эффекта» и «ассистент человека»; я подтвердил лишь 5,179 и 14%. Остальное не проверено мной, помечено reported — статус допустим.
- Why it matters: низкий риск.
- Required change: нет, либо указать в Ограничении, что формулировка про неоднородность взята из abstract.
- Verification: открыть abstract NBER.

### REV-004
- Severity: minor
- Path: R4-S08 (AWS), Класс/ограничение
- Observation: страница позиционируется как «open-source reference blueprint»; packet не указывает репозиторий blueprint и не читал его лицензию/commit.
- Why it matters: для C09 статус verified означает только содержание статьи; vendor-источник не независим (оговорено верно).
- Required change: добавить явно «репозиторий blueprint не читался».
- Verification: сверить текст статьи.

## Соответствие правилам
- Выдуманных URL и фактов не найдено. Vendor-материалы (Microsoft, AWS, Anthropic) честно помечены как не независимые. Статусы verified/reported/disputed корректны.
- Открытый репозиторий с commit и LICENSE есть (R4-S05). Контрдоводы и честно описанные неудачные поиски есть (Klarna, RAND/Hirji, issue, ошибка fetch).
- Для автора урока достаточно: пример (три заявки), контрпример (Klarna, #2086, 95%), offline-практикум. Применимость к harness везде unverified.
- Секретов и ПДн нет; крупных цитат нет.

## Verdict: accept
(Замечания minor; можно принять с учётом REV-001..004.)
