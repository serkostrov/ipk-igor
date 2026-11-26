/**
 * «Готово» on «Заполнить разбор ТКП» needs a calculation line.
 * «Нет объёмов» stays allowed with an empty table.
 */

import { registerBeforeAutomationTaskCompleteHook } from "@/entities/automation/lib/hardcode-hooks";
import {
  collectDeptCalculationRecordsForParent,
  entityRelationIncludesId,
  filterDeptCalculationRecordsForAssignee,
  formatEntityListFieldValue,
  getEntityConfig,
  getEntityRecordById,
  getEntityRecords,
  getEntityValueContext,
  isDeptCalculationsEntity,
  isTkpAnalysisEntity,
  isTkpGipFillingOptionId,
  parseEntityListValueIds,
  resolveEditableDeptCalculationRecordIds,
} from "@/entities/entity";
import { reviewExpenseCategoryFromLabel } from "../../tkp-gip-cost/model/expense-category";
import { resolveDeptCalculationsSubtaskFields } from "../model/fields";
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

export async function assertDeptCalculationLinesForComplete(options: {
  entityId: string;
  recordId: string;
  triggerOptionId?: string | null;
  taskName?: string | null;
  outcomeLabel?: string | null;
  assigneeUserId?: string | null;
}): Promise<void> {
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
  const hostRecord = await getEntityRecordById(host, options.recordId);
  if (!host || !dept || !hostRecord) return;

  const linked = await collectDeptCalculationRecordsForParent(dept, {
    entity: host,
    recordId: hostRecord.id,
  });
  const leadParent = { entity: host, record: hostRecord };
  const visible = await filterDeptCalculationRecordsForAssignee({
    entity: dept,
    records: linked,
    entities,
    assigneeUserId: options.assigneeUserId,
    leadParent,
  });
  const editableIds = await resolveEditableDeptCalculationRecordIds({
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
  const nestedRecords = nested ? await getEntityRecords(nested.entity) : [];
  // «Хотя бы одна» среди строк, которые исполнитель может править
  // (у ГИПа несколько стадий — пустая соседняя не блокирует).
  const scopedLines =
    nested == null
      ? []
      : nestedRecords.filter((child) =>
          scoped.some((record) =>
            entityRelationIncludesId(
              child.values[nested.parentLinkFieldId],
              record.id,
            ),
          ),
        );
  if (scopedLines.length === 0) {
    throw new Error(
      "Добавьте хотя бы одну строку расчёта перед завершением задания",
    );
  }

  if (!nested) return;
  const lineFields = resolveDeptCalculationsSubtaskFields(nested.entity);
  const ctx = getEntityValueContext(entities);
  for (const line of scopedLines) {
    const categoryField = lineFields.category;
    const categoryLabel = categoryField
      ? formatEntityListFieldValue(
          categoryField,
          line.values[categoryField.id],
          ctx.entities,
        ).trim()
      : "";
    const category = reviewExpenseCategoryFromLabel(
      categoryLabel === "—" ? "" : categoryLabel,
    );
    if (!category && lineFields.category) {
      const calcLabel = lineFields.calcType
        ? formatEntityListFieldValue(
            lineFields.calcType,
            line.values[lineFields.calcType.id],
            ctx.entities,
          ).trim()
        : "";
      const isHours = calcLabel.toLocaleLowerCase("ru").includes("час");
      if (!isHours) {
        throw new Error(
          "Укажите категорию расходов для каждой суммы — иначе подрядные блоки попадут в расходы",
        );
      }
    }
    if (category !== "subcontractor") continue;
    const taxStatusId = lineFields.taxStatus
      ? (parseEntityListValueIds(line.values[lineFields.taxStatus.id])[0] ?? "")
      : "";
    if (!taxStatusId) {
      throw new Error(
        "Для подрядных работ укажите налоговый статус (ИП / СЗ / ГПХ / ООО)",
      );
    }
    const taxRaw = lineFields.tax
      ? (line.values[lineFields.tax.id] ?? "").trim()
      : "";
    if (!taxRaw) {
      throw new Error(
        "Для подрядных работ укажите налог, % (ставка к стоимости строки)",
      );
    }
  }
}

registerBeforeAutomationTaskCompleteHook((args) =>
  assertDeptCalculationLinesForComplete(args),
);
