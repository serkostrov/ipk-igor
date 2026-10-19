import { useMemo, useState } from "react";
import { GitBranch, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  createAutomationNotificationRuleId,
  defaultAssigneeResolver,
  describeAutomationNotificationEvent,
  emptyAutomationConditions,
  removeNotificationRule as removeAutomationNotificationRule,
  saveNotificationRule as saveAutomationNotificationRule,
  useAutomationConfig,
  useAutomationStatus,
  type AutomationNotificationRule,
  type AutomationTaskTemplate,
} from "@/entities/automation";
import {
  getEntityDisplayName,
  resolveEntityListFieldOptions,
  useEntityConfig,
  type Entity,
} from "@/entities/entity";
import { AutomationNotificationRuleEditor } from "@/features/manage-automations";
import { Button } from "@/shared/ui/button";
import { Label } from "@/shared/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { pluralRu } from "@/shared/lib/plural";

type TemplateContext = {
  template: AutomationTaskTemplate;
  entity: Entity;
  processName: string;
  scenarioName: string;
  stageName: string;
};

export function AutomationNotificationsPanel() {
  const { entities } = useEntityConfig();
  const { processes, scenarios, templates, notificationRules } =
    useAutomationConfig();
  const status = useAutomationStatus();
  const [entityId, setEntityId] = useState<string>("");
  const [templateId, setTemplateId] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const contexts = useMemo(() => {
    const items: TemplateContext[] = [];
    for (const template of templates) {
      const scenario = scenarios.find(
        (item) => item.id === template.scenarioId,
      );
      if (!scenario) continue;
      const process = processes.find((item) => item.id === scenario.processId);
      if (!process) continue;
      const entity = entities.find((item) => item.id === process.entityId);
      if (!entity) continue;
      const stageField = entity.fields.find(
        (field) => field.id === process.triggerFieldId,
      );
      const stageOptions = stageField
        ? resolveEntityListFieldOptions(stageField, entities)
        : [];
      const stageName =
        stageOptions.find((option) => option.id === template.triggerOptionId)
          ?.name ?? "Стадия";
      items.push({
        template,
        entity,
        processName: process.name.trim() || "Процесс",
        scenarioName: scenario.name.trim() || "Сценарий",
        stageName,
      });
    }
    return items.sort((a, b) => {
      const entityCmp = getEntityDisplayName(a.entity).localeCompare(
        getEntityDisplayName(b.entity),
        "ru",
      );
      if (entityCmp !== 0) return entityCmp;
      const stageCmp = a.stageName.localeCompare(b.stageName, "ru");
      if (stageCmp !== 0) return stageCmp;
      return a.template.name.localeCompare(b.template.name, "ru");
    });
  }, [entities, processes, scenarios, templates]);

  const entityOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const item of contexts) {
      if (!seen.has(item.entity.id)) {
        seen.set(item.entity.id, getEntityDisplayName(item.entity));
      }
    }
    return [...seen.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }, [contexts]);

  const resolvedEntityId =
    (entityId && entityOptions.some((item) => item.id === entityId)
      ? entityId
      : null) ||
    entityOptions[0]?.id ||
    "";

  const templatesForEntity = useMemo(
    () =>
      contexts.filter((item) =>
        resolvedEntityId ? item.entity.id === resolvedEntityId : true,
      ),
    [contexts, resolvedEntityId],
  );

  const resolvedTemplateId =
    (templateId &&
    templatesForEntity.some((item) => item.template.id === templateId)
      ? templateId
      : null) ||
    templatesForEntity[0]?.template.id ||
    "";

  const selectedContext =
    templatesForEntity.find(
      (item) => item.template.id === resolvedTemplateId,
    ) ?? null;

  const rulesForTemplate = useMemo(
    () =>
      notificationRules.filter(
        (rule) => rule.templateId === resolvedTemplateId,
      ),
    [notificationRules, resolvedTemplateId],
  );

  async function handleAdd() {
    if (!selectedContext) return;
    setBusy(true);
    try {
      const rule: AutomationNotificationRule = {
        id: createAutomationNotificationRuleId(),
        templateId: selectedContext.template.id,
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

  if (status === "loading") {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
        <div className="h-16 animate-pulse rounded-lg bg-muted/40" />
        <div className="h-40 animate-pulse rounded-lg bg-muted/40" />
      </div>
    );
  }

  if (contexts.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
        <GitBranch className="size-8 text-muted-foreground/50" aria-hidden />
        <p className="text-sm font-medium">Нет заданий автоматизации</p>
        <p className="max-w-sm text-xs text-muted-foreground">
          Создайте задания на вкладке «Автоматизации» — здесь появятся
          уведомления о назначении, завершении и просрочке.
        </p>
      </div>
    );
  }

  const ruleCountLabel = `${notificationRules.length} ${pluralRu(
    notificationRules.length,
    "правило",
    "правила",
    "правил",
  )}`;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-border px-4 py-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold tracking-tight">
                Автоматизации
              </h3>
              <span className="rounded-md border border-border/80 bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                системный
              </span>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              Уведомления по заданиям: назначение, завершение и просрочка. Те же
              правила, что в настройках задания.
            </p>
          </div>
          <p className="shrink-0 text-[11px] text-muted-foreground">
            {ruleCountLabel}
          </p>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-1">
            <Label className="text-[11px] text-muted-foreground">
              Сущность
            </Label>
            <Select
              value={resolvedEntityId || undefined}
              onValueChange={(next) => {
                if (next == null) return;
                setEntityId(String(next));
                setTemplateId("");
              }}
            >
              <SelectTrigger className="h-9 w-full">
                <SelectValue placeholder="Сущность">
                  {entityOptions.find((item) => item.id === resolvedEntityId)
                    ?.name ?? "Сущность"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {entityOptions.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex min-w-0 flex-col gap-1">
            <Label className="text-[11px] text-muted-foreground">Задание</Label>
            <Select
              value={resolvedTemplateId || undefined}
              onValueChange={(next) => {
                if (next == null) return;
                setTemplateId(String(next));
              }}
            >
              <SelectTrigger className="h-9 w-full">
                <SelectValue placeholder="Задание">
                  {selectedContext
                    ? selectedContext.template.name.trim() || "Без названия"
                    : "Задание"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {templatesForEntity.map((item) => (
                  <SelectItem key={item.template.id} value={item.template.id}>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate">
                        {item.template.name.trim() || "Без названия"}
                      </span>
                      <span className="truncate text-[10px] text-muted-foreground">
                        {item.stageName} · {item.scenarioName}
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        {selectedContext ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {selectedContext.template.name.trim() || "Без названия"}
                </p>
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                  {getEntityDisplayName(selectedContext.entity)} ·{" "}
                  {selectedContext.stageName} · {selectedContext.scenarioName}
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
                Правило
              </Button>
            </div>

            {rulesForTemplate.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border px-3 py-8 text-center text-xs text-muted-foreground">
                Пока нет уведомлений для этого задания. Добавьте правило, если
                нужно оповестить кого-то кроме исполнителя.
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {rulesForTemplate.map((rule) => (
                  <li key={rule.id} className="flex flex-col gap-1.5">
                    <p className="px-0.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                      {describeAutomationNotificationEvent(rule.event)}
                    </p>
                    <AutomationNotificationRuleEditor
                      rule={rule}
                      entity={selectedContext.entity}
                      onSave={(next) => void handleSave(next)}
                      onDelete={() => void handleDelete(rule.id)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Выберите задание
          </p>
        )}
      </div>
    </div>
  );
}
