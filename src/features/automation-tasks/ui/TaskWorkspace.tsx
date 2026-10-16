import { useEffect, useState } from "react";
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
import { getEntityFieldDisplayName, useEntityConfig } from "@/entities/entity";
import { useSessionUser } from "@/entities/session";

export function TaskWorkspace({
  task,
  onOpenRecord,
  onComplete,
  onReturn,
  onCompleted,
}: {
  task: AutomationTask;
  onOpenRecord?: (entityId: string, recordId: string) => void;
  onComplete: (outcomeId: string) => Promise<void>;
  onReturn: () => Promise<void>;
  onCompleted: () => void;
}) {
  const sessionUser = useSessionUser();
  const { entities } = useEntityConfig();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<
    Array<{ id: string; fileName: string }>
  >([]);
  const [attachmentName, setAttachmentName] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const entity = entities.find((item) => item.id === task.entityId);
  const record = entity?.records.find((item) => item.id === task.recordId);

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

  async function run(outcomeId: string) {
    const outcome = task.config.outcomes.find((item) => item.id === outcomeId);
    if (outcome?.fieldAccess.requireAttachment && attachments.length === 0) {
      setError("Добавьте вложение перед завершением");
      return;
    }
    if (outcome && record) {
      const missing = outcome.fieldAccess.requiredFieldIds.filter(
        (fieldId) => !(record.values[fieldId] ?? "").trim(),
      );
      if (missing.length > 0) {
        const labels = missing.map((fieldId) => {
          const field = entity?.fields.find((item) => item.id === fieldId);
          return field ? getEntityFieldDisplayName(field) : fieldId;
        });
        setError(
          `Заполните в карточке обязательные поля: ${labels.join(", ")}`,
        );
        return;
      }
    }
    setBusy(true);
    setError(null);
    try {
      await onComplete(outcomeId);
      onCompleted();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Ошибка завершения");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{task.name}</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {entity?.name ?? task.entityId} · шаг #{task.stepOrder}
          {task.isBlocking ? " · блокирующая" : ""}
          {task.dueAt
            ? ` · SLA до ${new Date(task.dueAt).toLocaleString("ru")}`
            : ""}
        </p>
      </div>

      {record ? (
        <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
          <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            Запись
          </p>
          <button
            type="button"
            className="mt-1 text-sm font-medium text-primary underline-offset-2 hover:underline"
            onClick={() => onOpenRecord?.(task.entityId, task.recordId)}
          >
            Открыть карточку
          </button>
          {(() => {
            const access = task.config.outcomes[0]?.fieldAccess;
            const visibleIds = access?.visibleFieldIds ?? [];
            const requiredIds = new Set(access?.requiredFieldIds ?? []);
            if (visibleIds.length === 0) {
              return (
                <p className="mt-2 text-xs text-muted-foreground">
                  Заполните нужные поля в карточке, затем нажмите результат.
                </p>
              );
            }
            return (
              <ul className="mt-2 flex flex-col gap-1">
                {visibleIds.map((fieldId) => {
                  const field = entity?.fields.find(
                    (item) => item.id === fieldId,
                  );
                  if (!field) return null;
                  const empty = !(record.values[fieldId] ?? "").trim();
                  return (
                    <li key={fieldId} className="text-xs">
                      <span className="text-muted-foreground">
                        {getEntityFieldDisplayName(field)}
                        {requiredIds.has(fieldId) ? " *" : ""}:{" "}
                      </span>
                      <span
                        className={
                          empty && requiredIds.has(fieldId)
                            ? "text-destructive"
                            : undefined
                        }
                      >
                        {record.values[fieldId] || "не заполнено"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            );
          })()}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Запись не загружена в клиенте (обновите сущности).
        </p>
      )}

      <div className="rounded-lg border border-border/70 px-3 py-2">
        <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          Вложения
        </p>
        <ul className="mt-1 flex flex-col gap-0.5">
          {attachments.map((file) => (
            <li key={file.id} className="text-xs">
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
                    err instanceof Error
                      ? err.message
                      : "Не удалось добавить вложение",
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

      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
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
                setError(err instanceof Error ? err.message : "Ошибка таймера");
              } finally {
                setBusy(false);
              }
            })();
          }}
        >
          {sessionId ? "Стоп таймер" : "Старт таймер"}
        </Button>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="flex flex-wrap gap-2">
        {task.config.outcomes.map((outcome) => (
          <Button
            key={outcome.id}
            type="button"
            disabled={busy}
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
            void onReturn()
              .then(onCompleted)
              .catch((err: unknown) => {
                setError(
                  err instanceof Error ? err.message : "Ошибка возврата",
                );
              })
              .finally(() => setBusy(false));
          }}
        >
          На доработку
        </Button>
      </div>
    </div>
  );
}
