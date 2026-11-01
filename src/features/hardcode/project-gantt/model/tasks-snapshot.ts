/**
 * Build a ProjectGanttSnapshot from linked «Задачи» entity_records.
 */

import {
  collectLinkedTabRecordIds,
  collectRecordsLinkedToParent,
  resolveLinkedTabParentLinkFieldId,
} from "@/entities/automation";
import {
  getEntityListOption,
  getEntityRecordTitle,
  getEntityRelationTargetId,
  parseEntityDependencies,
  parseEntityRelationIds,
  resolveEntityListFieldOptions,
  resolveRelationRecordLabel,
  type Entity,
  type EntityDependencyType,
  type EntityRecord,
  type EntityTab,
  type EntityValueContext,
} from "@/entities/entity";
import { extractIsoDate } from "@/shared/lib/business-days";
import {
  PROJECT_GANTT_ACTION_IDS,
  PROJECT_GANTT_LIMITS,
  type ProjectGanttSnapshot,
  type ProjectGanttStage,
  type ProjectGanttWorkItem,
  type ProjectWorkItemDependency,
  type WorkItemDependencyType,
} from "./contracts";
import {
  projectGanttTasksHasScheduleDates,
  resolveProjectGanttTasksFields,
  type ProjectGanttTasksFields,
} from "./tasks-fields";

const DEP_TYPE_TO_WORK: Record<EntityDependencyType, WorkItemDependencyType> = {
  FS: "finish_to_start",
  SS: "start_to_start",
  FF: "finish_to_finish",
  SF: "start_to_finish",
};

export const WORK_DEP_TYPE_TO_ENTITY: Record<
  WorkItemDependencyType,
  EntityDependencyType
> = {
  finish_to_start: "FS",
  start_to_start: "SS",
  finish_to_finish: "FF",
  start_to_finish: "SF",
};

export type ProjectGanttTasksBinding = {
  projectEntity: Entity;
  projectRecord: EntityRecord;
  tasksEntity: Entity;
  parentLinkFieldId: string;
  fields: ProjectGanttTasksFields;
  records: EntityRecord[];
  hasScheduleDates: boolean;
};

function readIso(
  record: EntityRecord,
  fieldId: string | null | undefined,
): string | null {
  if (!fieldId) return null;
  return extractIsoDate(record.values[fieldId]) ?? null;
}

