import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import {
  createAutomationNotificationRuleId,
  defaultAssigneeResolver,
  describeAutomationNotificationEvent,
  emptyAutomationConditions,
  removeNotificationRule as removeAutomationNotificationRule,
  saveNotificationRule as saveAutomationNotificationRule,
  type AutomationNotificationRule,
} from "@/entities/automation";
import { getEntityDisplayName } from "@/entities/entity";
import { AutomationNotificationRuleEditor } from "@/features/manage-automations";
import { TemplateRichText } from "@/features/manage-automations/ui/TemplateRichText";
import { Button } from "@/shared/ui/button";
import type { RegistryTask } from "../model/notification-registry";

export function AutomationTaskNotificationsPanel({
  task,
  highlightRuleId = null,
}: {
  task: RegistryTask;
  /** Scroll/emphasize a specific automation rule when opened from the tree. */
  highlightRuleId?: string | null;
}) {
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!highlightRuleId) return;
    const node = document.getElementById(`automation-rule-${highlightRuleId}`);
    node?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [highlightRuleId, task.rules.length]);

  async function handleAdd() {
    setBusy(true);
    try {
      const rule: AutomationNotificationRule = {
        id: createAutomationNotificationRuleId(),
        templateId: task.templateId,
        event: "assigned",
        recipients: defaultAssigneeResolver(),
        conditions: emptyAutomationConditions(),
        messageTemplate: "",
      };
      await saveAutomationNotificationRule(rule);
      toast.success("Правило уведомления добавлено");
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "Не удалось добавить правило",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleSave(rule: AutomationNotificationRule) {
    await saveAutomationNotificationRule(rule);
  }

  async function handleDelete(ruleId: string) {
    setBusy(true);
    try {
      await removeAutomationNotificationRule(ruleId);
      toast.success("Правило удалено");
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "Не удалось удалить правило",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-border px-4 py-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-snug tracking-tight">
              <TemplateRichText
                value={task.template.name}
                fields={task.entity.fields}
                empty="Без названия"
              />
            </p>
            <p className="mt-1 truncate text-[11px] text-muted-foreground">
              {getEntityDisplayName(task.entity)} · {task.processName} ·{" "}
              {task.scenarioName}
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 shrink-0"
            disabled={busy}
            onClick={() => void handleAdd()}
          >
            <Plus className="size-3.5" />
            Уведомление
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        {task.rules.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-3 py-8 text-center text-xs text-muted-foreground">
            Пока нет уведомлений для этого задания. Добавьте правило, если нужно
            оповестить кого-то кроме исполнителя.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {task.rules.map(({ rule, label }) => (
              <li
                key={rule.id}
                id={`automation-rule-${rule.id}`}
                className={
                  highlightRuleId === rule.id
                    ? "rounded-xl ring-2 ring-primary/30"
                    : undefined
                }
              >
                <p className="mb-1.5 px-0.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                  {label || describeAutomationNotificationEvent(rule.event)}
                </p>
                <AutomationNotificationRuleEditor
                  rule={rule}
                  entity={task.entity}
                  onSave={(next) => void handleSave(next)}
                  onDelete={() => void handleDelete(rule.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
