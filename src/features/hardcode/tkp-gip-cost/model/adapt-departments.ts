/**
 * Build ReviewCostBreakdownDepartment[] from «Расчёты отделов» entity records.
 */

import {
  formatEntityListFieldValue,
  getRecordFieldNumber,
  parseEntityTableParentGroupIds,
  resolveEntityTableHierarchyGroupRecord,
  resolveEntityTableParentField,
  resolveRelationRecordLabel,
  type Entity,
  type EntityField,
  type EntityRecord,
  type EntityValueContext,
} from "@/entities/entity";
import {
  getDeptNestedLines,
  resolveDeptCalcTypeLabelForRecord,
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
import { reviewExpenseCategoryFromLabel } from "./expense-category";

function listLabel(
  field: EntityField | null,
  record: EntityRecord,
  entities: readonly Entity[],
): string {
  if (!field || field.type !== "list") return "";
  const formatted = formatEntityListFieldValue(
    field,
    record.values[field.id],
    entities,
  ).trim();
  return formatted === "—" ? "" : formatted;
}

function lineNumber(
  ctx: EntityValueContext,
  entity: Entity,
  record: EntityRecord,
  field: EntityField | null,
): number | null {
  if (!field) return null;
  return getRecordFieldNumber(ctx, entity, record, field);
}

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
    const lines = getDeptNestedLines(ctx, record, nested);
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
        // Base «Стоимость». Tax and coefficient are applied once in the GIP formula.
        const baseCost = lineNumber(ctx, nested.entity, line, lineFields.cost);
        const title = resolveDeptLineTitle(
          ctx,
          nested.entity,
          line,
          lineFields,
        );
        const amount = hoursOrSum.value;
        const categoryLabel = listLabel(lineFields.category, line, entities);
        breakdownLines.push({
          id: line.id,
          title,
          department_id: record.id,
          department_name: departmentName,
          project_stage_name: projectStageName,
          calculation_type: calculationType,
          planned_hours: calculationType === "hours" ? (amount ?? 0) : 0,
          cost: baseCost ?? (calculationType === "hours" ? 0 : (amount ?? 0)),
          expense_category_snapshot:
            reviewExpenseCategoryFromLabel(categoryLabel),
          tax_status_snapshot:
            listLabel(lineFields.taxStatus, line, entities) || null,
          tax_rate_snapshot: lineNumber(
            ctx,
            nested.entity,
            line,
            lineFields.tax,
          ),
          coefficient_snapshot: lineNumber(
            ctx,
            nested.entity,
            line,
            lineFields.coefficient,
          ),
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
