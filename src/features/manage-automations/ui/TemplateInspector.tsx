import { useState, type ReactNode } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { SettingSwitch } from "@/shared/ui/setting-controls";
import {
  createAutomationNotificationRuleId,
  createAutomationOutcomeId,
  defaultAssigneeResolver,
  defaultDecisionOutcomes,
  emptyAutomationConditions,
  removeNotificationRule,
  saveNotificationRule,
  type AutomationNotificationEvent,
  type AutomationNotificationRule,
  type AutomationOutcome,
  type AutomationOutcomeFieldAccess,
  type AutomationTaskTemplate,
} from "@/entities/automation";
import { AssigneeEditor } from "@/entities/automation/ui/AssigneeEditor";
import {
  getEntityFieldDisplayName,
  type Entity,
  type EntityField,
} from "@/entities/entity";
import { ActionPipelineEditor } from "./ActionPipelineEditor";
import { ConditionGroupBuilder } from "./ConditionGroupBuilder";
import { cn } from "@/shared/lib/cn";

const KIND_LABELS = {
  decision: "Решение (Да / Нет)",
  single: "Одна кнопка",
} as const;

function Field({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-col gap-0.5">
        <Label className="text-xs font-medium text-foreground">{title}</Label>
        {description ? (
          <p className="text-[11px] leading-snug text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {children}
    </div>
  );
}

/** Compact: only selected fields; add via select. Required = checkbox on the row. */
function OutcomeAskFieldsEditor({
  fields,
  value,
  onChange,
}: {
  fields: EntityField[];
  value: AutomationOutcomeFieldAccess;
  onChange: (next: AutomationOutcomeFieldAccess) => void;
}) {
  const selected = value.visibleFieldIds
    .map((id) => fields.find((field) => field.id === id))
    .filter((field): field is EntityField => field != null);
  const available = fields.filter(
    (field) => !value.visibleFieldIds.includes(field.id),
  );

  function removeField(fieldId: string) {
    onChange({
      ...value,
      visibleFieldIds: value.visibleFieldIds.filter((id) => id !== fieldId),
      requiredFieldIds: value.requiredFieldIds.filter((id) => id !== fieldId),
    });
  }

  function setRequired(fieldId: string, required: boolean) {
    onChange({
      ...value,
      requiredFieldIds: required
        ? value.requiredFieldIds.includes(fieldId)
          ? value.requiredFieldIds
          : [...value.requiredFieldIds, fieldId]
        : value.requiredFieldIds.filter((id) => id !== fieldId),
    });
  }

  return (
    <div className="rounded-md border border-border/70 bg-background p-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium">Запросить поля</p>
        {available.length > 0 ? (
          <Select
            key={value.visibleFieldIds.join("|")}
            onValueChange={(next) => {
              if (next == null) return;
              const id = String(next);
              onChange({
                ...value,
                visibleFieldIds: [...value.visibleFieldIds, id],
              });
            }}
          >
            <SelectTrigger
              size="sm"
              className="h-7 w-auto max-w-[9rem] gap-1 border-dashed px-2 text-xs text-muted-foreground"
            >
              <Plus className="size-3 shrink-0" />
              <SelectValue placeholder="Поле" />
            </SelectTrigger>
            <SelectContent>
              {available.map((field) => (
                <SelectItem key={field.id} value={field.id}>
                  {getEntityFieldDisplayName(field)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>
      {selected.length === 0 ? (
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          Исполнитель заполнит в карточке перед нажатием кнопки
        </p>
      ) : (
        <ul className="mt-1.5 flex flex-col gap-1">
          {selected.map((field) => {
            const required = value.requiredFieldIds.includes(field.id);
            return (
              <li
                key={field.id}
                className="flex items-center gap-1.5 rounded border border-border/50 px-2 py-1"
              >
                <span className="min-w-0 flex-1 truncate text-xs">
                  {getEntityFieldDisplayName(field)}
                </span>
                <label
                  className={cn(
                    "flex shrink-0 cursor-pointer items-center gap-1 text-[11px] text-muted-foreground",
                    required && "text-foreground",
                  )}
                >
                  <input
                    type="checkbox"
                    className="size-3 accent-primary"
                    checked={required}
                    onChange={(event) =>
                      setRequired(field.id, event.target.checked)
                    }
                  />
                  обяз.
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="size-6 shrink-0"
                  aria-label="Убрать поле"
                  onClick={() => removeField(field.id)}
                >
                  <Trash2 className="size-3" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function TemplateInspector({
  template,
  entity,
  entities,
  options,
  notificationRules,
  onSave,
  onDelete,
}: {
  template: AutomationTaskTemplate;
  entity: Entity;
  entities: Entity[];
  options: Array<{ id: string; name: string }>;
  notificationRules: AutomationNotificationRule[];
  onSave: (template: AutomationTaskTemplate) => void;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState(template);
  const [tab, setTab] = useState("general");

  function patch(partial: Partial<AutomationTaskTemplate>) {
    setDraft((prev) => ({ ...prev, ...partial }));
  }

  function patchOutcome(index: number, outcome: AutomationOutcome) {
    const outcomes = [...draft.outcomes];
    outcomes[index] = outcome;
    patch({ outcomes });
  }

  async function addNotificationRule() {
    const rule: AutomationNotificationRule = {
      id: createAutomationNotificationRuleId(),
      templateId: draft.id,
      event: "assigned",
      recipients: defaultAssigneeResolver(),
      conditions: emptyAutomationConditions(),
      messageTemplate: "",
    };
    await saveNotificationRule(rule);
  }

  function addOutcome() {
    patch({
      outcomes: [
        ...draft.outcomes,
        {
          id: createAutomationOutcomeId(),
          label: "Результат",
          actions: [],
          fieldAccess: {
            requiredFieldIds: [],
            visibleFieldIds: [],
            requireAttachment: false,
          },
        },
      ],
    });
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-start justify-between gap-2 border-b border-border pb-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold">
            {draft.name.trim() || "Новая задача"}
          </h3>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {options.find((item) => item.id === draft.triggerOptionId)?.name ??
              "Стадия не выбрана"}
            {" · "}
            {KIND_LABELS[draft.kind]}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="shrink-0 text-destructive"
          aria-label="Удалить шаг"
          onClick={onDelete}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>

      <Tabs
        value={tab}
        onValueChange={setTab}
        className="flex min-h-0 flex-1 flex-col gap-0"
      >
        <TabsList
          variant="line"
          className="h-auto w-full shrink-0 justify-start gap-3 overflow-x-auto"
        >
          <TabsTrigger value="general" className="px-0">
            Основное
          </TabsTrigger>
          <TabsTrigger value="assignee" className="px-0">
            Кто делает
          </TabsTrigger>
          <TabsTrigger value="conditions" className="px-0">
            Условия
          </TabsTrigger>
          <TabsTrigger value="outcomes" className="px-0">
            Результаты
          </TabsTrigger>
          <TabsTrigger value="more" className="px-0">
            Ещё
          </TabsTrigger>
        </TabsList>

        <div className="min-h-0 flex-1 overflow-auto pt-3">
          <TabsContent value="general" className="mt-0 flex flex-col gap-4">
            <Field title="Название задачи">
              <Input
                value={draft.name}
                placeholder="Например, Согласовать смету"
                onChange={(event) => patch({ name: event.target.value })}
              />
            </Field>

            <Field
              title="Имя в списке задач"
              description="Можно подставить значение поля записи: {{id_поля}}"
            >
              <Input
                value={draft.nameTemplate}
                placeholder={draft.name || "Как в названии"}
                onChange={(event) =>
                  patch({ nameTemplate: event.target.value })
                }
              />
            </Field>

            <Field
              title="На какой стадии появляется"
              description="Когда запись попадает на эту стадию — создаётся задача"
            >
              <Select
                value={draft.triggerOptionId}
                onValueChange={(next) => {
                  if (next != null) patch({ triggerOptionId: String(next) });
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {options.find((item) => item.id === draft.triggerOptionId)
                      ?.name || "Выберите стадию"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {options.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field title="Порядок" description="Меньше — раньше">
                <Input
                  type="number"
                  value={String(draft.stepOrder)}
                  onChange={(event) =>
                    patch({ stepOrder: Number(event.target.value) || 0 })
                  }
                />
              </Field>
              <Field title="Тип шага">
                <Select
                  value={draft.kind}
                  onValueChange={(next) => {
                    if (next === "decision" || next === "single") {
                      patch({
                        kind: next,
                        outcomes:
                          next === "single"
                            ? [
                                {
                                  id: createAutomationOutcomeId(),
                                  label: "Готово",
                                  actions: [],
                                  fieldAccess: {
                                    requiredFieldIds: [],
                                    visibleFieldIds: [],
                                    requireAttachment: false,
                                  },
                                },
                              ]
                            : draft.outcomes.length >= 2
                              ? draft.outcomes
                              : defaultDecisionOutcomes(),
                      });
                    }
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>{KIND_LABELS[draft.kind]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="decision">
                      {KIND_LABELS.decision}
                    </SelectItem>
                    <SelectItem value="single">{KIND_LABELS.single}</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <div className="rounded-lg border border-border/70 bg-muted/15 px-3 py-2.5">
              <SettingSwitch
                id="template-blocking"
                title="Блокирует переход"
                description="Пока задача не закрыта, стадию нельзя сменить"
                checked={draft.isBlocking}
                onCheckedChange={(isBlocking) => patch({ isBlocking })}
              />
            </div>
          </TabsContent>

          <TabsContent value="assignee" className="mt-0 flex flex-col gap-4">
            <Field
              title="Исполнитель"
              description="Кому создаётся задача на этой стадии"
            >
              <AssigneeEditor
                value={draft.assignee}
                fields={entity.fields}
                onChange={(assignee) => patch({ assignee })}
              />
            </Field>
          </TabsContent>

          <TabsContent value="conditions" className="mt-0 flex flex-col gap-4">
            <Field
              title="Когда создавать задачу"
              description="Пустой список — всегда. Иначе только если запись подходит под правила"
            >
              <ConditionGroupBuilder
                entity={entity}
                value={draft.launchConditions}
                onChange={(launchConditions) => patch({ launchConditions })}
              />
            </Field>
          </TabsContent>

          <TabsContent value="outcomes" className="mt-0 flex flex-col gap-3">
            <p className="text-[11px] leading-snug text-muted-foreground">
              Кнопки завершения задачи
            </p>
            {draft.outcomes.map((outcome, index) => (
              <div
                key={outcome.id}
                className="rounded-lg border border-border/70 p-3"
              >
                <Field title="Название кнопки">
                  <Input
                    value={outcome.label}
                    placeholder="Да / Нет / Готово"
                    onChange={(event) =>
                      patchOutcome(index, {
                        ...outcome,
                        label: event.target.value,
                      })
                    }
                  />
                </Field>

                <div className="mt-3 flex flex-col gap-2">
                  <p className="text-xs font-medium">Действия</p>
                  <OutcomeAskFieldsEditor
                    fields={entity.fields}
                    value={outcome.fieldAccess}
                    onChange={(fieldAccess) =>
                      patchOutcome(index, { ...outcome, fieldAccess })
                    }
                  />
                  <div className="rounded-md border border-border/70 bg-background px-2.5 py-2">
                    <SettingSwitch
                      id={`outcome-attach-${outcome.id}`}
                      title="Нужно вложение"
                      description="Без файла завершить нельзя"
                      checked={outcome.fieldAccess.requireAttachment}
                      onCheckedChange={(requireAttachment) =>
                        patchOutcome(index, {
                          ...outcome,
                          fieldAccess: {
                            ...outcome.fieldAccess,
                            requireAttachment,
                          },
                        })
                      }
                    />
                  </div>
                  <ActionPipelineEditor
                    actions={outcome.actions}
                    entities={entities}
                    sourceEntity={entity}
                    onChange={(actions) =>
                      patchOutcome(index, { ...outcome, actions })
                    }
                  />
                </div>

                {draft.outcomes.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="mt-2 h-7 text-destructive"
                    onClick={() =>
                      patch({
                        outcomes: draft.outcomes.filter((_, i) => i !== index),
                      })
                    }
                  >
                    Удалить результат
                  </Button>
                ) : null}
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              onClick={addOutcome}
            >
              <Plus className="size-3.5" />
              Добавить результат
            </Button>
          </TabsContent>

          <TabsContent value="more" className="mt-0 flex flex-col gap-4">
            <Field
              title="Срок (часы)"
              description="Через сколько часов задача станет просроченной. Пусто — без срока"
            >
              <Input
                type="number"
                value={draft.sla?.hours != null ? String(draft.sla.hours) : ""}
                placeholder="Например, 24"
                onChange={(event) => {
                  const hours = Number(event.target.value);
                  patch({
                    sla:
                      Number.isFinite(hours) && hours > 0
                        ? { hours, calendar: "247" }
                        : null,
                  });
                }}
              />
            </Field>

            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-medium">Уведомления</p>
                <p className="text-[11px] text-muted-foreground">
                  Доставка в общий инбокс при назначении, завершении или
                  просрочке
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void addNotificationRule()}
              >
                <Plus className="size-3.5" />
                Правило
              </Button>
            </div>
            {notificationRules.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                Пока нет правил уведомлений
              </p>
            ) : (
              notificationRules.map((rule) => (
                <NotificationRuleEditor
                  key={rule.id}
                  rule={rule}
                  entity={entity}
                  onSave={(next) => void saveNotificationRule(next)}
                  onDelete={() => void removeNotificationRule(rule.id)}
                />
              ))
            )}
          </TabsContent>
        </div>
      </Tabs>

      <div className="shrink-0 border-t border-border pt-3">
        <Button type="button" className="w-full" onClick={() => onSave(draft)}>
          Сохранить
        </Button>
      </div>
    </div>
  );
}

function NotificationRuleEditor({
  rule,
  entity,
  onSave,
  onDelete,
}: {
  rule: AutomationNotificationRule;
  entity: Entity;
  onSave: (rule: AutomationNotificationRule) => void;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState(rule);
  const eventLabel =
    draft.event === "assigned"
      ? "Назначение"
      : draft.event === "completed"
        ? "Завершение"
        : "Просрочка";

  return (
    <div className="rounded-lg border border-border/70 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <Select
          value={draft.event}
          onValueChange={(next) => {
            if (
              next === "assigned" ||
              next === "completed" ||
              next === "overdue"
            ) {
              setDraft((prev) => ({
                ...prev,
                event: next as AutomationNotificationEvent,
              }));
            }
          }}
        >
          <SelectTrigger className="h-9 w-full">
            <SelectValue>{eventLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="assigned">Назначение</SelectItem>
            <SelectItem value="completed">Завершение</SelectItem>
            <SelectItem value="overdue">Просрочка</SelectItem>
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="shrink-0 text-destructive"
          aria-label="Удалить правило"
          onClick={onDelete}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
      <Input
        className="mb-2"
        placeholder="Текст уведомления"
        value={draft.messageTemplate}
        onChange={(event) =>
          setDraft((prev) => ({
            ...prev,
            messageTemplate: event.target.value,
          }))
        }
      />
      <AssigneeEditor
        value={draft.recipients}
        fields={entity.fields}
        onChange={(recipients) => setDraft((prev) => ({ ...prev, recipients }))}
      />
      <div className="mt-2">
        <ConditionGroupBuilder
          entity={entity}
          value={draft.conditions}
          onChange={(conditions) =>
            setDraft((prev) => ({ ...prev, conditions }))
          }
        />
      </div>
      <Button
        type="button"
        size="sm"
        className="mt-2"
        onClick={() => onSave(draft)}
      >
        Сохранить правило
      </Button>
    </div>
  );
}
