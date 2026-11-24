/**
 * Step 6: «Срок расчёта» must be ≤ lead «Срок ТКП заказчику» − 1 business day.
 */

import { registerBeforeAutomationTaskCompleteHook } from "@/entities/automation/lib/hardcode-hooks";
import {
  findTkpLeadRelationField,
  getEntityConfig,
  getEntityRecordById,
  getEntityRelationTargetId,
  isTkpAnalysisEntity,
  parseEntityRelationIds,
  type Entity,
  type EntityField,
} from "@/entities/entity";
import { addBusinessDays, extractIsoDate } from "@/shared/lib/business-days";

/** Seed / stand id for TKP «Срок расчёта». */
export const TKP_CALC_DEADLINE_FIELD_ID = "field-tkp-calc-deadline-seed";
/** Lead «Срок ТКП заказчику». */
export const LEAD_CUSTOMER_DEADLINE_FIELD_ID =
  "field-2a24689c-d3ac-41f7-b1b8-6feee69855f6";

function normalizeName(name: string): string {
  return name.trim().toLocaleLowerCase("ru").replaceAll("ё", "е");
}

export function findTkpCalcDeadlineField(entity: Entity): EntityField | null {
  const byId = entity.fields.find(
    (field) => field.id === TKP_CALC_DEADLINE_FIELD_ID,
  );
  if (byId?.type === "datetime") return byId;
  return (
    entity.fields.find((field) => {
      if (field.type !== "datetime") return false;
      const name = normalizeName(field.name);
      return name.includes("срок") && name.includes("расч");
    }) ?? null
  );
}

export function findLeadCustomerDeadlineField(
  entity: Entity,
): EntityField | null {
  const byId = entity.fields.find(
    (field) => field.id === LEAD_CUSTOMER_DEADLINE_FIELD_ID,
  );
  if (byId?.type === "datetime") return byId;
  return (
    entity.fields.find((field) => {
      if (field.type !== "datetime") return false;
      const name = normalizeName(field.name);
      return (
        name.includes("срок") &&
        (name.includes("заказчик") || name.includes("ткп"))
      );
    }) ?? null
  );
}

export function maxTkpCalcDeadlineIso(
  leadDeadlineValue: string,
): string | null {
  const leadDate = extractIsoDate(leadDeadlineValue);
  if (!leadDate) return null;
  return addBusinessDays(leadDate, -1);
}

export async function resolveTkpCalcDeadlineMaxIso(options: {
  entity: Entity;
  values: Record<string, string | undefined>;
  entities: readonly Entity[];
}): Promise<string | null> {
  const { entity, values, entities } = options;
  if (!isTkpAnalysisEntity(entity)) return null;
  if (!findTkpCalcDeadlineField(entity)) return null;

  const leadField = findTkpLeadRelationField(entity, entities);
  const leadEntityId = leadField ? getEntityRelationTargetId(leadField) : null;
  const leadId = leadField
    ? parseEntityRelationIds(values[leadField.id] ?? "")[0]
    : null;
  if (!leadField || !leadEntityId || !leadId) return null;

  const leadEntity = entities.find((item) => item.id === leadEntityId);
  if (!leadEntity) return null;
  const deadlineField = findLeadCustomerDeadlineField(leadEntity);
  if (!deadlineField) return null;

  const leadRecord = await getEntityRecordById(leadEntity, leadId);
  if (!leadRecord) return null;
  return maxTkpCalcDeadlineIso(leadRecord.values[deadlineField.id] ?? "");
}

export async function assertTkpCalcDeadlineForComplete(options: {
  entityId: string;
  recordId: string;
  values: Record<string, string>;
  triggerOptionId?: string | null;
  taskName?: string | null;
}): Promise<void> {
  const entities = getEntityConfig().entities;
  const entity = entities.find((item) => item.id === options.entityId);
  if (!entity || !isTkpAnalysisEntity(entity)) return;

  const calcField = findTkpCalcDeadlineField(entity);
  if (!calcField) return;

  const calcRaw = options.values[calcField.id] ?? "";
  const calcDate = extractIsoDate(calcRaw);
  if (!calcDate) return;

  const maxIso = await resolveTkpCalcDeadlineMaxIso({
    entity,
    values: options.values,
    entities,
  });
  if (!maxIso) return;

  if (calcDate > maxIso) {
    throw new Error(
      `«Срок расчёта» не может быть позже ${maxIso} (срок ТКП заказчику минус 1 рабочий день)`,
    );
  }
}

registerBeforeAutomationTaskCompleteHook((args) =>
  assertTkpCalcDeadlineForComplete(args),
);
