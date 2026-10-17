import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import {
  completeAutomationTask,
  fetchAutomationTask,
  returnAutomationTaskForRevision,
  type AutomationOutcome,
  type AutomationTask,
} from "@/entities/automation";
import {
  applyEntityFieldValue,
  getEntityFieldDisplayName,
  getEntityListParentField,
  getEntityPreviewValueContext,
  getVisibleListOptions,
  isEntityComputedFieldType,
  normalizeEntityFieldInputValue,
  parseEntityFieldFileValue,
  parseEntityListValueIds,
  RecordValue,
  resolveEntityListFieldPresentation,
  sanitizeEntityRelationDependencies,
  updateEntityRecord,
  useEntityConfig,
  useEntityValueContext,
  type EntityField,
} from "@/entities/entity";
import { useSessionUser } from "@/entities/session";
import {
  automationOutcomeNeedsInput,
  getAutomationOutcomeAskFields,
  getAutomationTaskAskFields,
  type AutomationAskFields,
} from "@/features/automation-tasks";
import { TaskViewTabsPreview } from "@/features/automation-tasks/ui/TaskViewTabsPreview";
import { getAutomationErrorMessage } from "@/shared/lib/error-message";
import { RecordFieldControl } from "@/pages/entity/ui/RecordFieldControl";

type TaskFillFieldsDialogProps = {
  taskId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompleted?: () => void;
  onOpenRecord?: (entityId: string, recordId: string) => void;
};

function isFieldFilled(field: EntityField, value: string) {
  if (field.type === "boolean") return true;
  if (field.type === "file") return parseEntityFieldFileValue(value) != null;
  return value.trim().length > 0;
}

