import { useRef, useState, type DragEvent, type ReactNode } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
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
  defaultAutofillOutcomes,
  defaultDecisionOutcomes,
  emptyAutomationConditions,
  emptyAutomationOutcomeFieldAccess,
  normalizeAutomationOutcomeFieldAccess,
  removeNotificationRule,
  saveNotificationRule,
  type AutomationNotificationEvent,
  type AutomationNotificationRule,
  type AutomationOutcome,
  type AutomationOutcomeFieldAccess,
  type AutomationTaskKind,
  type AutomationTaskTemplate,
} from "@/entities/automation";
import { AssigneeEditor } from "@/entities/automation/ui/AssigneeEditor";
import {
  getEntityFieldDisplayName,
  isEntityRecordsTab,
  type Entity,
  type EntityField,
} from "@/entities/entity";
import {
  lockDragSelection,
  unlockDragSelection,
} from "@/shared/lib/drag-selection";
import { ActionPipelineEditor } from "./ActionPipelineEditor";
import { ConditionGroupBuilder } from "./ConditionGroupBuilder";
import { OutcomeAutofillEditor } from "./OutcomeAutofillEditor";
import { OutcomeRouteBranchesEditor } from "./OutcomeRouteBranchesEditor";
import { TemplateFieldInput } from "./TemplateFieldInput";
import { TemplateRichText } from "./TemplateRichText";
import { cn } from "@/shared/lib/cn";

const OUTCOME_FIELD_MIME = "application/x-ipk-outcome-field";

const fieldLayoutTransition = {
  type: "spring" as const,
  stiffness: 420,
  damping: 36,
  mass: 0.55,
};

const dropIndicatorTransition = {
  type: "spring" as const,
  stiffness: 520,
  damping: 32,
  mass: 0.4,
};

function reorderFieldIds(
  ids: string[],
  fieldId: string,
  beforeFieldId: string | null,
) {
  const without = ids.filter((id) => id !== fieldId);
  if (beforeFieldId == null) return [...without, fieldId];
  const index = without.indexOf(beforeFieldId);
  if (index < 0) return [...without, fieldId];
  return [...without.slice(0, index), fieldId, ...without.slice(index)];
}

function getDropEdge(event: DragEvent<HTMLElement>): "before" | "after" {
  const rect = event.currentTarget.getBoundingClientRect();
  return event.clientY < rect.top + rect.height / 2 ? "before" : "after";
}

function setFieldDragPreview(event: DragEvent, source: HTMLElement) {
  const rect = source.getBoundingClientRect();
  const ghost = source.cloneNode(true) as HTMLElement;
  ghost.querySelectorAll("button, input, label").forEach((node) => {
    node.remove();
  });
  ghost.setAttribute("aria-hidden", "true");
  Object.assign(ghost.style, {
    position: "fixed",
    top: "-1000px",
    left: "-1000px",
    width: `${rect.width}px`,
    margin: "0",
    pointerEvents: "none",
    zIndex: "99999",
    opacity: "1",
    transform: "rotate(1deg)",
    boxShadow:
      "0 14px 32px -14px rgb(0 0 0 / 0.35), 0 0 0 1px color-mix(in oklab, var(--primary) 35%, transparent)",
    borderColor: "color-mix(in oklab, var(--primary) 45%, transparent)",
    background: "var(--card)",
  });
  document.body.appendChild(ghost);
  const offsetX = Math.min(
    Math.max(event.clientX - rect.left, 10),
    Math.max(rect.width - 10, 10),
  );
  const offsetY = Math.min(
    Math.max(event.clientY - rect.top, 10),
    Math.max(rect.height - 10, 10),
  );
  event.dataTransfer.setDragImage(ghost, offsetX, offsetY);
  requestAnimationFrame(() => {
    ghost.remove();
  });
}

