# ТК-01…ТК-18 — чеклист после внедрения

Перед прогоном:

1. Применить миграцию `20261119120000_lead_tkp_parity_spawn_fixes.sql` на стенд.
2. Настроить сценарии по `SCENARIO_BLUEPRINT.md` (на стенде сейчас только stub-шаблоны).
3. Для шага 7 обязательно `fanOut: true` + `completeWhen: "all"`.
4. После кейсов расчёта: 0 interactive-заданий с `assignee_user_id is null`.

| № | Статус | Заметки |
|---|--------|---------|
| ТК-01 | ⬜ | createRecord → Создано; задание 4 после 5 |
| ТК-02 | ⬜ | отказ ГИ → Черновик; respawn 2–3 |
| ТК-03 | ⬜ | задание 5 у рук. ведущего; выбор отделов после 5 |
| ТК-04 | ⬜ | N руководителей + ГИП; fanOut |
| ТК-05 | ⬜ | complete без Workspace → after-hook ГИП |
| ТК-06 | ⬜ | ручной перенос: rows first / AUTOMATION_ASSIGNEE_MISSING |
| ТК-07 | ⬜ | исход «Нет объёмов» + баннер «Есть объёмы» |
| ТК-08 | ⬜ | недостающие исходные → lock |
| ТК-09 | ⬜ | completeWhen=all → шаг 8 |
| ТК-10 | ⬜ | возврат 9→8 (return revision) |
| ТК-11 | ⬜ | пересчёт / supersede без completed-dedupe |
| ТК-12 | ⬜ | отдел ГИП → ГИП лида |
| ТК-13 | ⬜ | текст «гип» в поле ≠ отдел ГИП |
| ТК-14 | ⬜ | assertTkpDocumentApprovalReady |
| ТК-15 | ⬜ | ЛИНК + return-to-step |
| ТК-16 | ⬜ | TkpSendToCustomerPanel |
| ТК-17 | ⬜ | blocking stage / sequential |
| ТК-18 | ⬜ | fanOut флагом, не именем сущности |

Диагностика:

```sql
select t.id, t.name, t.record_id, t.template_id, t.trigger_option_id, t.created_at
from public.automation_tasks t
where t.status in ('pending', 'returned')
  and t.assignee_user_id is null
  and coalesce(t.config->>'kind', '') not in ('autofill', 'actions')
order by t.created_at desc;
```
