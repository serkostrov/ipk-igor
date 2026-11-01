/**
 * Resolve schedule-related fields on the linked «Задачи» entity.
 * Prefers entity.timeline; falls back to soft Russian field-name matching.
 */

import {
  getEntityFieldDisplayName,
  getEntityTimelineSetup,
  isEntityNameField,
  isEntityNumericFieldType,
  type Entity,
  type EntityField,
} from "@/entities/entity";

export type ProjectGanttTasksFields = {
  nameField: EntityField | null;
  startField: EntityField | null;
  endField: EntityField | null;
  stageField: EntityField | null;
  departmentField: EntityField | null;
  hoursField: EntityField | null;
  statusField: EntityField | null;
  dependenciesField: EntityField | null;
  /** True when start/end came from entity.timeline config. */
  fromTimeline: boolean;
};

function normalizeName(value: string): string {
  return value.trim().toLocaleLowerCase("ru").replaceAll("ё", "е");
}

function fieldName(field: EntityField): string {
  return normalizeName(getEntityFieldDisplayName(field));
}

function findField(
  entity: Entity,
  keys: readonly string[],
  predicate: (field: EntityField) => boolean,
): EntityField | null {
  return (
    entity.fields.find((field) => {
      if (!predicate(field)) return false;
      const name = fieldName(field);
      return keys.some((key) => {
        const needle = normalizeName(key);
        return name === needle || name.includes(needle);
      });
    }) ?? null
  );
}

function findExactField(
  entity: Entity,
  keys: readonly string[],
  predicate: (field: EntityField) => boolean,
): EntityField | null {
  return (
    entity.fields.find((field) => {
      if (!predicate(field)) return false;
      const name = fieldName(field);
      return keys.some((key) => name === normalizeName(key));
    }) ?? null
  );
}

/** Soft-resolve fields used to draw the project gantt from entity tasks. */
export function resolveProjectGanttTasksFields(
  tasksEntity: Entity,
): ProjectGanttTasksFields {
  const timeline = getEntityTimelineSetup(tasksEntity);
  const nameField =
    tasksEntity.fields.find((field) => isEntityNameField(field)) ?? null;

  if (timeline) {
    return {
      nameField,
      startField: timeline.startField,
      endField: timeline.endField,
      stageField:
        findExactField(tasksEntity, ["этап"], (f) => f.type === "list") ??
        (timeline.groupField?.type === "list" ? timeline.groupField : null) ??
        findField(tasksEntity, ["этап"], (f) => f.type === "list"),
      departmentField: findField(
        tasksEntity,
        ["отдел"],
        (f) => f.type === "relation" || f.type === "list",
      ),
      hoursField: findField(
        tasksEntity,
        ["часы (план)", "часы план", "плановые часы", "часы"],
        (f) => isEntityNumericFieldType(f.type),
      ),
      statusField:
        findExactField(tasksEntity, ["статус"], (f) => f.type === "list") ??
        findField(tasksEntity, ["статус"], (f) => f.type === "list"),
      dependenciesField: timeline.dependenciesField,
      fromTimeline: true,
    };
  }

  const datetimeFields = tasksEntity.fields.filter(
    (field) => field.type === "datetime",
  );
  const startField =
    findField(
      tasksEntity,
      [
        "дата начала",
        "начало",
        "старт",
        "план начало",
        "плановое начало",
        "start",
      ],
      (f) => f.type === "datetime",
    ) ??
    datetimeFields[0] ??
    null;
  const endField =
    findField(
      tasksEntity,
      [
        "дата окончания",
        "окончание",
        "конец",
        "срок",
        "срок выполнения",
        "дедлайн",
        "due",
        "deadline",
        "план окончание",
        "плановое окончание",
      ],
      (f) => f.type === "datetime" && f.id !== startField?.id,
    ) ??
    datetimeFields.find((field) => field.id !== startField?.id) ??
    startField;

  return {
    nameField,
    startField,
    endField,
    stageField:
      findExactField(tasksEntity, ["этап"], (f) => f.type === "list") ??
      findField(tasksEntity, ["этап"], (f) => f.type === "list"),
    departmentField: findField(
      tasksEntity,
      ["отдел"],
      (f) => f.type === "relation" || f.type === "list",
    ),
    hoursField: findField(
      tasksEntity,
      ["часы (план)", "часы план", "плановые часы", "часы"],
      (f) => isEntityNumericFieldType(f.type),
    ),
    statusField:
      findExactField(tasksEntity, ["статус"], (f) => f.type === "list") ??
      findField(tasksEntity, ["статус"], (f) => f.type === "list"),
    dependenciesField:
      tasksEntity.fields.find((field) => field.type === "dependencies") ?? null,
    fromTimeline: false,
  };
}

export function projectGanttTasksHasScheduleDates(
  fields: ProjectGanttTasksFields,
): boolean {
  return fields.startField != null || fields.endField != null;
}