function FieldDropIndicator({ edge }: { edge: "before" | "after" }) {
  return (
    <motion.span
      aria-hidden
      initial={{ opacity: 0, scaleX: 0.82 }}
      animate={{ opacity: 1, scaleX: 1 }}
      exit={{ opacity: 0, scaleX: 0.9 }}
      transition={dropIndicatorTransition}
      className={cn(
        "pointer-events-none absolute right-0 left-0 z-20 flex origin-left items-center",
        edge === "before"
          ? "top-0 -translate-y-1/2"
          : "bottom-0 translate-y-1/2",
      )}
    >
      <span className="relative flex size-2 shrink-0 items-center justify-center">
        <motion.span
          aria-hidden
          className="absolute size-2 rounded-full bg-primary/30"
          animate={{ scale: [1, 1.35, 1] }}
          transition={{
            duration: 0.9,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
        <span className="size-1.5 rounded-full bg-primary" />
      </span>
      <span className="h-0.5 min-w-0 flex-1 rounded-full bg-primary" />
    </motion.span>
  );
}

/** Red grab rail to the left of the field card (outside the border). */
function FieldDragHandle({
  label,
  active = false,
}: {
  label: string;
  active?: boolean;
}) {
  return (
    <span
      data-drag-handle
      className={cn(
        "relative z-10 flex w-2.5 shrink-0 touch-none items-center justify-center self-stretch select-none",
        active ? "cursor-grabbing" : "cursor-grab",
      )}
      aria-label={label}
      title={label}
      onPointerDown={() => {
        window.getSelection()?.removeAllRanges();
      }}
    >
      <span
        aria-hidden
        className={cn(
          "my-1 h-[calc(100%-0.5rem)] min-h-5 w-1 shrink-0 rounded-full bg-primary transition-[opacity,transform,box-shadow] duration-150",
          active
            ? "scale-y-105 opacity-100 shadow-[0_0_0_3px] shadow-primary/20"
            : "opacity-45 group-hover/field:opacity-90 group-focus-within/field:opacity-90",
        )}
      />
    </span>
  );
}

const KIND_LABELS: Record<AutomationTaskKind, string> = {
  decision: "Решение",
  single: "Одна кнопка",
  autofill: "Автозаполнение",
};

function outcomesForKind(
  kind: AutomationTaskKind,
  current: AutomationOutcome[],
): AutomationOutcome[] {
  if (kind === "autofill") {
    if (current.length === 0) return defaultAutofillOutcomes();
    return current.map((item, index, list) => {
      const isElse = index === list.length - 1;
      return {
        ...item,
        label: isElse
          ? "Иначе"
          : item.label.trim() && item.label !== "Иначе"
            ? item.label
            : "Если",
        fieldAccess: emptyAutomationOutcomeFieldAccess(),
        conditions: isElse
          ? emptyAutomationConditions()
          : (item.conditions ?? emptyAutomationConditions()),
      };
    });
  }
  if (kind === "single") {
    return current.length >= 1
      ? [
          {
            ...current[0]!,
            label: current[0]!.label.trim() || "Готово",
            conditions: current[0]!.conditions ?? emptyAutomationConditions(),
          },
        ]
      : [
          {
            id: createAutomationOutcomeId(),
            label: "Готово",
            actions: [],
            fieldAccess: emptyAutomationOutcomeFieldAccess(),
            conditions: emptyAutomationConditions(),
          },
        ];
  }
  return current.length >= 2
    ? current.map((item) => ({
        ...item,
        conditions: item.conditions ?? emptyAutomationConditions(),
      }))
    : defaultDecisionOutcomes();
}

function Field({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label className="text-xs font-medium text-foreground">{title}</Label>
      {children}
    </div>
  );
}

function FieldFlagCheckbox({
  checked,
  disabled,
  label,
  title,
  onCheckedChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  title: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label
      data-no-drag
      title={title}
      className={cn(
        "flex shrink-0 cursor-pointer items-center gap-1 text-[11px] text-muted-foreground",
        checked && !disabled && "text-foreground",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <input
        type="checkbox"
        className="size-3 accent-primary"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onCheckedChange(event.target.checked)}
      />
      {label}
    </label>
  );
}

function toggleIdList(ids: string[], fieldId: string, enabled: boolean) {
  if (enabled) {
    return ids.includes(fieldId) ? ids : [...ids, fieldId];
  }
  return ids.filter((id) => id !== fieldId);
}

/** Compact: only selected fields; add via select. Flags = checkboxes on the row. */
function OutcomeAskFieldsEditor({
  fields,
  value,
  onChange,
  hasRecordsTab,
}: {
  fields: EntityField[];
  value: AutomationOutcomeFieldAccess;
  onChange: (next: AutomationOutcomeFieldAccess) => void;
  hasRecordsTab: boolean;
}) {
  const access = normalizeAutomationOutcomeFieldAccess(value);
  const selected = access.visibleFieldIds
    .map((id) => fields.find((field) => field.id === id))
    .filter((field): field is EntityField => field != null);
  const available = fields.filter(
    (field) => !access.visibleFieldIds.includes(field.id),
  );

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropHint, setDropHint] = useState<{
    beforeFieldId: string | null;
  } | null>(null);
  const dragLockedRef = useRef(false);
  const allowDragRef = useRef(false);

  function removeField(fieldId: string) {
    onChange({
      ...access,
      visibleFieldIds: access.visibleFieldIds.filter((id) => id !== fieldId),
      requiredFieldIds: access.requiredFieldIds.filter((id) => id !== fieldId),
      commentFieldIds: access.commentFieldIds.filter((id) => id !== fieldId),
      recordFieldIds: access.recordFieldIds.filter((id) => id !== fieldId),
    });
  }

  function setRequired(fieldId: string, required: boolean) {
    onChange({
      ...access,
      requiredFieldIds: toggleIdList(
        access.requiredFieldIds,
        fieldId,
        required,
      ),
    });
  }

  function setComment(fieldId: string, enabled: boolean) {
    onChange({
      ...access,
      commentFieldIds: toggleIdList(access.commentFieldIds, fieldId, enabled),
    });
  }

  function setRecord(fieldId: string, enabled: boolean) {
    onChange({
      ...access,
      recordFieldIds: toggleIdList(access.recordFieldIds, fieldId, enabled),
    });
  }

  function endDrag() {
    allowDragRef.current = false;
    setDraggingId(null);
    setDropHint(null);
    if (dragLockedRef.current) {
      unlockDragSelection();
      dragLockedRef.current = false;
    }
  }

  function applyReorder(beforeFieldId: string | null) {
    if (!draggingId) return;
    const nextIds = reorderFieldIds(
      access.visibleFieldIds,
      draggingId,
      beforeFieldId,
    );
    const unchanged =
      nextIds.length === access.visibleFieldIds.length &&
      nextIds.every((id, index) => id === access.visibleFieldIds[index]);
    if (!unchanged) {
      onChange({ ...access, visibleFieldIds: nextIds });
    }
    endDrag();
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
                      ...access,
                      visibleFieldIds: [...access.visibleFieldIds, field.id],
                      recordFieldIds: access.recordFieldIds.includes(field.id)
                        ? access.recordFieldIds
                        : [...access.recordFieldIds, field.id],
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
        <LayoutGroup id="outcome-ask-fields">
          <ul className="mt-2 flex flex-col gap-1">
            {selected.map((field, index) => {
              const required = access.requiredFieldIds.includes(field.id);
              const toComments = access.commentFieldIds.includes(field.id);
              const toRecord = access.recordFieldIds.includes(field.id);
              const label = getEntityFieldDisplayName(field);
              const isDragging = draggingId === field.id;
              const dropEdge: "before" | "after" | null =
                dropHint == null || draggingId === field.id
                  ? null
                  : dropHint.beforeFieldId === field.id
                    ? "before"
                    : dropHint.beforeFieldId == null &&
                        index === selected.length - 1
                      ? "after"
                      : null;

              return (
                <li key={field.id} className="list-none">
                  <div
                    className="group/field relative"
                    draggable
                    onMouseDown={(event) => {
                      allowDragRef.current = Boolean(
                        event.target instanceof Element &&
                        event.target.closest("[data-drag-handle]"),
                      );
                      if (allowDragRef.current) {
                        window.getSelection()?.removeAllRanges();
                      }
                    }}
                    onDragStart={(event) => {
                      if (!allowDragRef.current) {
                        event.preventDefault();
                        return;
                      }
                      lockDragSelection();
                      dragLockedRef.current = true;
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData(OUTCOME_FIELD_MIME, field.id);
                      event.dataTransfer.setData("text/plain", field.id);
                      const preview =
                        event.currentTarget.querySelector<HTMLElement>(
                          "[data-outcome-field-card]",
                        );
                      if (preview) setFieldDragPreview(event, preview);
                      setDraggingId(field.id);
                      setDropHint(null);
                    }}
                    onDragEnd={endDrag}
                    onDragOver={(event) => {
                      if (draggingId == null || draggingId === field.id) return;
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                      const edge = getDropEdge(event);
                      const beforeFieldId =
                        edge === "before"
                          ? field.id
                          : (selected[index + 1]?.id ?? null);
                      setDropHint((prev) =>
                        prev?.beforeFieldId === beforeFieldId
                          ? prev
                          : { beforeFieldId },
                      );
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      if (draggingId == null || draggingId === field.id) {
                        endDrag();
                        return;
                      }
                      const edge = getDropEdge(event);
                      const beforeFieldId =
                        edge === "before"
                          ? field.id
                          : (selected[index + 1]?.id ?? null);
                      applyReorder(beforeFieldId);
                    }}
                  >
                    <motion.div
                      layout="position"
                      layoutId={`outcome-field-${field.id}`}
                      transition={fieldLayoutTransition}
                      className="relative flex items-stretch gap-0.5"
                    >
                      <FieldDragHandle
                        label={`Перетащить «${label}»`}
                        active={isDragging}
                      />
                      <div className="relative min-w-0 flex-1">
                        <AnimatePresence initial={false}>
                          {dropEdge ? (
                            <FieldDropIndicator key="drop" edge={dropEdge} />
                          ) : null}
                        </AnimatePresence>
                        {isDragging ? (
                          <div
                            aria-hidden
                            className="h-8 rounded border-2 border-dashed border-primary/35 bg-primary/[0.04]"
                          />
                        ) : (
                          <div
                            data-outcome-field-card
                            className="flex h-8 items-center gap-1.5 rounded border border-border/50 bg-card px-2 transition-[border-color,box-shadow] duration-150 group-hover/field:border-border"
                          >
                            <span className="min-w-0 flex-1 truncate text-xs">
                              {label}
                            </span>
                            <FieldFlagCheckbox
                              checked={required}
                              label="обяз."
                              title="Обязательное поле"
                              onCheckedChange={(checked) =>
                                setRequired(field.id, checked)
                              }
                            />
                            <FieldFlagCheckbox
                              checked={toComments}
                              disabled={!hasRecordsTab}
                              label="комм."
                              title={
                                hasRecordsTab
                                  ? "Добавить содержимое в комментарии (вкладка «Записи»)"
                                  : "Нет вкладки «Записи» у этой сущности"
                              }
                              onCheckedChange={(checked) =>
                                setComment(field.id, checked)
                              }
                            />
                            <FieldFlagCheckbox
                              checked={toRecord}
                              label="запись"
                              title="Записать значение в поле сущности"
                              onCheckedChange={(checked) =>
                                setRecord(field.id, checked)
                              }
                            />
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
                          </div>
                        )}
                      </div>
                    </motion.div>
                  </div>
                </li>
              );
            })}
          </ul>
        </LayoutGroup>
      )}
    </div>
  );
}

