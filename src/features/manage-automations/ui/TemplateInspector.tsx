import { useState, type ReactNode } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
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
  decision: "Решение",
  single: "Одна кнопка",
} as const;

function Field({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label className="text-xs font-medium text-foreground">{title}</Label>
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
    <div className="rounded-md border border-border/70 bg-background p-2.5">
      <div className="flex h-7 items-center justify-between gap-2">
        <p className="text-xs font-medium">Поля формы</p>
        {available.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 border-dashed px-2 text-xs text-muted-foreground"
                />
              }
            >
              <Plus className="size-3 shrink-0" />
              Поле
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-64 min-w-48">
              {available.map((field) => (
                <DropdownMenuItem
                  key={field.id}
                  onClick={() =>
                    onChange({
                      ...value,
                      visibleFieldIds: [...value.visibleFieldIds, field.id],
                    })
                  }
                >
                  {getEntityFieldDisplayName(field)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
      {selected.length === 0 ? (
        <p className="mt-2 text-[11px] text-muted-foreground">Нет полей</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1">
          {selected.map((field) => {
            const required = value.requiredFieldIds.includes(field.id);
            return (
              <li
                key={field.id}
                className="flex h-8 items-center gap-1.5 rounded border border-border/50 px-2"
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
  onSave: (template: AutomationTaskTemplate) => void | Promise<void>;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState(template);
  const [tab, setTab] = useState("general");
  const [saving, setSaving] = useState(false);

  function patch(partial: Partial<AutomationTaskTemplate>) {
    setDraft((prev) => ({ ...prev, ...partial }));
  }

  function patchOutcome(index: number, outcome: AutomationOutcome) {
    setDraft((prev) => {
      const outcomes = [...prev.outcomes];
      outcomes[index] = outcome;
      return { ...prev, outcomes };
    });
  }

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    try {
      await onSave(draft);
      toast.success("Шаг сохранён");
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Не удалось сохранить шаг";
      console.error("[automation] save template failed", error);
      toast.error(message);
    } finally {
      setSaving(false);
    }
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

  const stageName =
    options.find((item) => item.id === draft.triggerOptionId)?.name ??
    "Без стадии";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border pb-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold">
            {draft.name.trim() || "Новая задача"}
          </h3>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {stageName} · {KIND_LABELS[draft.kind]}
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
          className="h-9 w-full shrink-0 justify-start gap-4 overflow-x-auto"
        >
          <TabsTrigger value="general" className="px-0">
            Основное
          </TabsTrigger>
          <TabsTrigger value="assignee" className="px-0">
            Кто
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

        <div className="min-h-0 flex-1 overflow-auto pt-4">
          <TabsContent value="general" className="mt-0 flex flex-col gap-3.5">
            <Field title="Название">
              <Input
                value={draft.name}
                placeholder="Согласовать смету"
                onChange={(event) => patch({ name: event.target.value })}
              />
            </Field>

            <Field title="Имя в списке">
              <Input
                value={draft.nameTemplate}
                placeholder="{{поле}} или как в названии"
                onChange={(event) =>
                  patch({ nameTemplate: event.target.value })
                }
              />
            </Field>

            <Field title="Стадия">
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

            <div className="grid grid-cols-2 items-end gap-3">
              <Field title="Порядок">
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

            <div className="rounded-lg border border-border/70 bg-muted/15 px-3 py-2">
              <SettingSwitch
                id="template-blocking"
                title="Блокирует переход"
                checked={draft.isBlocking}
                onCheckedChange={(isBlocking) => patch({ isBlocking })}
              />
            </div>
          </TabsContent>

          <TabsContent value="assignee" className="mt-0 flex flex-col gap-3.5">
            <Field title="Исполнитель">
              <AssigneeEditor
                value={draft.assignee}
                fields={entity.fields}
                onChange={(assignee) => patch({ assignee })}
              />
            </Field>
          </TabsContent>

          <TabsContent
            value="conditions"
            className="mt-0 flex flex-col gap-3.5"
          >
            <Field title="Условия запуска">
              <ConditionGroupBuilder
                entity={entity}
                value={draft.launchConditions}
                onChange={(launchConditions) => patch({ launchConditions })}
              />
            </Field>
          </TabsContent>

          <TabsContent value="outcomes" className="mt-0 flex flex-col gap-3">
            {draft.outcomes.map((outcome, index) => (
              <div
                key={outcome.id}
                className="rounded-lg border border-border/70 p-3"
              >
                <Field title="Кнопка">
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

                <div className="mt-3 flex flex-col gap-2.5">
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
                    Удалить
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
              Результат
            </Button>
          </TabsContent>

          <TabsContent value="more" className="mt-0 flex flex-col gap-3.5">
            <Field title="Срок, часы">
              <Input
                type="number"
                value={draft.sla?.hours != null ? String(draft.sla.hours) : ""}
                placeholder="Без срока"
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

            <div className="flex h-8 items-center justify-between gap-2">
              <p className="text-xs font-medium">Уведомления</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7"
                onClick={() => void addNotificationRule()}
              >
                <Plus className="size-3.5" />
                Правило
              </Button>
            </div>
            {notificationRules.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                Нет правил
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

      <div className="relative z-10 shrink-0 border-t border-border bg-background pt-3">
        <Button
          type="button"
          className="w-full"
          disabled={saving}
          onClick={() => void handleSave()}
        >
          {saving ? "Сохранение…" : "Сохранить"}
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
      <div className="mb-2 flex items-center gap-2">
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
          <SelectTrigger className="h-9 min-w-0 flex-1">
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
        placeholder="Текст"
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
        Сохранить
      </Button>
    </div>
  );
}
