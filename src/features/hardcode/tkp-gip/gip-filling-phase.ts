/**
 * Deferred «ГИП» rows: create only on task/stage «На заполнении ГИПа»,
 * never while the user is still picking departments.
 */

import { registerAfterAutomationTaskCompleteHook } from "@/entities/automation/lib/hardcode-hooks";
import {
  getEntityConfig,
  isDeptCalculationsEntity,
  isTkpAnalysisEntity,
  isTkpGipFillingOptionId,
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

function shouldEnsureGipRows(options: {
  parentEntity: Entity;
  parentValues: Record<string, string | undefined>;
  entities: readonly Entity[];
  /** Task / template trigger option — preferred signal for «задание ГИПа». */
  triggerOptionId?: string | null;
  force?: boolean;
}): boolean {
  const { parentEntity, parentValues, entities, triggerOptionId, force } =
    options;
  if (force) return true;
  if (!isTkpAnalysisEntity(parentEntity)) return false;
  const optionId = (triggerOptionId ?? "").trim();
  if (optionId && isTkpGipFillingOptionId(parentEntity, optionId, entities)) {
    return true;
  }
  return isTkpHostOnGipFillingStage(parentEntity, parentValues, entities);
}

/**
 * Create missing stage×ГИП calculation rows for this «Разбор ТКП» parent.
 * Runs only for «На заполнении ГИПа» (host stage and/or task trigger option).
 */
export async function maybeEnsureDeptCalculationGipForParent(options: {
  parentEntity: Entity;
  parentRecord: EntityRecord;
  entities?: readonly Entity[];
  /** Task.triggerOptionId / template option — add ГИП for that assignment. */
  triggerOptionId?: string | null;
  /** Force ensure even if stage name does not match. */
  force?: boolean;
}): Promise<boolean> {
  const {
    parentEntity,
    parentRecord,
    entities = getEntityConfig().entities,
    triggerOptionId = null,
    force = false,
  } = options;
  if (!isTkpAnalysisEntity(parentEntity)) return false;
  if (
    !shouldEnsureGipRows({
      parentEntity,
      parentValues: parentRecord.values,
      entities,
      triggerOptionId,
      force,
    })
  ) {
    return false;
  }

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
    triggerOptionId: toOptionId,
    force: true,
  });
}

/**
 * When opening the «На заполнении ГИПа» task UI — create ГИП rows for every
 * selected stage before the assignee works on related «Расчёты отделов».
 */
export async function maybeEnsureDeptCalculationGipForTask(options: {
  hostEntity: Entity;
  hostRecord: EntityRecord;
  triggerOptionId: string;
  entities?: readonly Entity[];
}): Promise<boolean> {
  const {
    hostEntity,
    hostRecord,
    triggerOptionId,
    entities = getEntityConfig().entities,
  } = options;
  return maybeEnsureDeptCalculationGipForParent({
    parentEntity: hostEntity,
    parentRecord: hostRecord,
    entities,
    triggerOptionId,
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
