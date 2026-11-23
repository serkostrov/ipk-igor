/**
 * «Готово» on «Заполнить разбор ТКП» needs a calculation line.
 * «Нет объёмов» stays allowed with an empty table.
 */

import { registerBeforeAutomationTaskCompleteHook } from "@/entities/automation/lib/hardcode-hooks";
import {
  collectDeptCalculationRecordsForParent,
  entityRelationIncludesId,
  filterDeptCalculationRecordsForAssignee,
  getEntityConfig,
  isDeptCalculationsEntity,
  isTkpAnalysisEntity,
  isTkpGipFillingOptionId,
  resolveEditableDeptCalculationRecordIds,
} from "@/entities/entity";
import { resolveDeptCalculationsNestedTarget } from "../model/resolve-nested";

function isNoVolumeOutcome(label: string | null | undefined): boolean {
  const name = (label ?? "")
    .trim()
    .toLocaleLowerCase("ru")
    .replaceAll("ё", "е");
  return name.includes("нет объем");
}

function normalizeTaskName(name: string): string {
  return name.trim().toLocaleLowerCase("ru").replaceAll("ё", "е");
}

export function isDeptCalculationFillTask(options: {
  entityId: string;
  triggerOptionId?: string | null;
  taskName?: string | null;
}): boolean {
  const entities = getEntityConfig().entities;
  const entity = entities.find((item) => item.id === options.entityId) ?? null;
  if (!entity || !isTkpAnalysisEntity(entity)) return false;

  const optionId = options.triggerOptionId?.trim() ?? "";
  if (optionId && isTkpGipFillingOptionId(entity, optionId, entities)) {
    return false;
  }

  const name = normalizeTaskName(options.taskName ?? "");
  return name.includes("заполнить разбор");
}

export function assertDeptCalculationLinesForComplete(options: {
  entityId: string;
  recordId: string;
  triggerOptionId?: string | null;
  taskName?: string | null;
  outcomeLabel?: string | null;
  assigneeUserId?: string | null;
}): void {
  if (
    !isDeptCalculationFillTask({
      entityId: options.entityId,
      triggerOptionId: options.triggerOptionId,
      taskName: options.taskName,
    })
  ) {
    return;
  }
  if (isNoVolumeOutcome(options.outcomeLabel)) return;

  const entities = getEntityConfig().entities;
  const host = entities.find((item) => item.id === options.entityId);
  const dept = entities.find((item) => isDeptCalculationsEntity(item));
  const hostRecord = host?.records.find((item) => item.id === options.recordId);
  if (!host || !dept || !hostRecord) return;

  const linked = collectDeptCalculationRecordsForParent(dept, {
    entity: host,
    recordId: hostRecord.id,
  });
  const leadParent = { entity: host, record: hostRecord };
  const visible = filterDeptCalculationRecordsForAssignee({
    entity: dept,
    records: linked,
    entities,
    assigneeUserId: options.assigneeUserId,
    leadParent,
  });
  const editableIds = resolveEditableDeptCalculationRecordIds({
    entity: dept,
    records: visible,
    entities,
    assigneeUserId: options.assigneeUserId,
    leadParent,
  });
  const scoped = visible.filter((record) => editableIds.has(record.id));
  if (scoped.length === 0) {
    throw new Error(
      "Нет расчёта отдела для этого исполнителя. Проверьте выбор отделов на предыдущем шаге",
    );
  }

  const nested = resolveDeptCalculationsNestedTarget(dept, entities);
  // «Хотя бы одна» среди строк, которые исполнитель может править
  // (у ГИПа несколько стадий — пустая соседняя не блокирует).
  const hasLine =
    nested != null &&
    scoped.some((record) =>
      nested.entity.records.some((child) =>
        entityRelationIncludesId(
          child.values[nested.parentLinkFieldId],
          record.id,
        ),
      ),
    );
  if (!hasLine) {
    throw new Error(
      "Добавьте хотя бы одну строку расчёта перед завершением задания",
    );
  }
}

registerBeforeAutomationTaskCompleteHook((args) => {
  assertDeptCalculationLinesForComplete(args);
});
