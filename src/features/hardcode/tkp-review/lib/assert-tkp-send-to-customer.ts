/**
 * Validations for fixing TKP send-to-customer (ТЗ §8 / ТК-16).
 */

import {
  findTkpLeadRelationField,
  getEntityFieldDisplayName,
  getEntityRecordById,
  getEntityRelationTargetId,
  parseEntityListValueIds,
  parseEntityRelationIds,
  type Entity,
  type EntityRecord,
} from "@/entities/entity";
import {
  TKP_APPROVAL_REVISION_KEY,
  readTkpApprovalState,
} from "./tkp-approval";

export const TKP_SEND_REVISION_KEY = "__tkp_sent_revision_id__";
export const TKP_SEND_AT_KEY = "__tkp_sent_at__";
export const TKP_SEND_CALL_AT_KEY = "__tkp_next_call_at__";

function normalizeName(value: string): string {
  return value.trim().toLocaleLowerCase("ru").replaceAll("ё", "е");
}

function findFieldByNames(
  entity: Entity,
  names: readonly string[],
): string | null {
  const field = entity.fields.find((item) => {
    const name = normalizeName(getEntityFieldDisplayName(item));
    return names.some((needle) => name === normalizeName(needle));
  });
  return field?.id ?? null;
}

export type TkpSendToCustomerInput = {
  entity: Entity;
  record: EntityRecord;
  entities: readonly Entity[];
  revisionId: string;
  sentAt: string;
  nextCallAt: string;
  /** Soft: all three approvers done for this revision. */
  fullyApproved: boolean;
};

export async function assertTkpSendToCustomer(
  input: TkpSendToCustomerInput,
): Promise<void> {
  if (!input.fullyApproved) {
    throw new Error(
      "Отправку можно зафиксировать только после полного согласования",
    );
  }

  const approval = readTkpApprovalState(input.record.values);
  if (approval.revisionId && approval.revisionId !== input.revisionId.trim()) {
    throw new Error(
      "Отправляется не весь согласованный комплект или файл из другой версии",
    );
  }

  const alreadySent = input.record.values[TKP_SEND_REVISION_KEY]?.trim() ?? "";
  if (alreadySent && alreadySent === input.revisionId.trim()) {
    throw new Error("Отправка этой версии уже зафиксирована");
  }

  const leadField = findTkpLeadRelationField(input.entity, input.entities);
  if (!leadField) {
    throw new Error("У разбора нет связи с лидом");
  }
  const leadEntityId = getEntityRelationTargetId(leadField);
  const leadId = parseEntityRelationIds(input.record.values[leadField.id])[0];
  if (!leadEntityId || !leadId) {
    throw new Error("У разбора нет менеджера / лида");
  }
  const leadEntity = input.entities.find((item) => item.id === leadEntityId);
  const leadRecord = await getEntityRecordById(leadEntity, leadId);
  if (!leadEntity || !leadRecord) {
    throw new Error("У разбора нет менеджера / лида");
  }

  const customerFieldId = findFieldByNames(leadEntity, [
    "Заказчик",
    "Контрагент",
    "Клиент",
  ]);
  if (customerFieldId) {
    const customer = parseEntityRelationIds(
      leadRecord.values[customerFieldId],
    )[0];
    if (!customer) {
      throw new Error("В лиде не указан заказчик");
    }
  }

  const managerFieldId = findFieldByNames(leadEntity, ["Менеджер"]);
  if (managerFieldId) {
    const manager = parseEntityRelationIds(
      leadRecord.values[managerFieldId],
    )[0];
    if (!manager) {
      throw new Error("У разбора нет менеджера");
    }
  }

  const sentMs = Date.parse(input.sentAt);
  const callMs = Date.parse(input.nextCallAt);
  if (!Number.isFinite(sentMs) || !Number.isFinite(callMs)) {
    throw new Error("Укажите дату отправки и дату следующего звонка");
  }
  if (callMs < sentMs) {
    throw new Error("Дата звонка не может быть раньше даты отправки");
  }
}

export function buildTkpSendToCustomerPatch(input: {
  revisionId: string;
  sentAt: string;
  nextCallAt: string;
}): Record<string, string> {
  return {
    [TKP_SEND_REVISION_KEY]: input.revisionId,
    [TKP_SEND_AT_KEY]: input.sentAt,
    [TKP_SEND_CALL_AT_KEY]: input.nextCallAt,
    [TKP_APPROVAL_REVISION_KEY]: input.revisionId,
  };
}

/** Option id for lead stage «ТКП на согласовании у заказчика» if present. */
export function resolveLeadCustomerApprovalOptionId(
  leadEntity: Entity,
  stageFieldId: string,
): string | null {
  const field = leadEntity.fields.find((item) => item.id === stageFieldId);
  if (!field || field.type !== "list") return null;
  const match = field.listOptions?.find((option) => {
    const name = normalizeName(option.name);
    return (
      name.includes("ткп") &&
      name.includes("заказчик") &&
      (name.includes("согласован") || name.includes("отправ"))
    );
  });
  return match?.id ?? null;
}

export function readLeadStageId(
  leadRecord: EntityRecord,
  stageFieldId: string,
): string {
  return (
    parseEntityListValueIds(leadRecord.values[stageFieldId] ?? "")[0] ??
    (leadRecord.values[stageFieldId] ?? "").trim()
  );
}
