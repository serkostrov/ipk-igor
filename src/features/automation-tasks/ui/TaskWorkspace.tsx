import { useCallback, useMemo, useState } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/shared/ui/button";
import {
  automationRequiresTimeTracking,
  type AutomationTask,
} from "@/entities/automation";
import { TaskTimeSessionsPanel } from "./TaskTimeSessionsPanel";
import {
  applyEntityFieldValue,
  getEntityFieldDisplayName,
  getEntityListParentField,
  getEntityPreviewValueContext,
  getVisibleListOptions,
  isEntityComputedFieldType,
  isEntityNameField,
  normalizeEntityFieldInputValue,
  parseEntityFieldFileValue,
  parseEntityListValueIds,
  RecordValue,
  resolveEntityListFieldPresentation,
  sanitizeEntityRelationDependencies,
  updateEntityRecord,
  useEntityConfig,
  useEntityValueContext,
  type Entity,
  type EntityField,
  type EntityRecord,
} from "@/entities/entity";
import { useSessionUser } from "@/entities/session";
import { getAutomationErrorMessage } from "@/shared/lib/error-message";
import { RecordFieldControl } from "@/pages/entity/ui/RecordFieldControl";
import {
  automationOutcomeNeedsInput,
  automationTaskShowsFormUpfront,
  getAutomationOutcomeAskFields,
  getAutomationTaskAskFields,
  getDefaultSelectedOutcomeId,
} from "../lib/task-ask-fields";
import { TaskViewTabsPreview } from "./TaskViewTabsPreview";

function isFieldFilled(field: EntityField, value: string) {
  if (field.type === "boolean") return true;
  if (field.type === "file") return parseEntityFieldFileValue(value) != null;
  return value.trim().length > 0;
}

function recordTitle(
  entity: { fields: EntityField[] } | undefined,
  values: Record<string, string>,
) {
  const nameField = entity?.fields.find((field) => isEntityNameField(field));
  const title = nameField ? (values[nameField.id] ?? "").trim() : "";
  return title || null;
}

function buildTaskFormValues(
  entity: Entity,
  record: EntityRecord,
  visibleFieldIds: string[],
  entities: Entity[],
) {
  const draft: Record<string, string> = {};
  for (const fieldId of visibleFieldIds) {
    const field = entity.fields.find((item) => item.id === fieldId);
    const raw = record.values[fieldId] ?? "";
    draft[fieldId] = field ? normalizeEntityFieldInputValue(field, raw) : raw;
  }
  return sanitizeEntityRelationDependencies(entity, draft, entities);
}

export function TaskWorkspace({
  task,
  onOpenRecord,
  onComplete,
  onReturn,
  onCompleted,
}: {
  task: AutomationTask;
  onOpenRecord?: (entityId: string, recordId: string) => void;
  onComplete: (
    outcomeId: string,
    formValues?: Record<string, string>,
  ) => Promise<void>;
  onReturn: () => Promise<void>;
  onCompleted: () => void;
}) {
  const { entities } = useEntityConfig();
  const entity = entities.find((item) => item.id === task.entityId);
  const record = entity?.records.find((item) => item.id === task.recordId);

  return (
    <TaskWorkspaceBody
      key={`${task.id}:${record?.id ?? "pending"}`}
      task={task}
      entity={entity}
      record={record}
      entities={entities}
      onOpenRecord={onOpenRecord}
      onComplete={onComplete}
      onReturn={onReturn}
      onCompleted={onCompleted}
    />
  );
}

