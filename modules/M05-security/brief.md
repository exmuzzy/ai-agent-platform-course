# M05: Безопасность и governance

Научить задавать enforceable границы полномочий и распределять ответственность за риск. Текстовая инструкция модели не считается достаточным контролем.

- **Уроки:** threat model/identity; approvals, audit и adversarial testing.
- **Выход:** policy matrix, risk register и negative test suite.
- **Полный охват:** identity/least privilege, tenant isolation, secrets, network egress, sandbox, retention, data poisoning и supply chain; не только injection.
- **Lab:** injection, запрещённое действие, подмена tool output, утечка памяти и повтор операции на sandbox.
- **Проверка:** опасный вызов отклоняется исполнительным контуром, даже когда модель его предлагает.
- **Граница:** никакого тестирования реальных компаний и публичных сервисов без разрешения.
- **Источники:** SRC-08, SRC-09, SRC-12.

Исполнитель: A05. Юридические выводы по конкретной отрасли требуют отдельной квалифицированной проверки.
