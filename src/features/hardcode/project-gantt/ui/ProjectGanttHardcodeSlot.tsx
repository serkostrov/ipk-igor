import { useCallback, useEffect, useMemo, useState } from "react";
import { ChartGantt } from "lucide-react";
import { useCurrentRole } from "@/entities/access";
import {
  getEntityRecordTitle,
  useCurrentUserRecordId,
  useEntityConfig,
  useEntityValueContext,
  getSystemUserName,
  type Entity,
  type EntityRecord,
} from "@/entities/entity";
import { fetchProjectGanttLifecycle } from "../api/gantt-lifecycle-api";
import { findProjectTasksLinkedEntity } from "../match";
import type {
  ProjectGanttComparison,
  ProjectGanttLifecycle,
} from "../model/contracts";
import {
  buildProjectGanttSnapshotFromTasks,
  resolveProjectGanttTasksBinding,
} from "../model/tasks-snapshot";
import { resolveProjectGanttVisibility } from "../model/visibility";
import { ProjectGanttLifecyclePanel } from "./ProjectGanttLifecyclePanel";
import { ProjectGanttView } from "./ProjectGanttView";

export function ProjectGanttHardcodeSlot({
  entity,
  record,
  readOnly = false,
  onOpenRelation,
}: {
  entity: Entity;
  record: EntityRecord;
  readOnly?: boolean;
  onOpenRelation?: (entityId: string, recordId: string) => void;
}) {
  const role = useCurrentRole();
  const visibility = useMemo(() => resolveProjectGanttVisibility(role), [role]);
  const valueContext = useEntityValueContext();
  const { entities } = useEntityConfig();
  const currentUserRecordId = useCurrentUserRecordId();
  const actorName = useMemo(() => {
    if (!currentUserRecordId) return null;
    return getSystemUserName(entities, currentUserRecordId) || null;
  }, [currentUserRecordId, entities]);

  const projectTitle = useMemo(
    () =>
      getEntityRecordTitle(valueContext, entity, record, "").trim() || "Проект",
    [valueContext, entity, record],
  );

  const canEditSchedule = visibility.canEditSchedule && !readOnly;
  const canManageLifecycle = visibility.canManageLifecycle && !readOnly;

  const tasksLink = useMemo(
    () => findProjectTasksLinkedEntity(entity, entities),
    [entity, entities],
  );

  const binding = useMemo(() => {
    if (!tasksLink) return null;
    // Re-resolve against live entity from the store (records update).
    const liveTasks =
      entities.find((item) => item.id === tasksLink.tasksEntity.id) ??
      tasksLink.tasksEntity;
    return resolveProjectGanttTasksBinding({
      projectEntity: entity,
      projectRecord: record,
      tasksEntity: liveTasks,
      tab: tasksLink.tab,
    });
  }, [tasksLink, entities, entity, record]);

  const comparison = useMemo<ProjectGanttComparison | null>(() => {
    if (!binding) return null;
    return {
      fact: buildProjectGanttSnapshotFromTasks({
        binding,
        valueContext,
        entities,
        projectTitle,
        canEdit: canEditSchedule,
        scopeDepartmentId: visibility.scopeDepartmentId,
      }),
      baseline: null,
    };
  }, [
    binding,
    valueContext,
    entities,
    projectTitle,
    canEditSchedule,
    visibility.scopeDepartmentId,
  ]);

  const [lifecycle, setLifecycle] = useState<ProjectGanttLifecycle | null>(
    null,
  );
  const [lifecycleOpen, setLifecycleOpen] = useState(false);

  const reloadLifecycle = useCallback(async () => {
    try {
      const next = await fetchProjectGanttLifecycle({
        projectEntityId: entity.id,
        projectRecordId: record.id,
        canManageLifecycle,
      });
      setLifecycle(next);
    } catch {
      setLifecycle(null);
    }
  }, [entity.id, record.id, canManageLifecycle]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void reloadLifecycle();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [reloadLifecycle]);

  if (!tasksLink || !binding) {
    return (
      <div className="flex flex-col items-start gap-2 rounded-xl border border-dashed border-border bg-card px-5 py-10">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <ChartGantt className="h-4 w-4 text-muted-foreground" />
          Нет связанной сущности «Задачи»
        </div>
        <p className="max-w-md text-sm text-muted-foreground">
          Добавьте на проект вкладку со связанной сущностью «Задачи» — тогда
          график покажет те же записи, что и на вкладке задач.
        </p>
      </div>
    );
  }

  if (!comparison) return null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-muted/40"
          onClick={() => setLifecycleOpen((open) => !open)}
        >
          <div>
            <p className="text-sm font-medium text-foreground">
              Согласование графика
            </p>
            <p className="text-xs text-muted-foreground">
              {lifecycle?.currentRevision
                ? `Ревизия №${lifecycle.currentRevision.revisionNumber}`
                : "Опционально · можно свернуть"}
            </p>
          </div>
          <span className="text-xs text-muted-foreground">
            {lifecycleOpen ? "Скрыть" : "Показать"}
          </span>
        </button>
        {lifecycleOpen ? (
          <div className="border-t border-border p-3">
            <ProjectGanttLifecyclePanel
              projectEntityId={entity.id}
              projectRecordId={record.id}
              lifecycle={lifecycle}
              snapshot={comparison.fact}
              actorName={actorName}
              canManage={canManageLifecycle}
              onChanged={() => void reloadLifecycle()}
              embedded
            />
          </div>
        ) : null}
      </div>

      <ProjectGanttView
        binding={binding}
        comparison={comparison}
        canEdit={canEditSchedule}
        onOpenRecord={
          onOpenRelation
            ? (taskId) => onOpenRelation(binding.tasksEntity.id, taskId)
            : undefined
        }
      />
    </div>
  );
}
