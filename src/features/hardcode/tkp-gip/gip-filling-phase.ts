/**
 * Deferred «ГИП» rows: create only on process stage «На заполнении ГИПа».
 */

import { registerAfterAutomationTaskCompleteHook } from "@/entities/automation/lib/hardcode-hooks";
import {
  getEntityConfig,
  isDeptCalculationsEntity,
  isTkpAnalysisEntity,
  isTkpGipFillingStageOption,
  isTkpHostOnGipFillingStage,
  type Entity,
  type EntityField,
  type EntityRecord,
} from "@/entities/entity";
import { ensureDeptCalculationGipRows } from "./fan-out-related-persist";

function findDeptCalculationsEntity(
  entities: readonly Entity[],
): Entity | null {
  return entities.find((entity) => isDeptCalculationsEntity(entity)) ?? null;
}

/**
 * Create missing stage×ГИП calculation rows for this «Разбор ТКП» parent
 * when (and only when) the host is on «На заполнении ГИПа».
 */
export async function maybeEnsureDeptCalculationGipForParent(options: {
  parentEntity: Entity;
  parentRecord: EntityRecord;
  entities?: readonly Entity[];
  /** Force ensure even if stage name does not match (e.g. explicit enter). */
  force?: boolean;
}): Promise<void> {
  const {
    parentEntity,
    parentRecord,
    entities = getEntityConfig().entities,
    force = false,
  } = options;
  if (!isTkpAnalysisEntity(parentEntity)) return;
  if (
    !force &&
    !isTkpHostOnGipFillingStage(parentEntity, parentRecord.values, entities)
  ) {
    return;
  }

  const deptEntity = findDeptCalculationsEntity(entities);
  if (!deptEntity) return;

  const liveParent =
    entities
      .find((item) => item.id === parentEntity.id)
      ?.records.find((item) => item.id === parentRecord.id) ?? parentRecord;

  await ensureDeptCalculationGipRows({
    entity: deptEntity,
    records: [],
    entities,
    parentEntity,
    parentRecord: { ...liveParent, values: parentRecord.values },
  });
}

/** After a list-stage change on «Разбор ТКП» — ensure ГИП when entering GIP stage. */
export async function maybeEnsureDeptCalculationGipAfterStageChange(options: {
  entity: Entity;
  record: EntityRecord;
  field: EntityField;
  toOptionId: string;
  entities: readonly Entity[];
}): Promise<void> {
  const { entity, record, field, toOptionId, entities } = options;
  if (!isTkpGipFillingStageOption(entity, field, toOptionId, entities)) {
    return;
  }
  const nextValues = {
    ...record.values,
    [field.id]: toOptionId,
  };
  await maybeEnsureDeptCalculationGipForParent({
    parentEntity: entity,
    parentRecord: { ...record, values: nextValues },
    entities,
    force: true,
  });
}

/** Wire task-complete → ensure ГИП (FSD: feature registers into entity hook). */
registerAfterAutomationTaskCompleteHook(
  async ({ entityId, recordId, values }) => {
    const entities = getEntityConfig().entities;
    const parentEntity = entities.find((item) => item.id === entityId) ?? null;
    if (!parentEntity || !isTkpAnalysisEntity(parentEntity)) return;
    const parentRecord =
      parentEntity.records.find((item) => item.id === recordId) ?? null;
    const record: EntityRecord = parentRecord
      ? { ...parentRecord, values: { ...parentRecord.values, ...values } }
      : {
          id: recordId,
          values,
          authUserId: null,
          createdBy: null,
          schemaVersion: 1,
        };
    await maybeEnsureDeptCalculationGipForParent({
      parentEntity,
      parentRecord: record,
      entities,
    });
  },
);
