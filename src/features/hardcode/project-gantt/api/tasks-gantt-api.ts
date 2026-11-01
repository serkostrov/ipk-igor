/**
 * Mutate project gantt via entity «Задачи» records (not project_work_items).
 */

import {
  addEntityRecord,
  parseEntityDependencies,
  rescheduleEntityRecord,
  serializeEntityDependencies,
  updateEntityRecord,
  type EntityDependency,
} from "@/entities/entity";
import type { WorkItemDependencyType } from "../model/contracts";
import type { ProjectGanttTasksBinding } from "../model/tasks-snapshot";
import { WORK_DEP_TYPE_TO_ENTITY } from "../model/tasks-snapshot";

export function upsertProjectGanttTaskRecord(input: {
  binding: ProjectGanttTasksBinding;
  name: string;
  stageId: string | null;
  startDate: string | null;
  dueDate: string | null;
  plannedHours: number | null;
  departmentId: string | null;
  workItemId: string | null;
}): string {
  const { binding } = input;
  const { fields, tasksEntity, parentLinkFieldId, projectRecord } = binding;
  const values: Record<string, string> = {
    [parentLinkFieldId]: projectRecord.id,
  };

  if (fields.nameField) {
    values[fields.nameField.id] = input.name;
  }
  if (fields.stageField && input.stageId) {
    values[fields.stageField.id] = input.stageId;
  }
  if (fields.startField && input.startDate) {
    values[fields.startField.id] = input.startDate;
  }
  if (fields.endField && input.dueDate) {
    values[fields.endField.id] = input.dueDate;
  }
  if (fields.hoursField && input.plannedHours != null) {
    values[fields.hoursField.id] = String(input.plannedHours);
  }
  if (fields.departmentField && input.departmentId) {
    values[fields.departmentField.id] = input.departmentId;
  }

  if (input.workItemId) {
    const existing = tasksEntity.records.find(
      (record) => record.id === input.workItemId,
    );
    if (!existing) throw new Error("Задача не найдена");
    const next = { ...existing.values, ...values };

    // Clear dates when emptied in the form.
    if (fields.startField && !input.startDate) {
      next[fields.startField.id] = "";
    }
    if (fields.endField && !input.dueDate) {
      next[fields.endField.id] = "";
    }

    if (
      fields.startField &&
      fields.endField &&
      input.startDate &&
      input.dueDate &&
      fields.fromTimeline
    ) {
      updateEntityRecord(tasksEntity.id, existing.id, next);
      rescheduleEntityRecord(
        tasksEntity.id,
        existing.id,
        input.startDate,
        input.dueDate,
      );
    } else {
      updateEntityRecord(tasksEntity.id, existing.id, next);
    }
    return existing.id;
  }

  const created = addEntityRecord(tasksEntity.id, values);
  return created.id;
}

export function createProjectGanttTaskDependency(input: {
  binding: ProjectGanttTasksBinding;
  predecessorWorkItemId: string;
  successorWorkItemId: string;
  dependencyType: WorkItemDependencyType;
  lagBusinessDays?: number;
}) {
  const field = input.binding.fields.dependenciesField;
  if (!field) throw new Error("У задач нет поля «Предшественники»");

  const successor = input.binding.tasksEntity.records.find(
    (record) => record.id === input.successorWorkItemId,
  );
  if (!successor) throw new Error("Задача-последователь не найдена");

  const current = parseEntityDependencies(successor.values[field.id]);
  if (current.some((item) => item.recordId === input.predecessorWorkItemId)) {
    return;
  }

  const next: EntityDependency[] = [
    ...current,
    {
      recordId: input.predecessorWorkItemId,
      type: WORK_DEP_TYPE_TO_ENTITY[input.dependencyType],
      lag: input.lagBusinessDays ?? 0,
    },
  ];

  updateEntityRecord(input.binding.tasksEntity.id, successor.id, {
    ...successor.values,
    [field.id]: serializeEntityDependencies(next),
  });
}

export function deleteProjectGanttTaskDependency(input: {
  binding: ProjectGanttTasksBinding;
  dependencyId: string;
}) {
  const field = input.binding.fields.dependenciesField;
  if (!field) throw new Error("У задач нет поля «Предшественники»");

  // id format: `${pred}->${succ}:${type}:${lag}`
  const arrow = input.dependencyId.indexOf("->");
  if (arrow < 0) throw new Error("Некорректная зависимость");
  const pred = input.dependencyId.slice(0, arrow);
  const rest = input.dependencyId.slice(arrow + 2);
  const succ = rest.split(":")[0] ?? "";
  if (!pred || !succ) throw new Error("Некорректная зависимость");

  const successor = input.binding.tasksEntity.records.find(
    (record) => record.id === succ,
  );
  if (!successor) return;

  const next = parseEntityDependencies(successor.values[field.id]).filter(
    (item) => item.recordId !== pred,
  );
  updateEntityRecord(input.binding.tasksEntity.id, successor.id, {
    ...successor.values,
    [field.id]: serializeEntityDependencies(next),
  });
}

export function rescheduleProjectGanttTaskRecord(input: {
  binding: ProjectGanttTasksBinding;
  workItemId: string;
  newStartDate: string;
  newEndDate: string;
}) {
  const { binding } = input;
  const { fields, tasksEntity } = binding;
  if (!fields.startField || !fields.endField) {
    throw new Error("У задач нет полей дат начала/окончания");
  }

  if (fields.fromTimeline) {
    rescheduleEntityRecord(
      tasksEntity.id,
      input.workItemId,
      input.newStartDate,
      input.newEndDate,
    );
    return;
  }

  const record = tasksEntity.records.find(
    (item) => item.id === input.workItemId,
  );
  if (!record) throw new Error("Задача не найдена");
  updateEntityRecord(tasksEntity.id, record.id, {
    ...record.values,
    [fields.startField.id]: input.newStartDate,
    [fields.endField.id]: input.newEndDate,
  });
}
