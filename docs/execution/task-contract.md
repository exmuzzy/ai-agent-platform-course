# Контракт задания субагенту

Один task packet должен быть понятен без полной истории диалога. Минимальные входы и явная проверка результата важнее длинного системного prompt.

## Входной packet

```json
{
  "task_id": "A04-LESSON-1",
  "role": "curriculum-author",
  "model_role": "lesson-author",
  "resolved_model_id": "<actual-runtime-model-id>",
  "model_reason": "Разрешённый профиль; принят калибровочный packet",
  "budget_reservation": {
    "run_id": "<persistent-run-id>",
    "unit": "<runtime-enforced-unit>",
    "reserved_total": "<positive-number-including-review>",
    "worker_hard_limit": "<positive-number>",
    "review_reserve": "<positive-number>",
    "deadline_utc": "<actual-deadline>",
    "stop_rule": "<verified-enforcement-and-cancellation>",
    "repair_count": 0,
    "bootstrap_used": "<persisted-count>"
  },
  "goal": "Объяснить error analysis и построение evaluation set",
  "baseline_commit": "<actual-commit>",
  "read_paths": [
    "modules/M04-evals/brief.md",
    "templates/lesson.md"
  ],
  "write_paths": ["modules/M04-evals/lesson-01.md"],
  "source_ids": ["SRC-07"],
  "research_packet": "<actual-reviewed-packet-path>",
  "learner_interest": "Evals и стоимость принятого результата",
  "use_case_ids": ["U03"],
  "skolkovo_topic": "Инженерия AI-агентов",
  "harness_capability": "Указать actual baseline либо unverified",
  "security_scope": "Sandbox, отсутствие реальных deploy/merge",
  "infrastructure_scope": "Версии, CI/test runner, наблюдаемость",
  "facts_not_assumptions": [
    "Учащийся уже использует свой harness",
    "Реальное состояние harness определяется отдельным baseline"
  ],
  "acceptance": [
    "Есть разобранный пример ошибки",
    "Разделены dev и holdout",
    "Есть контрпример ложноположительной метрики",
    "Внешние факты снабжены проверенными URL"
  ],
  "limits": {
    "max_changed_files": 3,
    "max_repair_rounds": 2,
    "lab_live_api": false,
    "nested_delegation": false
  },
  "stop_if": [
    "Нужно изменить общий контракт",
    "Источник недоступен или не подтверждает утверждение",
    "Обнаружены секреты или чужие закрытые данные"
  ]
}
```

Поля в угловых скобках являются placeholders и должны быть заменены перед dispatch. Не запускай задачу с несуществующим путём, неверным source id, непроверенным model ID или открытым write scope «весь репозиторий»; исследовательский packet может честно указывать, что готового source packet ещё нет.

Числовые placeholders budget заменяются числами в одной выбранной единице; `reserved_total` покрывает worker и review, а сумма активных резервов не превышает остаток run. Deadline и stop rule должны быть реально обеспечены runtime/координатором; обещание worker «не тратить много» не является hard limit. Счётчики берутся из checkpoint, не создаются заново при повторной попытке.

## Ответ worker

```json
{
  "task_id": "A04-LESSON-1",
  "result": "ready_for_review",
  "actual_model_id": "<actual-id-or-unknown>",
  "usage": {"status": "unknown", "input_tokens": null, "output_tokens": null},
  "budget_result": {"run_id": "<same-run-id>", "consumed": null, "stop_reason": "<actual>"},
  "changed_paths": ["modules/M04-evals/lesson-01.md"],
  "checks": [
    {"name": "local-links", "status": "passed", "evidence_path": "<sanitized-report>"}
  ],
  "claims": [
    {"claim": "<проверяемое утверждение>", "source_id": "SRC-07", "section": "<раздел>"}
  ],
  "assumptions": [],
  "limitations": ["Практикум с реальной моделью не запускался"],
  "handoff": "Нужно независимое ревью результата обучения и источников"
}
```

Допустимые результаты worker: `ready_for_review`, `blocked`, `partial`. Worker не выставляет себе `done`; оркестратор сверяет реальный diff, проверки и независимый verdict.

Если tool не раскрывает actual model, использовать `unknown`, а не копировать запрошенный ID как доказательство. При назначении review предпочтительна другая разрешённая семья модели; независимость контекста и реальные проверки обязательны в любом fallback.

## Review contract

Reviewer не видит самопохвалу автора как доказательство. Ему передаются задание, actual diff, нужные источники и evidence; при необходимости он самостоятельно выполняет команды на чистом fixture.

Формат finding:

```text
ID: REV-001
Severity: critical | major | minor
Path: конкретный файл и раздел
Observation: что реально обнаружено
Why it matters: какой результат обучения/контракт нарушен
Required change: минимальное исправление
Verification: точная проверка после исправления
Verdict: accept | rework | blocked
```

Critical: утечка, небезопасное внешнее действие, выдуманный результат или источник. Major: практикум не воспроизводится, нет результата обучения, неверная метрика или неполная оценка; такие findings блокируют `done`.

## Evidence практикума

В `evidence.json` использовать поля `module_id`, `source_ids`, `baseline`, `commands`, `test_mode`, `results`, `limitations`, `review`. Значения `test_mode`: `not_run`, `mock`, `live`; `live` допустим только при реальном model-backed запуске.

В results указывать количество кейсов, реальные outcome и ссылки на очищенные файлы; не публиковать hidden prompts, raw traces и model outputs без проверки. Разрешённый экспорт собственного harness не является разрешением на все данные, которые он когда-либо обрабатывал.

## Мини-промпты ролей

- **Researcher:** «Найди точный первоисточник для результата обучения. Верни подтверждённые утверждения, URL, раздел, условия доступа, ограничения и gaps. Не пиши урок».
- **Author:** «По brief и source packet объясни одну тему по шаблону. Включи решение, контрпример и связь с существующим harness. Не расширяй scope».
- **Lab engineer:** «Сделай воспроизводимый offline-практикум. Если нужен patch harness, работай в отдельном разрешённом worktree; покажи baseline, negative case, cleanup и rollback».
- **Reviewer:** «Проверь фактами и запуском, а не общим впечатлением. Найди конкретные причины непринятия; не переписывай текст целиком».
- **Integrator:** «Согласуй термины, артефакты и ссылки; сохрани происхождение изменений. Не удаляй честные ограничения из отчётов».
