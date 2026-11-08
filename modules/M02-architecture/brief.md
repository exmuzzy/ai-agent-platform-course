# M02: Архитектура и контракты платформы

Разделить runtime, tools, policy, context, state и delivery поверх существующего harness. Любое усложнение нужно обосновать альтернативой и тестом.

- **Уроки:** границы компонентов; версионирование, оркестрация и совместимость.
- **Выход:** схема, tool contract, version manifest и два ADR.
- **Инфраструктура:** сравнение local/cloud/hybrid, hosted API/self-hosting, model gateway, хранения/очередей/state; минимальный выбор компонентов.
- **Lab:** независимый synthetic client, pin runtime/instructions и rollback.
- **Проверка:** отсутствие скрытой зависимости от рабочего HOME и соседнего checkout.
- **Изменение harness:** минимальный patch допускается в отдельном worktree с regression.
- **Источники:** SRC-02, SRC-03, SRC-05, SRC-06.

Исполнитель: A02. Не предписывать MCP, микросервисы или multi-agent как обязательный ответ.