export function TemplateInspector({
  template,
  entity,
  entities,
  options,
  triggerFieldId,
  notificationRules,
  onSave,
  onDelete,
}: {
  template: AutomationTaskTemplate;
  entity: Entity;
  entities: Entity[];
  options: Array<{ id: string; name: string }>;
  /** Process trigger list field — used for stage routing in autofill. */
  triggerFieldId: string;
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
          fieldAccess: emptyAutomationOutcomeFieldAccess(),
          conditions: emptyAutomationConditions(),
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
          <h3 className="truncate text-sm font-semibold leading-snug">
            {draft.name.trim() ? (
              <TemplateRichText value={draft.name} fields={entity.fields} />
            ) : (
              "Новая задача"
            )}
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
            {draft.kind === "autofill" ? "Переходы" : "Результаты"}
          </TabsTrigger>
          <TabsTrigger value="more" className="px-0">
            Ещё
          </TabsTrigger>
        </TabsList>

        <div className="min-h-0 flex-1 overflow-auto pt-4">
          <TabsContent value="general" className="mt-0 flex flex-col gap-3.5">
            <TemplateFieldInput
              id="template-name"
              title="Название"
              value={draft.name}
              placeholder="Согласовать смету"
              fields={entity.fields}
              onChange={(name) => patch({ name })}
            />

            <TemplateFieldInput
              id="template-name-list"
              title="Имя в списке"
              value={draft.nameTemplate}
              placeholder="Как в названии"
              fields={entity.fields}
              onChange={(nameTemplate) => patch({ nameTemplate })}
            />

            <TemplateFieldInput
              id="template-description"
              title="Описание"
              value={draft.description}
              placeholder="Что нужно сделать"
              fields={entity.fields}
              multiline
              onChange={(description) => patch({ description })}
            />

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
                    if (
                      next === "decision" ||
                      next === "single" ||
                      next === "autofill"
                    ) {
                      patch({
                        kind: next,
                        outcomes: outcomesForKind(next, draft.outcomes),
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
                    <SelectItem value="autofill">
                      Переход / автозаполнение
                    </SelectItem>
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
            {draft.kind === "autofill" ? (
              <OutcomeRouteBranchesEditor
                outcomes={draft.outcomes}
                entity={entity}
                entities={entities}
                triggerFieldId={triggerFieldId}
                stages={options}
                onChange={(outcomes) => patch({ outcomes })}
              />
            ) : (
              <>
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

                    <div className="mt-3 flex flex-col gap-2.5">
                      <OutcomeAutofillEditor
                        actions={outcome.actions}
                        sourceEntity={entity}
                        entities={entities}
                        hint="Заполнятся при нажатии этой кнопки"
                        onChange={(actions) =>
                          patchOutcome(index, { ...outcome, actions })
                        }
                      />

                      <OutcomeAskFieldsEditor
                        fields={entity.fields}
                        value={outcome.fieldAccess}
                        hasRecordsTab={entity.tabs.some(isEntityRecordsTab)}
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

                      <div className="flex flex-col gap-1.5">
                        <p className="text-xs font-medium text-muted-foreground">
                          Другие действия
                        </p>
                        <ActionPipelineEditor
                          actions={outcome.actions}
                          entities={entities}
                          sourceEntity={entity}
                          omitKinds={["setField"]}
                          addKind="createRecord"
                          onChange={(actions) =>
                            patchOutcome(index, { ...outcome, actions })
                          }
                        />
                      </div>
                    </div>

                    {draft.outcomes.length > 1 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="mt-2 h-7 text-destructive"
                        onClick={() =>
                          patch({
                            outcomes: draft.outcomes.filter(
                              (_, i) => i !== index,
                            ),
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
              </>
            )}
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
