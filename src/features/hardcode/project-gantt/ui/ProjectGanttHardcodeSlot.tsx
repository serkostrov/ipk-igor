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
import { fetchProjectGanttComparison } from "../api/gantt-api";
import { fetchProjectGanttLifecycle } from "../api/gantt-lifecycle-api";
import type {
  ProjectGanttComparison,
  ProjectGanttLifecycle,
} from "../model/contracts";
import { resolveProjectGanttVisibility } from "../model/visibility";
import { ProjectGanttLifecyclePanel } from "./ProjectGanttLifecyclePanel";
import { ProjectGanttView } from "./ProjectGanttView";

export function ProjectGanttHardcodeSlot({
  entity,
  record,
  readOnly = false,
}: {
  entity: Entity;
  record: EntityRecord;
  readOnly?: boolean;
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

  const [comparison, setComparison] = useState<ProjectGanttComparison | null>(
    null,
  );
  const [lifecycle, setLifecycle] = useState<ProjectGanttLifecycle | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextComparison, nextLifecycle] = await Promise.all([
        fetchProjectGanttComparison({
          projectEntityId: entity.id,
          projectRecordId: record.id,
          projectTitle,
          canEditSchedule,
          scopeDepartmentId: visibility.scopeDepartmentId,
        }),
        fetchProjectGanttLifecycle({
          projectEntityId: entity.id,
          projectRecordId: record.id,
          canManageLifecycle,
        }),
      ]);
      setComparison(nextComparison);
      setLifecycle(nextLifecycle);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Не удалось загрузить график",
      );
    } finally {
      setLoading(false);
    }
  }, [
    entity.id,
    record.id,
    projectTitle,
    canEditSchedule,
    canManageLifecycle,
    visibility.scopeDepartmentId,
  ]);

  useEffect(() => {
    // Defer so we don't call setState synchronously in the effect body.
    const timer = window.setTimeout(() => {
      void reload();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [reload]);

  if (loading && !comparison) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <ChartGantt className="h-4 w-4" />
        Загрузка графика…
      </div>
    );
  }

  if (error && !comparison) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        {error}
      </div>
    );
  }

  if (!comparison) return null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ProjectGanttLifecyclePanel
        projectEntityId={entity.id}
        projectRecordId={record.id}
        lifecycle={lifecycle}
        snapshot={comparison.fact}
        actorName={actorName}
        canManage={canManageLifecycle}
        onChanged={() => void reload()}
      />
      <ProjectGanttView
        projectEntityId={entity.id}
        projectRecordId={record.id}
        comparison={comparison}
        canEdit={canEditSchedule}
        onRefresh={() => void reload()}
      />
    </div>
  );
}
