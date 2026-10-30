/**
 * Build ReviewCostBreakdownDepartment[] from «Расчёты отделов» entity records.
 */

import {
  getRecordFieldNumber,
  parseEntityTableParentGroupIds,
  resolveEntityTableHierarchyGroupRecord,
  resolveEntityTableParentField,
  resolveRelationRecordLabel,
  type Entity,
  type EntityRecord,
  type EntityValueContext,
} from "@/entities/entity";
import {
  getDeptNestedLines,
  resolveDeptCalcTypeLabelForRecord,
  resolveDeptLineCost,
  resolveDeptLineHoursOrSum,
  resolveDeptLineTitle,
} from "../../dept-calculations/model/aggregation";
import {
  resolveDeptCalculationsHostFields,
  resolveDeptCalculationsSubtaskFields,
} from "../../dept-calculations/model/fields";
import { resolveDeptCalculationsNestedTarget } from "../../dept-calculations/model/resolve-nested";
import { resolveDeptCalculationDepartmentLabel } from "../../dept-calculations/model/stage-groups";
import type {
  ReviewCostBreakdownDepartment,
  ReviewCostBreakdownLine,
  ReviewLineCalculationType,
} from "./gip-cost";
import { normalizeReviewExpenseCategory } from "./expense-category";

function resolveStageLabel(
  entity: Entity,
  record: EntityRecord,
  entities: readonly Entity[],
): string {
  const parentField = resolveEntityTableParentField(entity);
  if (!parentField) return "Без стадии";
  const id = parseEntityTableParentGroupIds(
    parentField,
    record.values[parentField.id],
  )[0];
  if (!id) return "Без стадии";
  const resolved = resolveEntityTableHierarchyGroupRecord(
    parentField,
    id,
    entities,
    0,
  );
  if (resolved) {
    return (
      resolveRelationRecordLabel(
        resolved.entity,
        resolved.record.id,
        entities,
      )?.trim() || "Без стадии"
    );
  }
  return "Без стадии";
}

function calcTypeToLineType(label: string): ReviewLineCalculationType {
  const name = label.trim().toLocaleLowerCase("ru");
  if (
    name.includes("сумм") ||
    name.includes("фикс") ||
    name.includes("amount")
  ) {
    return "amount";
  }
  return "hours";
}

export function adaptDeptRecordsToGipDepartments(options: {
  ctx: EntityValueContext;
  hostEntity: Entity;
  records: readonly EntityRecord[];
  entities: readonly Entity[];
}): ReviewCostBreakdownDepartment[] {
  const { ctx, hostEntity, records, entities } = options;
  const nested = resolveDeptCalculationsNestedTarget(hostEntity, entities);
  const hostFields = resolveDeptCalculationsHostFields(hostEntity);
  const lineFields = nested
    ? resolveDeptCalculationsSubtaskFields(nested.entity)
    : null;

  return records.map((record) => {
    const departmentName = resolveDeptCalculationDepartmentLabel(
      ctx,
      hostEntity,
      record,
      entities,
    );
    const projectStageName = resolveStageLabel(hostEntity, record, entities);
    const lines = getDeptNestedLines(record, nested);
    const breakdownLines: ReviewCostBreakdownLine[] = [];

    if (nested && lineFields && lines.length > 0) {
      for (const line of lines) {
        const calcLabel = resolveDeptCalcTypeLabelForRecord(
          ctx,
          nested.entity,
          line,
          entities,
          lineFields,
        );
        const calculationType = calcTypeToLineType(calcLabel);
        const hoursOrSum = resolveDeptLineHoursOrSum(
          ctx,
          nested.entity,
          line,
          entities,
          lineFields,
        );
        const cost = resolveDeptLineCost(
          ctx,
          nested.entity,
          line,
          lineFields,
          hoursOrSum.isHours,
        );
        const title = resolveDeptLineTitle(
          ctx,
          nested.entity,
          line,
          lineFields,
        );
        const amount = hoursOrSum.value;
        breakdownLines.push({
          id: line.id,
          title,
          department_id: record.id,
          department_name: departmentName,
          project_stage_name: projectStageName,
          calculation_type: calculationType,
          planned_hours: calculationType === "hours" ? (amount ?? 0) : 0,
          cost:
            calculationType === "hours" ? (cost ?? 0) : (cost ?? amount ?? 0),
          // Already includes template coefficient when «Сумма с коэффициентом».
          expense_category_snapshot:
            calculationType === "amount"
              ? normalizeReviewExpenseCategory("other_without_coefficient")
              : null,
        });
      }
    }

    const laborCost = hostFields.laborCost
      ? getRecordFieldNumber(ctx, hostEntity, record, hostFields.laborCost)
      : null;
    const hours = hostFields.hours
      ? getRecordFieldNumber(ctx, hostEntity, record, hostFields.hours)
      : null;
    const fixedExpenses = hostFields.fixedExpenses
      ? getRecordFieldNumber(ctx, hostEntity, record, hostFields.fixedExpenses)
      : null;

    return {
      department_id: record.id,
      department_name: departmentName,
      project_stage_name: projectStageName,
      planned_hours: hours ?? 0,
      cost: laborCost ?? 0,
      expenses: fixedExpenses ?? 0,
      lines: breakdownLines.length > 0 ? breakdownLines : null,
    };
  });
}
