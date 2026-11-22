/**
 * Ensure «ГИП» (+ selected departments) under every stage of «Разбор ТКП».
 */

import {
  registerAfterAutomationTaskCompleteHook,
  registerBeforeAutomationStageSpawnHook,
} from "@/entities/automation/lib/hardcode-hooks";
import "../tkp-review/lib/assert-gip-execution-duration";
import {
  getEntityRecordById,
  collectDeptCalculationRecordsForParent,
  findDeptCalculationUserFields,
  getEntityConfig,
  isDeptCalculationsEntity,
  isTkpAnalysisEntity,
  parseEntityRelationIds,
  updateEntityRecord,
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
    (await getEntityRecordById(
      entities.find((item) => item.id === parentEntity.id),
      parentRecord.id,
    )) ?? parentRecord;

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

function isDeptCalcStageName(name: string): boolean {
  const normalized = name.trim().toLocaleLowerCase("ru").replaceAll("ё", "е");
  return normalized.includes("заполнении отделами");
}

/**
 * Step 6 → «На заполнении отделами»: write stage×department rows (with
 * руководители) before SQL fieldEnter spawns step 7.
 */
registerBeforeAutomationStageSpawnHook(async (args) => {
  const entities = getEntityConfig().entities;
  const parentEntity = entities.find((item) => item.id === args.entityId);
  if (!parentEntity || !isTkpAnalysisEntity(parentEntity)) return;

  const stageField =
    parentEntity.fields.find(
      (field) =>
        field.type === "list" &&
        field.listOptions.some(
          (option) => option.id === args.destinationStageId,
        ),
    ) ?? null;
  const optionName =
    stageField?.listOptions.find(
      (option) => option.id === args.destinationStageId,
    )?.name ?? "";
  if (!isDeptCalcStageName(optionName)) return;

  const groupsField =
    parentEntity.fields.find(
      (field) =>
        field.type === "relationGroups" &&
        Boolean(field.relationGroups?.levels.length),
    ) ?? null;
  if (!groupsField) {
    throw new Error("На разборе ТКП нет поля «Стадия/отделы»");
  }
  const groupsValue = (args.values[groupsField.id] ?? "").trim();
  if (!groupsValue || groupsValue === "[]") {
    throw new Error("Выберите стадии и отделы до перехода к расчёту");
  }

  await updateEntityRecord(parentEntity.id, args.recordId, {
    [groupsField.id]: groupsValue,
  });

  const liveParent =
    (await getEntityRecordById(
      getEntityConfig().entities.find((item) => item.id === parentEntity.id),
      args.recordId,
    )) ?? null;
  const parentRecord: EntityRecord = {
    id: args.recordId,
    values: {
      ...(liveParent?.values ?? {}),
      ...args.values,
      [groupsField.id]: groupsValue,
    },
    authUserId: liveParent?.authUserId ?? null,
    createdBy: liveParent?.createdBy ?? null,
    schemaVersion: liveParent?.schemaVersion ?? 1,
  };

  await maybeEnsureDeptCalculationGipForParent({
    parentEntity,
    parentRecord,
    entities: getEntityConfig().entities,
    triggerOptionId: args.destinationStageId,
    force: true,
  });

  const deptEntity = findDeptCalculationsEntity(getEntityConfig().entities);
  if (!deptEntity) {
    throw new Error("Не настроена сущность «Расчёты отделов»");
  }
  const rows = await collectDeptCalculationRecordsForParent(deptEntity, {
    entity: parentEntity,
    recordId: args.recordId,
  });
  if (rows.length === 0) {
    throw new Error(
      "Не удалось создать строки «Расчёты отделов». Проверьте «Стадия/отделы».",
    );
  }
  const { manager } = findDeptCalculationUserFields(deptEntity);
  if (!manager) return;
  const withoutHead = rows.filter(
    (row) => parseEntityRelationIds(row.values[manager.id]).length === 0,
  );
  if (withoutHead.length > 0) {
    throw new Error(
      "Не у всех отделов есть руководитель. Заполните справочник отделов и ГИП лида — иначе задания расчёта некому выдать.",
    );
  }
});

/** Wire task-complete → ensure ГИП (FSD: feature registers into entity hook). */
registerAfterAutomationTaskCompleteHook(
  async ({ entityId, recordId, values, triggerOptionId }) => {
    const entities = getEntityConfig().entities;
    const parentEntity = entities.find((item) => item.id === entityId) ?? null;
    if (!parentEntity || !isTkpAnalysisEntity(parentEntity)) return;
    const parentRecord =
      (await getEntityRecordById(parentEntity, recordId)) ?? null;
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
