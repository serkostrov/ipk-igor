# Lead→TKP inventory (stand)

Date: 2026-11-18T21:28:16.829Z

## Processes

- Lead: aproc-41184a46..., aproc-8ec100a8...
- TKP: aproc-3f6245f2...

## Critical finding

Lead/TKP process scenarios on this stand do **not** contain the 13-step etalon templates.
Only stub «Новая задача» templates exist on one scenario (2 templates).
Other automation templates on the stand belong to unrelated entities (подзадачи, задания смежников, задачи ПБК).

## Gaps vs ТЗ

| Step                | Expected                     | Stand                                     |
| ------------------- | ---------------------------- | ----------------------------------------- |
| 1-5 Lead chain      | Sequential blocking tasks    | Missing                                   |
| 6 Select depts      | GIP task on TKP              | Missing                                   |
| 7 Dept calc fan-out | Parallel relatedField fanOut | Missing                                   |
| 8-9 GIP/ГИ approval | Sequential                   | Missing                                   |
| 10-11 Price/doc     | Manager task                 | Missing                                   |
| 12.1-12.3 Approval  | Decision chain               | Missing (gen director noted absent in TZ) |
| 13 Send             | Validation flow              | Missing                                   |

## Code gaps (independent of config)

See plan §10: race, after-hook, completed dedupe, GIP name match, fanOut by name, void persist, deferred actions, silent client-only.

## Assignee step 7

Cannot verify from stand — template not configured. Must use relatedField + fanOut:true + completeWhen:all on «Расчёты отделов» after rows exist.

## GIP part double-count

Client prefers field «ГИП» over «Руководитель»; SQL automation_trigger_gip_user_ids prefers «Руководитель» first — must align to «ГИП».

## Null-assignee open tasks

Query returned 0 interactive null-assignee pending tasks on stand currently.
