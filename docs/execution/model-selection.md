# Выбор моделей (F00)

Дата: 2026-11-08. Список ниже — идентификаторы, которые принимает инструмент создания субагентов в этой среде; он не доказывает цену, квоту или качество. Фактический resolved ID среда в ответе не раскрывает, поэтому в результатах worker записывается как `requested=<ID>; resolved=unknown`.

## Доступные ID

`gpt_6_astra`, `gpt_6_astra_fast`, `gpt_6_1_sol`, `gpt_6_1_sol_fast`, `gemini_4_argon`, `claude_fable_5_1`, `claude_opus_5_5`, `claude_opus_5_5_fast`, `claude_sonnet_5_5`, `pplx_computer_glm_5_2_0822`, `kimi_k3`, `grok_4_7`, `deepseek_v4_pro_0813`.

Отдельного идентификатора DeepSeek Flash в списке нет; рекомендованный профиль для Flash заменяется на `deepseek_v4_pro_0813` по правилу fallback из `recommended-models.md`. Координатор курса — `claude_sonnet_5_5`.

## Назначение ролей

| Роль | Модель | Основание |
|---|---|---|
| Координатор | claude_sonnet_5_5 (оркестратор текущей сессии) | Задано запуском |
| Researcher R1, R4 | deepseek_v4_pro_0813 | Fallback вместо Flash; текстовый research/extraction |
| Researcher R2 | kimi_k3 | Калибровка второй семьи на аналитическом packet |
| Researcher R3 (безопасность) | claude_sonnet_5_5 | Безопасность — задание для Sonnet по профилю |
| Lesson/lab/quiz authors | deepseek_v4_pro_0813 после калибровки | Решается по результатам bootstrap-review |
| Independent reviewer | claude_sonnet_5_5 в отдельном контексте для DeepSeek/Kimi работ; gpt_6_astra_fast для работ Sonnet | Предпочтительно другая семья |
| Visual/browser QA | claude_sonnet_5_5 или gpt_6_astra_fast | DeepSeek V4 Pro не поддерживает изображения по профилю |
| Эскалация | claude_opus_5_5 | Только точечно, после отдельного разрешения; не подключается автоматически |

## Режим

Multi-model, но только в части, подтверждённой параметром `model` при запуске. Доказательства калибровки добавляются после первых результатов.

## Fallback

Если выбор модели недоступен для задачи, применяется single-model режим с независимыми контекстами, и это указывается в handoff.
