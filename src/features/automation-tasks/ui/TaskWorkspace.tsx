import { useEffect, useMemo, useState } from "react";
import { Lock, Paperclip } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import {
  addAutomationTaskAttachment,
  fetchAutomationTaskAttachments,
  fetchOpenAutomationTaskTimeSession,
  startAutomationTaskTimeSession,
  stopAutomationTaskTimeSession,
  type AutomationTask,
} from "@/entities/automation";
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
import { cn } from "@/shared/lib/cn";
import { RecordFieldControl } from "@/pages/entity/ui/RecordFieldControl";
import { getAutomationTaskAskFields } from "../lib/task-ask-fields";
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

  const ask = getAutomationTaskAskFields(task);
  const requiredIds = useMemo(
    () => new Set(ask.requiredFieldIds),
    [ask.requiredFieldIds],
  );

  const [values, setValues] = useState<Record<string, string>>(() =>
    entity && record
      ? buildTaskFormValues(entity, record, ask.visibleFieldIds, entities)
      : {},
  );
  const [attachments, setAttachments] = useState<
    Array<{ id: string; fileName: string }>
  >([]);
  const [attachmentName, setAttachmentName] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const files = await fetchAutomationTaskAttachments(task.id);
        if (!cancelled) setAttachments(files);
        if (sessionUser?.id) {
          const open = await fetchOpenAutomationTaskTimeSession(
            task.id,
            sessionUser.id,
          );
          if (!cancelled) setSessionId(open);
        }
      } catch {
        if (!cancelled) {
          setAttachments([]);
          setSessionId(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [task.id, sessionUser?.id]);

  const fields = !entity
    ? []
    : ask.visibleFieldIds
        .map((fieldId) => entity.fields.find((field) => field.id === fieldId))
        .filter((field): field is EntityField => field != null)
        .filter((field) => !isEntityComputedFieldType(field.type));

  const viewFields = !entity
    ? []
    : ask.viewFieldIds
        .map((fieldId) => entity.fields.find((field) => field.id === fieldId))
        .filter((field): field is EntityField => field != null);

  const mergedValues = useMemo(
    () => ({ ...(record?.values ?? {}), ...values }),
    [record?.values, values],
  );

  const title = recordTitle(entity, mergedValues);
  const hasForm =
    fields.length > 0 ||
    viewFields.length > 0 ||
    ask.viewTabIds.length > 0 ||
    ask.requireAttachment;

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

    if (outcome.fieldAccess.requireAttachment && attachments.length === 0) {
      return "Добавьте вложение перед завершением";
    }

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
          Запись ещё не загружена. Обновите страницу или откройте карточку.
        </p>
      ) : hasForm ? (
        <section className="flex flex-col gap-4 rounded-xl border border-border bg-card px-4 py-4 shadow-xs">
          {ask.viewTabIds.length > 0 ? (
            <TaskViewTabsPreview
              entity={entity}
              record={{ ...record, values: mergedValues }}
              tabIds={ask.viewTabIds}
              className="border-border/60 bg-muted/10"
            />
          ) : null}

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
                const parentField = getEntityListParentField(entity, field);
                const parentValue = parentField
                  ? (values[parentField.id] ?? record.values[parentField.id])
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
                const listPresentation = resolveEntityListFieldPresentation(
                  field,
                  entities,
                );
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
        </section>
      ) : (
        <div className="rounded-xl border border-border/70 bg-muted/15 px-4 py-3">
          <p className="text-sm text-muted-foreground">
            Для этого шага нет полей — можно сразу выбрать результат.
          </p>
        </div>
      )}

      <div
        className={cn(
          "rounded-xl border px-3 py-3",
          ask.requireAttachment
            ? "border-border bg-muted/15"
            : "border-border/70",
        )}
      >
        <div className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          <Paperclip className="size-3.5" aria-hidden />
          Вложения
          {ask.requireAttachment ? " · обязательно" : ""}
        </div>
        <ul className="mt-2 flex flex-col gap-1">
          {attachments.map((file) => (
            <li key={file.id} className="text-sm">
              {file.fileName}
            </li>
          ))}
          {attachments.length === 0 ? (
            <li className="text-xs text-muted-foreground">Нет файлов</li>
          ) : null}
        </ul>
        <div className="mt-2 flex gap-2">
          <Input
            className="h-8"
            placeholder="Имя файла"
            value={attachmentName}
            onChange={(event) => setAttachmentName(event.target.value)}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!attachmentName.trim() || busy}
            onClick={() => {
              void (async () => {
                setBusy(true);
                try {
                  const id = await addAutomationTaskAttachment({
                    taskId: task.id,
                    fileName: attachmentName.trim(),
                  });
                  setAttachments((prev) => [
                    ...prev,
                    { id, fileName: attachmentName.trim() },
                  ]);
                  setAttachmentName("");
                } catch (err: unknown) {
                  setError(
                    getAutomationErrorMessage(
                      err,
                      "Не удалось добавить вложение",
                    ),
                  );
                } finally {
                  setBusy(false);
                }
              })();
            }}
          >
            Добавить
          </Button>
        </div>
      </div>

      {error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <footer className="flex flex-col gap-3 border-t border-border/70 pt-4">
        <div className="flex flex-wrap gap-2">
          {task.config.outcomes.map((outcome) => (
            <Button
              key={outcome.id}
              type="button"
              disabled={busy || !record}
              onClick={() => void run(outcome.id)}
            >
              {outcome.label}
            </Button>
          ))}
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
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-muted-foreground"
            disabled={busy || !sessionUser?.id}
            onClick={() => {
              void (async () => {
                if (!sessionUser?.id) return;
                setBusy(true);
                try {
                  if (sessionId) {
                    await stopAutomationTaskTimeSession(sessionId);
                    setSessionId(null);
                  } else {
                    const id = await startAutomationTaskTimeSession({
                      taskId: task.id,
                      userId: sessionUser.id,
                    });
                    setSessionId(id);
                  }
                } catch (err: unknown) {
                  setError(getAutomationErrorMessage(err, "Ошибка таймера"));
                } finally {
                  setBusy(false);
                }
              })();
            }}
          >
            {sessionId ? "Стоп таймер" : "Таймер"}
          </Button>
          {onOpenRecord && record ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-muted-foreground"
              disabled={busy}
              onClick={() => onOpenRecord(task.entityId, task.recordId)}
            >
              Карточка
            </Button>
          ) : null}
        </div>
      </footer>
    </div>
  );
}
