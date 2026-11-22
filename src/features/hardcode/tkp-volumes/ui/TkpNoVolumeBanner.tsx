import { useCallback, useState } from "react";
import { toast } from "sonner";
import { useAsyncValue } from "@/shared/hooks/use-async-value";
import { Button } from "@/shared/ui/button";
import { Textarea } from "@/shared/ui/textarea";
import {
  getEntityRecordById,
  isTkpAnalysisEntity,
  useEntityConfig,
  type Entity,
  type EntityRecord,
} from "@/entities/entity";
import { useSessionUser } from "@/entities/session";
import {
  parseTkpNoVolumeIssues,
  resolveTkpNoVolumeIssue,
  type TkpNoVolumeIssue,
} from "../model/no-volume";

export function TkpNoVolumeBanner({
  entity,
  record,
  readOnly = false,
}: {
  entity: Entity;
  record: EntityRecord;
  readOnly?: boolean;
}) {
  const sessionUser = useSessionUser();
  const { entities } = useEntityConfig();
  const liveValue = useAsyncValue(
    useCallback(async () => {
      const liveEntity = entities.find((item) => item.id === entity.id);
      return (
        (liveEntity
          ? await getEntityRecordById(liveEntity, record.id)
          : null) ?? record
      );
    }, [entities, entity.id, record]),
  );
  const live = liveValue.status === "ready" ? liveValue.value : record;
  const issues = parseTkpNoVolumeIssues(live.values);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, string>>({});

  if (!isTkpAnalysisEntity(entity) || issues.length === 0) return null;

  async function handleHasVolumes(issue: TkpNoVolumeIssue) {
    const comment = (comments[issue.id] ?? "").trim();
    if (!comment) {
      toast.warning("Укажите комментарий");
      return;
    }
    setBusyId(issue.id);
    try {
      await resolveTkpNoVolumeIssue({
        entity,
        record: live,
        issueId: issue.id,
        comment,
        actorUserId: sessionUser?.id ?? null,
      });
      toast.success("Задание снова открыто руководителю отдела");
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "Не удалось открыть задание",
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
      <div>
        <p className="text-sm font-medium">Нужно решение ГИПа по объёмам</p>
        <p className="text-xs text-muted-foreground">
          Отделы сообщили «Нет объёмов». После «Есть объёмы» задание вернётся
          тому же руководителю.
        </p>
      </div>
      {issues.map((issue) => (
        <div
          key={issue.id}
          className="flex flex-col gap-2 rounded-md border border-border/60 bg-background/70 p-2.5"
        >
          <p className="text-sm">
            {issue.departmentLabel || "Отдел"}
            {issue.stageLabel ? ` · ${issue.stageLabel}` : ""}
            {" — "}
            {issue.assigneeName}
          </p>
          <p className="text-xs text-muted-foreground">{issue.taskName}</p>
          {!readOnly ? (
            <>
              <Textarea
                value={comments[issue.id] ?? ""}
                onChange={(event) =>
                  setComments((prev) => ({
                    ...prev,
                    [issue.id]: event.target.value,
                  }))
                }
                placeholder="Комментарий для отдела (обязательно)"
                rows={2}
                className="min-h-16 text-sm"
              />
              <Button
                type="button"
                size="sm"
                disabled={busyId === issue.id}
                onClick={() => void handleHasVolumes(issue)}
              >
                Есть объёмы
              </Button>
            </>
          ) : null}
        </div>
      ))}
    </div>
  );
}
