/**
 * ADR: mapping ipk-new hardcoded automation behaviors → config primitives.
 * Do not add commercial_* action kinds; compose from AUTOMATION_ACTION_KINDS.
 *
 * | ipk-new                         | Core                                      |
 * |---------------------------------|-------------------------------------------|
 * | stage/status spawn              | fieldEnter + triggerOptionId              |
 * | funnel → scenario               | Scenario.entryConditions                  |
 * | launch_conditions               | Template.launchConditions                 |
 * | assignee_kind / from_field      | AssigneeResolver                          |
 * | blocking + sort_order           | isBlocking + stepOrder                    |
 * | yes/no/no_volume                | Outcome defs (decision / single)          |
 * | silent field fill on enter/create | Template.kind=actions + setField         |
 * | if/else stage route               | Scenario.stageTransitions / kind=autofill |
 * | autofill field fill               | Template.kind=actions + setField          |
 * | advance / stay / back           | setField / noop / setFieldPrevious        |
 * | launch_process                  | startProcess                              |
 * | create_request_review (+ sync)  | createRecord + copyFields + setRelation   |
 * | create_linked_leads             | createRecord / updateRecords              |
 * | notifications                   | NotificationRule / notify                 |
 * | SLA overdue                     | Template.sla + slaOverdue worker          |
 * | return for revision             | status returned + parentTaskId clone      |
 * | custom entity binding           | Process.entityId + triggerFieldId         |
 * | manager-task / source_data      | Separate Process (same engine)            |
 */

export const IPK_NEW_AUTOMATION_MAPPING_VERSION = 1;
