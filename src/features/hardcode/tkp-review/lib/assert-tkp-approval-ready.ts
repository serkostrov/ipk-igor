/**
 * Etalon checks before starting TKP document approval (ТЗ §7 / ТК-14).
 */

import {
  findTkpLeadRelationField,
  getEntityRecordById,
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

export async function assertTkpDocumentApprovalReady(options: {
  entity: Entity;
  record: EntityRecord;
  entities: readonly Entity[];
  revision: TkpPriceRevisionSummary | null | undefined;
}): Promise<void> {
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

  // Lead link is required for approval routing (manager / department head).
  const leadField = findTkpLeadRelationField(entity, entities);
  const leadEntityId = leadField ? getEntityRelationTargetId(leadField) : null;
  const leadId = leadField
    ? parseEntityRelationIds(record.values[leadField.id])[0]
    : null;
  if (!leadField || !leadEntityId || !leadId) {
    throw new Error("У ТКП не указан связанный лид");
  }
  const leadEntity = entities.find((item) => item.id === leadEntityId);
  if (!leadEntity) {
    throw new Error("Сущность лида не найдена");
  }
  const leadRecord = await getEntityRecordById(leadEntity, leadId);
  if (!leadRecord) {
    throw new Error("Связанный лид не найден");
  }
}