function readNumber(
  record: EntityRecord,
  fieldId: string | null | undefined,
): number | null {
  if (!fieldId) return null;
  const raw = record.values[fieldId]?.trim() ?? "";
  if (!raw) return null;
  const parsed = Number(raw.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function collectTaskRecords(
  projectEntity: Entity,
  projectRecordId: string,
  tasksEntity: Entity,
  tab: EntityTab | null,
): EntityRecord[] {
  let ids: string[] = [];
  if (tab) {
    ids = collectLinkedTabRecordIds({
      tab,
      linkedEntity: tasksEntity,
      parentEntityId: projectEntity.id,
      parentRecordId: projectRecordId,
    });
  }
  if (ids.length === 0) {
    ids = collectRecordsLinkedToParent({
      childEntity: tasksEntity,
      parentEntityId: projectEntity.id,
      parentRecordId: projectRecordId,
      host: projectEntity,
    });
  }
  const byId = new Map(
    tasksEntity.records.map((record) => [record.id, record]),
  );
  return ids
    .map((id) => byId.get(id))
    .filter((record): record is EntityRecord => record != null);
}

export function resolveProjectGanttTasksBinding(input: {
  projectEntity: Entity;
  projectRecord: EntityRecord;
  tasksEntity: Entity;
  tab: EntityTab | null;
}): ProjectGanttTasksBinding | null {
  const parentLinkFieldId =
    (input.tab
      ? resolveLinkedTabParentLinkFieldId(
          input.tab,
          input.tasksEntity,
          input.projectEntity.id,
        )
      : null) ??
    input.tasksEntity.fields.find(
      (field) => getEntityRelationTargetId(field) === input.projectEntity.id,
    )?.id ??
    null;

  if (!parentLinkFieldId) return null;

  const fields = resolveProjectGanttTasksFields(input.tasksEntity);
  const records = collectTaskRecords(
    input.projectEntity,
    input.projectRecord.id,
    input.tasksEntity,
    input.tab,
  );

  return {
    projectEntity: input.projectEntity,
    projectRecord: input.projectRecord,
    tasksEntity: input.tasksEntity,
    parentLinkFieldId,
    fields,
    records,
    hasScheduleDates: projectGanttTasksHasScheduleDates(fields),
  };
}

function buildStages(
  binding: ProjectGanttTasksBinding,
  entities: readonly Entity[],
): {
  stages: ProjectGanttStage[];
  stageIdByRecord: Map<string, string | null>;
} {
  const stageField = binding.fields.stageField;
  const stageIdByRecord = new Map<string, string | null>();
  if (!stageField || stageField.type !== "list") {
    for (const record of binding.records) {
      stageIdByRecord.set(record.id, null);
    }
    return { stages: [], stageIdByRecord };
  }

  const options = resolveEntityListFieldOptions(stageField, entities);
  const used = new Set<string>();
  for (const record of binding.records) {
    const option = getEntityListOption(options, record.values[stageField.id]);
    stageIdByRecord.set(record.id, option?.id ?? null);
    if (option) used.add(option.id);
  }

  const stages: ProjectGanttStage[] = options
    .filter((option) => used.has(option.id))
    .map((option, index) => ({
      id: option.id,
      name: option.name,
      startDate: null,
      endDate: null,
      sortOrder: index,
    }));

  return { stages, stageIdByRecord };
}

function mapWorkItem(
  record: EntityRecord,
  binding: ProjectGanttTasksBinding,
  stageId: string | null,
  rowOrder: number,
  valueContext: EntityValueContext,
  entities: readonly Entity[],
): ProjectGanttWorkItem {
  const { fields, tasksEntity } = binding;
  const title = getEntityRecordTitle(
    valueContext,
    tasksEntity,
    record,
    "",
  ).trim();
  const statusField = fields.statusField;
  const statusOptions = statusField
    ? resolveEntityListFieldOptions(statusField, entities)
    : [];
  const statusOption = statusField
    ? getEntityListOption(statusOptions, record.values[statusField.id])
    : null;
  const isDone = statusOption?.final === true;

  let departmentName: string | null = null;
  let departmentId: string | null = null;
  const deptField = fields.departmentField;
  if (deptField) {
    if (deptField.type === "relation") {
      const targetId = getEntityRelationTargetId(deptField);
      const target = targetId
        ? (entities.find((item) => item.id === targetId) ?? null)
        : null;
      const ids = parseEntityRelationIds(record.values[deptField.id]);
      departmentId = ids[0] ?? null;
      departmentName = resolveRelationRecordLabel(
        target,
        record.values[deptField.id],
        entities,
      );
    } else if (deptField.type === "list") {
      const option = getEntityListOption(
        resolveEntityListFieldOptions(deptField, entities),
        record.values[deptField.id],
      );
      departmentId = option?.id ?? null;
      departmentName = option?.name ?? null;
    }
  }

  return {
    id: record.id,
    stageId,
    rowOrder,
    name: title || "Без названия",
    startDate: readIso(record, fields.startField?.id),
    endDate: readIso(record, fields.endField?.id),
    plannedHours: readNumber(record, fields.hoursField?.id),
    departmentName,
    departmentId,
    assignees: [],
    status: statusOption?.name ?? "—",
    statusColor: statusOption?.color ?? null,
    isDone,
    completionPercent: isDone ? 100 : 0,
  };
}

function mapDependencies(
  binding: ProjectGanttTasksBinding,
  recordIds: Set<string>,
): ProjectWorkItemDependency[] {
  const field = binding.fields.dependenciesField;
  if (!field) return [];
  const deps: ProjectWorkItemDependency[] = [];
  for (const record of binding.records) {
    const parsed = parseEntityDependencies(record.values[field.id]);
    for (const item of parsed) {
      if (!recordIds.has(item.recordId)) continue;
      deps.push({
        id: `${item.recordId}->${record.id}:${item.type}:${item.lag}`,
        projectId: binding.projectRecord.id,
        predecessorWorkItemId: item.recordId,
        successorWorkItemId: record.id,
        dependencyType: DEP_TYPE_TO_WORK[item.type],
        lagBusinessDays: item.lag,
      });
    }
  }
  return deps;
}

export function buildProjectGanttSnapshotFromTasks(input: {
  binding: ProjectGanttTasksBinding;
  valueContext: EntityValueContext;
  entities: readonly Entity[];
  projectTitle: string;
  canEdit: boolean;
  scopeDepartmentId?: string | null;
}): ProjectGanttSnapshot {
  const { binding, valueContext, entities, projectTitle, canEdit } = input;
  const { stages, stageIdByRecord } = buildStages(binding, entities);

  let workItems = binding.records.map((record, index) =>
    mapWorkItem(
      record,
      binding,
      stageIdByRecord.get(record.id) ?? null,
      index,
      valueContext,
      entities,
    ),
  );

  if (input.scopeDepartmentId) {
    const scope = input.scopeDepartmentId;
    workItems = workItems.filter(
      (item) => item.departmentId === scope || item.departmentName === scope,
    );
  }

  const allowed = new Set(workItems.map((item) => item.id));
  const dependencies = mapDependencies(binding, allowed).filter(
    (dep) =>
      allowed.has(dep.predecessorWorkItemId) &&
      allowed.has(dep.successorWorkItemId),
  );

  const actions = canEdit
    ? PROJECT_GANTT_ACTION_IDS.filter(
        (action) => action !== "project_gantt.work_item.reorder",
      )
    : [];

  return {
    availableActions: [...actions],
    project: {
      id: binding.projectRecord.id,
      title: projectTitle || "Проект",
      status: "Задачи проекта",
      startDate: null,
      gip: null,
      manager: null,
      leadingDepartment: null,
    },
    stages: stages.slice(0, PROJECT_GANTT_LIMITS.stages),
    workItems: workItems.slice(0, PROJECT_GANTT_LIMITS.workItems),
    subtasks: [],
    dependencies: dependencies.slice(0, PROJECT_GANTT_LIMITS.dependencies),
    truncated: {
      stages: stages.length > PROJECT_GANTT_LIMITS.stages,
      workItems: workItems.length > PROJECT_GANTT_LIMITS.workItems,
      subtasks: false,
      dependencies: dependencies.length > PROJECT_GANTT_LIMITS.dependencies,
    },
  };
}
