/**
 * Ensure «ГИП» (+ selected departments) under every stage of «Разбор ТКП».
 */

import { registerAfterAutomationTaskCompleteHook } from "@/entities/automation/lib/hardcode-hooks";
import "../tkp-review/lib/assert-gip-execution-duration";
import {
  getEntityConfig,
  isDeptCalculationsEntity,
  isTkpAnalysisEntity,
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
 * Create missing stage×department + stage×ГИП calculation rows for this
 * «Разбор ТКП» parent.
 */
export async function maybeEnsureDeptCalculationGipForParent(options: {
  parentEntity: Entity;
  parentRecord: EntityRecord;
  entities?: readonly Entity[];
  /** Kept for callers; ensure always runs for TKP analysis hosts. */
  triggerOptionId?: string | null;
  triggerFieldId?: string | null;
  taskName?: string | null;
  force?: boolean;
}): Promise<boolean> {
  const {
    parentEntity,
    parentRecord,
    entities = getEntityConfig().entities,
  } = options;
  if (!isTkpAnalysisEntity(parentEntity)) return false;

  const deptEntity = findDeptCalculationsEntity(entities);
  if (!deptEntity) return false;

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
  return true;
}

/** After a list-stage change on «Разбор ТКП» — ensure ГИП under all stages. */
export async function maybeEnsureDeptCalculationGipAfterStageChange(options: {
  entity: Entity;
  record: EntityRecord;
  field: EntityField;
  toOptionId: string;
  entities: readonly Entity[];
}): Promise<void> {
  const { entity, record, field, toOptionId, entities } = options;
  if (!isTkpAnalysisEntity(entity)) return;
  const nextValues = {
    ...record.values,
    [field.id]: toOptionId,
  };
  await maybeEnsureDeptCalculationGipForParent({
    parentEntity: entity,
    parentRecord: { ...record, values: nextValues },
    entities,
    triggerOptionId: toOptionId,
    triggerFieldId: field.id,
    force: true,
  });
}

/**
 * When opening the «На заполнении ГИПа» task UI — restore selected department
 * rows and create ГИП rows before the assignee works on related asks.
 */
export async function maybeEnsureDeptCalculationGipForTask(options: {
  hostEntity: Entity;
  hostRecord: EntityRecord;
  triggerOptionId: string;
  triggerFieldId?: string | null;
  taskName?: string | null;
  entities?: readonly Entity[];
}): Promise<boolean> {
  const {
    hostEntity,
    hostRecord,
    triggerOptionId,
    triggerFieldId = null,
    taskName = null,
    entities = getEntityConfig().entities,
  } = options;
  return maybeEnsureDeptCalculationGipForParent({
    parentEntity: hostEntity,
    parentRecord: hostRecord,
    entities,
    triggerOptionId,
    triggerFieldId,
    taskName,
  });
}

/** Wire task-complete → ensure ГИП (FSD: feature registers into entity hook). */
registerAfterAutomationTaskCompleteHook(
  async ({ entityId, recordId, values, triggerOptionId }) => {
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
      triggerOptionId,
    });
  },
);
