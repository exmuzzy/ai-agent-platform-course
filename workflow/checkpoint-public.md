# Публичный checkpoint запуска course-run-20261108-1

Дата: 2026-11-08. Режим: portable, bootstrap-квота (4 worker-запуска) использована полностью. Токены: unknown.

| Задача | Статус | Факт |
|---|---|---|
| F00 | done | `docs/execution/runtime-capabilities.md`, `model-selection.md` |
| F01 | review | Отчёт доступности: harness unavailable в этом запуске; нужен независимый review |
| F02 R1 | ready_for_review | ветка `course/F02-R1`; запрошена DeepSeek V4 Pro, фактически GPT-6.1 Sol |
| F02 R2 | ready_for_review | ветка `course/F02-R2`; Kimi K3 |
| F02 R3 | ready_for_review (partial) | ветка `course/F02-R3`; Claude Sonnet 5.5; OWASP-список и OTel-конвенции не прочитаны |
| F02 R4 | ready_for_review | ветка `course/F02-R4`; запрошена DeepSeek V4 Pro, фактически GPT-6.1 Sol |
| F04 | blocked | Не выбрано устройство с checkout harness |
| Остальные | planned | Ждут F02 review, K00 |

Независимый review F02-пакетов не выполнен: квота bootstrap исчерпана. Следующие ready: review R1–R4, затем K00 (ограниченный, unverified-current) и F03.