function TaskFillFieldsDialogBody({
  taskId,
  onOpenChange,
  onCompleted,
  onOpenRecord,
}: {
  taskId: string;
  onOpenChange: (open: boolean) => void;
  onCompleted?: () => void;
  onOpenRecord?: (entityId: string, recordId: string) => void;
}) {
  const sessionUser = useSessionUser();
  const { entities } = useEntityConfig();
  const valueContext = useEntityValueContext();
  const previewContext = getEntityPreviewValueContext(valueContext);

  const [task, setTask] = useState<AutomationTask | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [selectedOutcomeId, setSelectedOutcomeId] = useState<string | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const next = await fetchAutomationTask(taskId);
        if (cancelled) return;
        setTask(next);
        setSelectedOutcomeId(null);
        if (!next) {
          setError("Задача не найдена");
          return;
        }
        const entity = entities.find((item) => item.id === next.entityId);
        const record = entity?.records.find(
          (item) => item.id === next.recordId,
        );
        const ask = getAutomationTaskAskFields(next);
        const draft: Record<string, string> = {};
        for (const fieldId of ask.visibleFieldIds) {
          const field = entity?.fields.find((item) => item.id === fieldId);
          const raw = record?.values[fieldId] ?? "";
          draft[fieldId] = field
            ? normalizeEntityFieldInputValue(field, raw)
            : raw;
        }
        setValues(
          entity
            ? sanitizeEntityRelationDependencies(entity, draft, entities)
            : draft,
        );
      } catch (err: unknown) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Не удалось загрузить задачу",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [taskId, entities]);

  const entity = entities.find((item) => item.id === task?.entityId) ?? null;
  const record =
    entity?.records.find((item) => item.id === task?.recordId) ?? null;
  const selectedOutcome: AutomationOutcome | null =
    task?.config.outcomes.find((item) => item.id === selectedOutcomeId) ?? null;
  const ask: AutomationAskFields | null = selectedOutcome
    ? getAutomationOutcomeAskFields(selectedOutcome)
    : null;
  const requiredIds = new Set(ask?.requiredFieldIds ?? []);
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

  const missingRequiredCount = ask
    ? ask.requiredFieldIds.filter((fieldId) => {
        const field = entity?.fields.find((item) => item.id === fieldId);
        if (!field) return true;
        return !isFieldFilled(field, values[fieldId] ?? "");
      }).length
    : 0;

  const hasOutcomeForm =
    ask != null &&
    (fields.length > 0 || viewFields.length > 0 || ask.viewTabIds.length > 0);

  function setValue(fieldId: string, value: string) {
    if (!entity) return;
    setValues((current) =>
      applyEntityFieldValue(entity, current, fieldId, value, entities),
    );
  }

  /**
   * Persist form values that should land on the record before complete/return.
   * Includes «запись» and required fields so setField / spawn see them.
   */
  async function persistValues(outcomeId?: string) {
    if (!task || !entity || !record) return;
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
    if (!task || !entity) return "Задача не загружена";
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
      return `Заполните обязательные поля: ${labels.join(", ")}`;
    }
    return null;
  }

  async function handleComplete(outcomeId: string) {
    const validationError = validateForOutcome(outcomeId);
    if (validationError) {
      setError(validationError);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await persistValues(outcomeId);
      await completeAutomationTask(
        task!.id,
        outcomeId,
        sessionUser?.id ?? null,
        values,
      );
      onOpenChange(false);
      onCompleted?.();
    } catch (err: unknown) {
      setError(getAutomationErrorMessage(err, "Ошибка завершения"));
    } finally {
      setBusy(false);
    }
  }

  function handleOutcomeClick(outcome: AutomationOutcome) {
    setError(null);
    if (!automationOutcomeNeedsInput(outcome)) {
      void handleComplete(outcome.id);
      return;
    }
    setSelectedOutcomeId(outcome.id);
  }

  async function handleReturn() {
    if (!task) return;
    setBusy(true);
    setError(null);
    try {
      await persistValues();
      await returnAutomationTaskForRevision(task.id, sessionUser?.id ?? null);
      onOpenChange(false);
      onCompleted?.();
    } catch (err: unknown) {
      setError(getAutomationErrorMessage(err, "Ошибка возврата"));
    } finally {
      setBusy(false);
    }
  }

  const nameFieldId = entity?.fields.find((field) => field.locked)?.id ?? "";
  const recordTitle = record?.values[nameFieldId]?.trim() || record?.id || "";

  return (
    <>
      <DialogHeader>
        <DialogTitle className="pr-8">
          {task?.name ?? "Задача автоматизации"}
        </DialogTitle>
        <DialogDescription>
          {selectedOutcome
            ? `Заполните поля для результата «${selectedOutcome.label}».`
            : entity
              ? `Выберите результат, чтобы продолжить процесс «${entity.name}».`
              : "Выберите результат и при необходимости заполните поля."}
          {recordTitle ? (
            <span className="mt-1 block text-foreground/80">
              Запись: {recordTitle}
            </span>
          ) : null}
        </DialogDescription>
      </DialogHeader>

      {loading ? (
        <div className="flex flex-col gap-3">
          <div className="h-10 animate-pulse rounded-lg bg-muted/50" />
          <div className="h-10 animate-pulse rounded-lg bg-muted/40" />
          <div className="h-24 animate-pulse rounded-lg bg-muted/30" />
        </div>
      ) : !task || !entity || !record ? (
        <p className="text-sm text-muted-foreground">
          {error ??
            "Запись ещё не загружена. Обновите страницу или откройте карточку."}
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {!selectedOutcome ? (
            <p className="rounded-lg border border-dashed border-border/80 bg-muted/20 px-3 py-3 text-sm text-muted-foreground">
              Нажмите кнопку результата — поля формы появятся, если они заданы
              для этого результата.
            </p>
          ) : hasOutcomeForm ? (
            <TaskViewTabsPreview
              entity={entity}
              record={{ ...record, values: { ...record.values, ...values } }}
              tabIds={ask?.viewTabIds ?? []}
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
                      <div className="flex flex-col gap-2.5 rounded-xl border border-border/70 bg-muted/15 px-3 py-3">
                        <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                          Для просмотра
                        </p>
                        <div className="flex flex-col gap-2.5">
                          {viewFields.map((field) => (
                            <div
                              key={field.id}
                              className="flex flex-col gap-0.5 rounded-lg border border-border/50 bg-background/80 px-2.5 py-2"
                            >
                              <span className="text-[11px] font-medium text-muted-foreground">
                                {getEntityFieldDisplayName(field)}
                              </span>
                              <RecordValue
                                ctx={previewContext}
                                entity={entity}
                                record={{
                                  ...record,
                                  values: { ...record.values, ...values },
                                }}
                                field={field}
                                className="text-sm text-foreground"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {fields.length > 0 ? (
                      <div className="flex flex-col gap-3">
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
                                  обязательно
                                </span>
                              ) : null}
                              <RecordFieldControl
                                ctx={previewContext}
                                entity={entity}
                                field={field}
                                value={values[field.id] ?? ""}
                                values={{ ...record.values, ...values }}
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

          {error ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>
      )}

      <DialogFooter className="flex-col gap-2 sm:flex-col">
        {selectedOutcome ? (
          <div className="flex w-full flex-wrap gap-2">
            <Button
              type="button"
              disabled={busy || loading || !task || !record}
              onClick={() => void handleComplete(selectedOutcome.id)}
            >
              {selectedOutcome.label}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy || loading}
              onClick={() => {
                setSelectedOutcomeId(null);
                setError(null);
              }}
            >
              Назад
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy || loading || !task}
              onClick={() => void handleReturn()}
            >
              На доработку
            </Button>
          </div>
        ) : (
          <div className="flex w-full flex-wrap gap-2">
            {(task?.config.outcomes ?? []).map((outcome) => (
              <Button
                key={outcome.id}
                type="button"
                disabled={busy || loading || !task || !record}
                onClick={() => handleOutcomeClick(outcome)}
              >
                {outcome.label}
              </Button>
            ))}
            <Button
              type="button"
              variant="outline"
              disabled={busy || loading || !task}
              onClick={() => void handleReturn()}
            >
              На доработку
            </Button>
          </div>
        )}
        <div className="flex w-full flex-wrap gap-2">
          {task && onOpenRecord ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              disabled={busy}
              onClick={() => onOpenRecord(task.entityId, task.recordId)}
            >
              Открыть карточку
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto text-muted-foreground"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Позже
          </Button>
        </div>
      </DialogFooter>
    </>
  );
}

export function TaskFillFieldsDialog({
  taskId,
  open,
  onOpenChange,
  onCompleted,
  onOpenRecord,
}: TaskFillFieldsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-full min-w-[min(100%,28rem)] max-w-[min(92vw,32rem)] gap-5 overflow-y-auto sm:max-w-[min(92vw,32rem)]">
        {open && taskId ? (
          <TaskFillFieldsDialogBody
            key={taskId}
            taskId={taskId}
            onOpenChange={onOpenChange}
            onCompleted={onCompleted}
            onOpenRecord={onOpenRecord}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
