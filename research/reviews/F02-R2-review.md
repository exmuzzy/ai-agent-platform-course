# Review F02-R2 (independent-reviewer)

Проверено по открытым URL 9 claims: C01, C02, C03, C04, C05, C06, C07, C08, C10 (числа, версии, лицензия, репозиторий). Все URL реальны, выдуманных источников нет.

## Подтверждено
- C05: «Writing to the cache costs 25% more», «up to 90% … cost and 85% latency», строка «100,000 token… 11.5s → 2.4s (-79%)», дата 17 Dec 2024 — совпадают.
- C07: 19% медленнее; ожидание 24%; после — 20%; 16 разработчиков, 246 задач; 22k+ stars, 1M+ LOC; Cursor Pro + Claude 3.5/3.7 — совпадают.
- C03: «over 80% agreement, the same level of agreement between humans»; position/verbosity/self-enhancement bias и ограниченное reasoning — в abstract.
- C06: «reduces costs by over 2 times in certain cases without compromising quality» — совпадает.
- C10: MIT, 19.7k stars, 691 commits, Python 3.9, Git LFS, «not accepting evals with custom code», model-graded допустимы — совпадают.
- C02, C04, C01: precision/recall при несбалансированных классах, 25–50 примеров, синтетика — есть в S1. C08: Flappy Bird, Walden Yan, 2025.06.12 — есть в S5.

## Findings

### REV-001
- Severity: major
- Path: packets/R2-evals-economics.md, строка C03
- Observation: статус `verified` обоснован «peer-cited препринтом + публичными данными lm-sys/FastChat»; FastChat не открывался (в таблице источников его нет), читался только abstract (сам packet это признаёт).
- Why it matters: verified не должен опираться на непрочитанное; «>80%» — самоотчёт авторов бенчмарка, не независимая репликация.
- Required change: статус C03 → `reported`; убрать упоминание FastChat и «peer-cited» либо добавить FastChat как прочитанный источник.
- Verification: в строке C03 нет `verified`/FastChat без строки в таблице источников.

### REV-002
- Severity: major
- Path: packets/R2-evals-economics.md, строка C05
- Observation: `verified`, но evidence — вендорская страница, а цифры (90%, 85%, 11.5s→2.4s) — собственный маркетинг Anthropic. Фактическая цена записи +25% подтверждена, остальное — vendor claim.
- Why it matters: правило: vendor claim не выдавать за независимое подтверждение.
- Required change: разделить: «цена записи +25% / чтения 10%» — `verified` как факт прайсинга на дату 2024-12; «до 90%/85%» — `reported (vendor claim)`. Также у самого S2 дата анонса 2024-08-14 не подтверждена в прочитанном тексте (видна только отметка December 17, 2024) — убрать или сверить.
- Verification: два статуса в C05, пометка vendor.

### REV-003
- Severity: major
- Path: packets/R2-evals-economics.md, S3/C10 и «Gaps»
- Observation: для репозитория не зафиксированы commit/tag; LICENSE-файл явно не открывался (лицензия взята из README). Gaps при этом ссылается на «C06» вместо C10 (ошибка ссылки).
- Why it matters: правило требует открытый репозиторий с commit/LICENSE; без хеша воспроизводимость и «версия» не проверяемы.
- Required change: записать SHA HEAD main на дату чтения и открыть LICENSE (или честно пометить «LICENSE не открывался»); исправить «Для C06» → «Для C10».
- Verification: в таблице S3 есть 40-символьный SHA/tag и ссылка на LICENSE.

### REV-004
- Severity: major
- Path: packets/R2-evals-economics.md, C08 и «Противоречия»
- Observation: статус `disputed` заявлен на основании «контрпримеров в индустрии» («исследовательские мультиагентные системы анонсируются вендорами»), но ни один такой источник не прочитан и не указан. Единственный контрдовод по мультиагентности — тот же S5 в качестве позиции.
- Why it matters: `disputed` требует хотя бы одного прочитанного источника противоположной стороны; иначе это непроверенное утверждение. Для урока U09 нет баланса.
- Required change: либо прочитать и добавить один противоположный источник (напр., пост Anthropic о multi-agent research system — открыть и проверить URL самому), либо поменять статус на `reported` и убрать «disputed», оставив честный gap.
- Verification: в C08 либо есть строка источника-оппонента в таблице, либо нет слова disputed.

### REV-005
- Severity: minor
- Path: R2-evals-economics-registry-delta.json, запись cognition-dont-build-multi-agents
- Observation: `type: "discussion"`, тогда как это корпоративный блог-пост (в packet указано article).
- Why it matters: тип «discussion» создаёт ложное впечатление, что есть обсуждение сбоев; обязательный «контрдовод/обсуждение» формально закрыт неточной разметкой. Реальных обсуждений (HN/GitHub issues) нет — packet честно пишет об этом в Gaps.
- Required change: `type` → `article`.
- Verification: значение в JSON.

### REV-006
- Severity: minor
- Path: packets/R2-evals-economics.md, C07 / S4
- Observation: страница METR на дату чтения содержит ссылки на более поздние исследования (например, «early-2026 … 349 technical workers», самоотчёт 1.4–2x). Packet называет результат snapshot раннего 2025, но не упоминает последующих обновлений.
- Why it matters: на дату 2026-11-08 контрпример может устаревать; автор урока не должен подавать его как актуальный.
- Required change: в ограничения C07 добавить: «на странице METR есть более поздние работы; перед публикацией урока проверить актуальность»; сами эти работы не цитировать, пока не прочитаны.
- Verification: оговорка есть в C07.

### REV-007
- Severity: minor
- Path: packets/R2-evals-economics.md, C09 и «Не принимаем»
- Observation: C09 — собственный синтез, без источника формулы CPAO; честно помечен reported. S4 — про время, а не про стоимость токенов/повторные попытки/человеческую проверку, поэтому утверждение «экономика включает…» из S4+S1 прямо не следует.
- Why it matters: риск представить авторскую рамку как найденную в литературе.
- Required change: переименовать статус в `reported (авторский синтез, источника нет)` и в формулировке убрать «единственный надёжный способ».
- Verification: правка формулировки C09.

## Достаточность для автора
- Пример (Rechat/L1–L3, openai/evals), контрпример (METR, Cognition), offline-практикум с fixture 60/40/20 и проверкой понимания про 95% raw agreement — пригодны. Но числа CPAO для трёх конфигураций автору придётся задавать самому (цены из условия), это корректно оговорено.
- Применимость к harness осталась `unverified` — корректно.
- Секретов, ПДн и крупных цитат нет. Неудача поиска (arXiv:2403.07889) описана честно.
- Не покрыты FinOps/TCO и кейсы отказов (честно в Gaps); для U10 урок о «где ИИ не окупился» опирается на один METR — допустимо только с оговоркой.

## Verdict: rework
Критических нет; 4 major (статусы C03/C05, репозиторий без commit, неподкреплённый disputed), правки малые и точные.