function TaskWorkspaceBody({
  task,
  entity,
  record,
  entities,
  onOpenRecord,
  onComplete,
  onReturn,
  onCompleted,
}: {
  task: AutomationTask;
  entity: Entity | undefined;
  record: EntityRecord | undefined;
  entities: Entity[];
  onOpenRecord?: (entityId: string, recordId: string) => void;
  onComplete: (
    outcomeId: string,
    formValues?: Record<string, string>,
  ) => Promise<void>;
  onReturn: () => Promise<void>;
  onCompleted: () => void;
}) {
  const sessionUser = useSessionUser();
  const valueContext = useEntityValueContext();
  const previewContext = getEntityPreviewValueContext(valueContext);

  const taskAsk = getAutomationTaskAskFields(task);
  const formUpfront = automationTaskShowsFormUpfront(task);
  const [selectedOutcomeId, setSelectedOutcomeId] = useState<string | null>(
    () => getDefaultSelectedOutcomeId(task),
  );
  const selectedOutcome =
    task.config.outcomes.find((item) => item.id === selectedOutcomeId) ?? null;
  const ask = selectedOutcome
    ? getAutomationOutcomeAskFields(selectedOutcome)
    : null;
  const requiredIds = useMemo(
    () => new Set(ask?.requiredFieldIds ?? []),
    [ask?.requiredFieldIds],
  );

  const [values, setValues] = useState<Record<string, string>>(() =>
    entity && record
      ? buildTaskFormValues(entity, record, taskAsk.visibleFieldIds, entities)
      : {},
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loggedSeconds, setLoggedSeconds] = useState(0);
  const requireTime = automationRequiresTimeTracking(task.config.materials);
  const onTotalSecondsChange = useCallback((seconds: number) => {
    setLoggedSeconds(seconds);
  }, []);

  const fields =
    !entity || !ask
      ? []
      : ask.visibleFieldIds
          .map((fieldId) => entity.fields.find((field) => field.id === fieldId))
          .filter((field): field is EntityField => field != null)
          .filter((field) => !isEntityComputedFieldType(field.type));

  const viewFields =
    !entity || !ask
      ? []
      : ask.viewFieldIds
          .map((fieldId) => entity.fields.find((field) => field.id === fieldId))
          .filter((field): field is EntityField => field != null);

  const mergedValues = useMemo(
    () => ({ ...(record?.values ?? {}), ...values }),
    [record?.values, values],
  );

  const title = recordTitle(entity, mergedValues);
  const hasOutcomeForm =
    ask != null &&
    (fields.length > 0 || viewFields.length > 0 || ask.viewTabIds.length > 0);
  const missingRequiredCount = ask
    ? ask.requiredFieldIds.filter((fieldId) => {
        const field = entity?.fields.find((item) => item.id === fieldId);
        if (!field) return true;
        return !isFieldFilled(field, values[fieldId] ?? "");
      }).length
    : 0;

  function setValue(fieldId: string, value: string) {
    if (!entity) return;
    setValues((current) =>
      applyEntityFieldValue(entity, current, fieldId, value, entities),
    );
  }

  async function persistValues(outcomeId?: string) {
    if (!entity || !record) return;
    const outcomes = outcomeId
      ? task.config.outcomes.filter((item) => item.id === outcomeId)
      : task.config.outcomes;
    const fieldIds = new Set(
      outcomes.flatMap((item) => [
        ...item.fieldAccess.recordFieldIds,
        ...item.fieldAccess.requiredFieldIds,
      ]),
    );
    const patch: Record<string, string> = {};
    for (const fieldId of fieldIds) {
      if (!entity.fields.some((field) => field.id === fieldId)) continue;
      if (values[fieldId] === undefined) continue;
      patch[fieldId] = values[fieldId]!;
    }
    if (Object.keys(patch).length === 0) return;
    await updateEntityRecord(task.entityId, task.recordId, {
      ...record.values,
      ...patch,
    });
  }

  function validateForOutcome(outcomeId: string) {
    if (!entity) return "Задача не загружена";
    const outcome = task.config.outcomes.find((item) => item.id === outcomeId);
    if (!outcome) return "Не выбран результат";

    const missing = outcome.fieldAccess.requiredFieldIds.filter((fieldId) => {
      const field = entity.fields.find((item) => item.id === fieldId);
      if (!field) return true;
      return !isFieldFilled(field, values[fieldId] ?? "");
    });
    if (missing.length > 0) {
      const labels = missing.map((fieldId) => {
        const field = entity.fields.find((item) => item.id === fieldId);
        return field ? getEntityFieldDisplayName(field) : fieldId;
      });
      return `Заполните: ${labels.join(", ")}`;
    }
    return null;
  }

  async function run(outcomeId: string) {
    const validationError = validateForOutcome(outcomeId);
    if (validationError) {
      setError(validationError);
      return;
    }
    if (requireTime && loggedSeconds <= 0) {
      setError(
        "Чтобы завершить задание, добавьте время вручную или запустите и остановите таймер.",
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await persistValues(outcomeId);
      await onComplete(outcomeId, values);
      onCompleted();
    } catch (err: unknown) {
      setError(getAutomationErrorMessage(err, "Ошибка завершения"));
    } finally {
      setBusy(false);
    }
  }

  function handleOutcomeClick(outcomeId: string) {
    const outcome = task.config.outcomes.find((item) => item.id === outcomeId);
    if (!outcome) return;
    setError(null);
    if (!automationOutcomeNeedsInput(outcome)) {
      void run(outcomeId);
      return;
    }
    setSelectedOutcomeId(outcomeId);
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h2 className="min-w-0 text-lg font-semibold tracking-tight text-balance">
            {task.name}
          </h2>
          {task.isBlocking ? (
            <span className="shrink-0 rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
              Блокирует переход
            </span>
          ) : null}
        </div>
        {task.description.trim() ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
            {task.description}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span>{entity?.name ?? "Сущность"}</span>
          <span className="text-muted-foreground/40" aria-hidden>
            ·
          </span>
          <span>Шаг {task.stepOrder}</span>
          {task.dueAt ? (
            <>
              <span className="text-muted-foreground/40" aria-hidden>
                ·
              </span>
              <span>до {new Date(task.dueAt).toLocaleString("ru")}</span>
            </>
          ) : null}
          {title && onOpenRecord ? (
            <>
              <span className="text-muted-foreground/40" aria-hidden>
                ·
              </span>
              <button
                type="button"
                className="truncate font-medium text-foreground underline-offset-2 hover:underline"
                onClick={() => onOpenRecord(task.entityId, task.recordId)}
              >
                {title}
              </button>
            </>
          ) : null}
        </div>
      </header>

      {!entity || !record ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          Запись ещё не загружена. Обновите страницу.
        </p>
      ) : !selectedOutcome ? (
        <div className="rounded-xl border border-dashed border-border/80 bg-muted/15 px-4 py-3">
          <p className="text-sm text-muted-foreground">
            Выберите результат — поля формы появятся, если они заданы для этого
            варианта.
          </p>
        </div>
      ) : hasOutcomeForm ? (
        <TaskViewTabsPreview
          entity={entity}
          record={{ ...record, values: mergedValues }}
          tabIds={ask.viewTabIds}
          className="shadow-xs"
          fillBadge={
            missingRequiredCount > 0 ? (
              <span className="rounded-md bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive tabular-nums">
                {missingRequiredCount}
              </span>
            ) : null
          }
          fillSlot={
            fields.length > 0 || viewFields.length > 0 ? (
              <div className="flex flex-col gap-4">
                {viewFields.length > 0 ? (
                  <div className="flex flex-col gap-2.5">
                    <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                      Контекст
                    </p>
                    <div className="grid gap-2">
                      {viewFields.map((field) => (
                        <div
                          key={field.id}
                          className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5"
                        >
                          <p className="text-[11px] font-medium text-muted-foreground">
                            {getEntityFieldDisplayName(field)}
                          </p>
                          <RecordValue
                            ctx={previewContext}
                            entity={entity}
                            record={{ ...record, values: mergedValues }}
                            field={field}
                            className="mt-0.5 text-sm text-foreground"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {fields.length > 0 ? (
                  <div className="flex flex-col gap-3.5">
                    {viewFields.length > 0 ? (
                      <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                        Заполнить
                      </p>
                    ) : null}
                    {fields.map((field) => {
                      const parentField = getEntityListParentField(
                        entity,
                        field,
                      );
                      const parentValue = parentField
                        ? (values[parentField.id] ??
                          record.values[parentField.id])
                        : undefined;
                      const listOptions =
                        field.type === "list"
                          ? getVisibleListOptions(
                              field,
                              parentValue,
                              parentField,
                              entities,
                            )
                          : field.listOptions;
                      const listPresentation =
                        resolveEntityListFieldPresentation(field, entities);
                      const listDisabled =
                        field.type === "list" &&
                        parentField != null &&
                        parseEntityListValueIds(parentValue).length === 0;
                      const required = requiredIds.has(field.id);

                      return (
                        <div key={field.id} className="relative">
                          {required ? (
                            <span className="absolute top-0 right-0 z-10 inline-flex items-center gap-1 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                              <Lock className="size-3" aria-hidden />
                              обяз.
                            </span>
                          ) : null}
                          <RecordFieldControl
                            ctx={previewContext}
                            entity={entity}
                            field={field}
                            value={values[field.id] ?? ""}
                            values={mergedValues}
                            onChange={(value) => setValue(field.id, value)}
                            listOptions={listOptions}
                            listDisabled={listDisabled}
                            listDisabledHint={
                              parentField
                                ? `Сначала выберите «${getEntityFieldDisplayName(parentField)}»`
                                : undefined
                            }
                            listMultiple={listPresentation.listMultiple}
                            showColors={listPresentation.listUseColors}
                            listAllowEmpty={!required}
                            entities={entities}
                            recordId={record.id}
                            required={required}
                          />
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            ) : undefined
          }
        />
      ) : null}

      <TaskTimeSessionsPanel
        taskId={task.id}
        userId={sessionUser?.id}
        required={requireTime}
        disabled={busy}
        onTotalSecondsChange={onTotalSecondsChange}
        onError={(message) => setError(message)}
      />

      {error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <footer className="flex flex-col gap-3 border-t border-border/70 pt-4">
        <div className="flex flex-wrap gap-2">
          {selectedOutcome ? (
            <>
              <Button
                type="button"
                disabled={busy || !record}
                onClick={() => void run(selectedOutcome.id)}
              >
                {selectedOutcome.label}
              </Button>
              {!formUpfront ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    setSelectedOutcomeId(null);
                    setError(null);
                  }}
                >
                  Назад
                </Button>
              ) : null}
            </>
          ) : (
            task.config.outcomes.map((outcome) => (
              <Button
                key={outcome.id}
                type="button"
                disabled={busy || !record}
                onClick={() => handleOutcomeClick(outcome.id)}
              >
                {outcome.label}
              </Button>
            ))
          )}
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              setError(null);
              void (async () => {
                try {
                  await persistValues();
                  await onReturn();
                  onCompleted();
                } catch (err: unknown) {
                  setError(getAutomationErrorMessage(err, "Ошибка возврата"));
                } finally {
                  setBusy(false);
                }
              })();
            }}
          >
            На доработку
          </Button>
        </div>
      </footer>
    </div>
  );
}
