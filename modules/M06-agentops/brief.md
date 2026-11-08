# M06: AgentOps, надёжность и поставка

Научить видеть полный путь пользовательской задачи и безопасно восстанавливать workflow. Наличие checkpoint не доказывает exactly-once внешнего действия.

- **Уроки:** traces/metrics/SLO; retries, resume, idempotency и rollback.
- **Выход:** telemetry contract, runbook и fault-injection report.
- **Lab:** crash после tool effect, timeout worker и несовместимая конфигурация.
- **Проверка:** восстановление не дублирует действие; неопределённый исход переводится в reconcile.
- **Изменение harness:** разрешён минимальный instrumentation/recovery patch с тестами.
- **Источники:** SRC-05, SRC-06, SRC-12; конкретный runtime требует актуальной документации.

Исполнитель: A06. Работать в изолированном стенде, не переключать действующих клиентов.
