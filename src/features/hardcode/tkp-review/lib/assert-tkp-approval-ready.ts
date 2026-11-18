/**
 * Etalon checks before starting TKP document approval (ТЗ §7 / ТК-14).
 */

import {
  findTkpLeadRelationField,
  getEntityFieldDisplayName,
  getEntityRelationTargetId,
  parseEntityRelationIds,
  type Entity,
  type EntityRecord,
} from "@/entities/entity";
import type { TkpPriceRevisionSummary } from "../../tkp-commercial/model/types";
import {
  findTkpApprovalListField,
  isTkpApprovalInProgress,
  resolveTkpApprovalPendingOptionId,
} from "./tkp-approval";

function normalizeName(value: string): string {
  return value.trim().toLocaleLowerCase("ru").replaceAll("ё", "е");
}

function findCommercialGroupField(entity: Entity): string | null {
  const field = entity.fields.find((item) => {
    const name = normalizeName(getEntityFieldDisplayName(item));
    return (
      name === "коммерческая группа" ||
      name === "коммерческая группа лида" ||
      (name.includes("коммерческ") && name.includes("групп"))
    );
  });
  return field?.id ?? null;
}

function resolveLeadRecord(options: {
  entity: Entity;
  record: EntityRecord;
  entities: readonly Entity[];
}): { leadEntity: Entity; leadRecord: EntityRecord } | null {
  const leadField = findTkpLeadRelationField(options.entity, options.entities);
  if (!leadField) return null;
  const leadEntityId = getEntityRelationTargetId(leadField);
  if (!leadEntityId) return null;
  const leadEntity = options.entities.find((item) => item.id === leadEntityId);
  if (!leadEntity) return null;
  const leadId = parseEntityRelationIds(options.record.values[leadField.id])[0];
  if (!leadId) return null;
  const leadRecord = leadEntity.records.find((item) => item.id === leadId);
  if (!leadRecord) return null;
  return { leadEntity, leadRecord };
}

export function assertTkpDocumentApprovalReady(options: {
  entity: Entity;
  record: EntityRecord;
  entities: readonly Entity[];
  revision: TkpPriceRevisionSummary | null | undefined;
}): void {
  const { entity, record, entities, revision } = options;

  if (!revision) {
    throw new Error("Перед запуском согласования сохраните цену продажи ТКП");
  }
  if (!revision.calculation) {
    throw new Error("Расчёт ГИПа для согласования ТКП не найден");
  }

  if (
    isTkpApprovalInProgress({
      entity,
      values: record.values,
      entities,
    })
  ) {
    throw new Error("Предыдущая версия ТКП ещё находится на согласовании");
  }

  const approvalField = findTkpApprovalListField(entity);
  if (
    !approvalField ||
    !resolveTkpApprovalPendingOptionId(approvalField, entities)
  ) {
    throw new Error(
      "Не настроено поле согласования ТКП (список со стадией «На согласовании»)",
    );
  }

  const hostGroupFieldId = findCommercialGroupField(entity);
  const lead = resolveLeadRecord({ entity, record, entities });
  const leadGroupFieldId = lead
    ? findCommercialGroupField(lead.leadEntity)
    : null;

  const hostGroup = hostGroupFieldId
    ? parseEntityRelationIds(record.values[hostGroupFieldId])[0]
    : null;
  const leadGroup =
    lead && leadGroupFieldId
      ? parseEntityRelationIds(lead.leadRecord.values[leadGroupFieldId])[0]
      : null;

  if (hostGroup && leadGroup && hostGroup !== leadGroup) {
    throw new Error("Коммерческая группа ТКП не настроена");
  }
  if (!hostGroup && !leadGroup) {
    throw new Error("Коммерческая группа ТКП не настроена");
  }
}
