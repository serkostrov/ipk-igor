/**
 * Product hardcode: «Разбор ТКП» → «Расчёты отделов».
 *
 * When nested «Стадии/отделы» includes department «ГИП», руководитель and
 * исполнитель on the calculation come from the parent record’s «ГИП» Users
 * field — not from the department catalog head. The same person is shown in
 * relationGroups extras and used for assignee resolution through that dept.
 */

import {
  getEntityFieldDisplayName,
  getEntityRelationTargetId,
  parseEntityRelationIds,
  serializeEntityRelationIds,
} from "../model/field";
import {
  collectRelationGroupsLeafIds,
  getRelationGroupsLeafEntityId,
  parseEntityRelationGroups,
} from "../model/relation-groups";
import { SYSTEM_USERS_ENTITY_ID } from "../model/system-entities";
import {
  isEntityNameField,
  resolveRelationRecordLabel,
  type Entity,
  type EntityField,
  type EntityRecord,
} from "../model/types";
import {
  formatRecordFieldValue,
  type EntityValueContext,
} from "../model/field-value";

function normalizeName(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("ru")
    .replaceAll("ё", "е");
}

function entityMatches(
  entity: Pick<Entity, "id" | "name" | "namePlural">,
  keys: readonly string[],
): boolean {
  const candidates = [entity.id, entity.name, entity.namePlural]
    .map((value) => value.trim())
    .filter(Boolean);
  return keys.some((key) =>
    candidates.some((value) => normalizeName(value) === normalizeName(key)),
  );
}

/** Exact match or name contains the key (e.g. «Расчёты отделов ТКП»). */
function entityMatchesLoose(
  entity: Pick<Entity, "id" | "name" | "namePlural">,
  keys: readonly string[],
): boolean {
  if (entityMatches(entity, keys)) return true;
  const candidates = [entity.name, entity.namePlural]
    .map((value) => normalizeName(value))
    .filter(Boolean);
  return keys.some((key) => {
    const needle = normalizeName(key);
    return candidates.some((value) => value.includes(needle));
  });
}

/** Exact or «starts with key» (e.g. «Руководитель отдела»). */
function fieldNameMatches(
  field: EntityField,
  keys: readonly string[],
): boolean {
  const name = normalizeName(getEntityFieldDisplayName(field));
  return keys.some((key) => {
    const needle = normalizeName(key);
    return name === needle || name.startsWith(`${needle} `);
  });
}

const TKP_ANALYSIS_KEYS = ["Разбор ТКП", "Разборы ТКП"] as const;
const DEPT_CALC_KEYS = [
  "Расчёты отделов",
  "Расчеты отделов",
  "Расчёт отделов",
  "Расчет отделов",
  "Расчёт отдела",
  "Расчет отдела",
  "Расчёты отдела",
  "Расчеты отдела",
] as const;
const GIP_KEYS = ["ГИП", "Гип"] as const;
const MANAGER_KEYS = ["Руководитель"] as const;
const PERFORMER_KEYS = ["Исполнитель"] as const;

export function isTkpAnalysisEntity(
  entity: Pick<Entity, "id" | "name" | "namePlural">,
): boolean {
  return entityMatches(entity, TKP_ANALYSIS_KEYS);
}

export function isDeptCalculationsEntity(
  entity: Pick<Entity, "id" | "name" | "namePlural">,
): boolean {
  if (entityMatchesLoose(entity, DEPT_CALC_KEYS)) return true;
  const text = normalizeName(`${entity.name} ${entity.namePlural}`);
  return text.includes("отдел") && text.includes("расчет");
}

function departmentRecordLabel(
  departmentEntity: Entity,
  record: EntityRecord,
  entities?: readonly Entity[],
): string {
  const nameField = departmentEntity.fields.find((field) =>
    isEntityNameField(field),
  );
  const fromName = nameField ? (record.values[nameField.id] ?? "").trim() : "";
  if (fromName) return fromName;
  return (
    resolveRelationRecordLabel(departmentEntity, record.id, entities) ?? ""
  );
}

export function isGipDepartmentRecord(
  departmentEntity: Entity,
  record: EntityRecord,
  entities?: readonly Entity[],
): boolean {
  const label = normalizeName(
    departmentRecordLabel(departmentEntity, record, entities),
  );
  if (!label) return false;
  return GIP_KEYS.some((key) => {
    const needle = normalizeName(key);
    return label === needle || label.startsWith(`${needle} `);
  });
}

function isUsersRelationField(field: EntityField): boolean {
  return (
    (field.type === "relation" || field.type === "belonging") &&
    getEntityRelationTargetId(field) === SYSTEM_USERS_ENTITY_ID
  );
}

export function findTkpGipUserField(entity: Entity): EntityField | null {
  return (
    entity.fields.find(
      (field) =>
        isUsersRelationField(field) && fieldNameMatches(field, GIP_KEYS),
    ) ?? null
  );
}

export function findDeptCalculationUserFields(entity: Entity): {
  manager: EntityField | null;
  performer: EntityField | null;
} {
  let manager: EntityField | null = null;
  let performer: EntityField | null = null;
  for (const field of entity.fields) {
    if (!isUsersRelationField(field)) continue;
    if (!manager && fieldNameMatches(field, MANAGER_KEYS)) manager = field;
    if (!performer && fieldNameMatches(field, PERFORMER_KEYS)) {
      performer = field;
    }
  }
  return { manager, performer };
}

export function findDeptCalculationsGroupsField(
  entity: Entity,
): EntityField | null {
  return (
    entity.fields.find(
      (field) =>
        field.type === "relationGroups" &&
        Boolean(field.relationGroups?.levels.length),
    ) ?? null
  );
}

function resolveDepartmentEntity(
  childEntity: Entity,
  entities: readonly Entity[],
): Entity | null {
  const groupsField = findDeptCalculationsGroupsField(childEntity);
  if (!groupsField?.relationGroups) return null;
  const resolveFieldTarget = (entityId: string, fieldId: string) => {
    const host = entities.find((item) => item.id === entityId);
    const source = host?.fields.find((item) => item.id === fieldId);
    return source ? getEntityRelationTargetId(source) : null;
  };
  const departmentEntityId = getRelationGroupsLeafEntityId(
    groupsField.relationGroups,
    resolveFieldTarget,
  );
  return departmentEntityId
    ? (entities.find((item) => item.id === departmentEntityId) ?? null)
    : null;
}

export function childValuesSelectGipDepartment(options: {
  childEntity: Entity;
  childValues: Record<string, string | undefined>;
  entities: readonly Entity[];
}): boolean {
  const { childEntity, childValues, entities } = options;
  if (!isDeptCalculationsEntity(childEntity)) return false;
  const groupsField = findDeptCalculationsGroupsField(childEntity);
  const departmentEntity = resolveDepartmentEntity(childEntity, entities);
  if (!groupsField || !departmentEntity) return false;
  const leafIds = collectRelationGroupsLeafIds(
    parseEntityRelationGroups(childValues[groupsField.id]),
  );
  return leafIds.some((leafId) => {
    const record = departmentEntity.records.find((item) => item.id === leafId);
    return record
      ? isGipDepartmentRecord(departmentEntity, record, entities)
      : false;
  });
}

export type TkpGipDepartmentUsersResult = {
  values: Record<string, string>;
  overriddenFieldIds: string[];
  applied: boolean;
};

export function applyTkpGipDepartmentUsers(options: {
  childEntity: Entity;
  childValues: Record<string, string>;
  entities: readonly Entity[];
  parentEntity: Entity;
  parentRecord: EntityRecord;
  changedFieldId?: string | null;
}): TkpGipDepartmentUsersResult {
  const {
    childEntity,
    childValues,
    entities,
    parentEntity,
    parentRecord,
    changedFieldId = null,
  } = options;

  const empty: TkpGipDepartmentUsersResult = {
    values: childValues,
    overriddenFieldIds: [],
    applied: false,
  };

  if (!isTkpAnalysisEntity(parentEntity)) return empty;
  if (!isDeptCalculationsEntity(childEntity)) return empty;

  const groupsField = findDeptCalculationsGroupsField(childEntity);
  if (!groupsField?.relationGroups) return empty;
  if (changedFieldId != null && changedFieldId !== groupsField.id) {
    return empty;
  }

  const { manager, performer } = findDeptCalculationUserFields(childEntity);
  if (!manager && !performer) return empty;

  const gipField = findTkpGipUserField(parentEntity);
  if (!gipField) return empty;

  const gipUserIds = parseEntityRelationIds(parentRecord.values[gipField.id]);
  if (gipUserIds.length === 0) return empty;

  if (
    !childValuesSelectGipDepartment({
      childEntity,
      childValues,
      entities,
    })
  ) {
    return empty;
  }

  let next = childValues;
  const overriddenFieldIds: string[] = [];

  function assign(fieldId: string, multiple: boolean) {
    const value = multiple
      ? serializeEntityRelationIds(gipUserIds)
      : serializeEntityRelationIds(gipUserIds.slice(0, 1));
    if ((next[fieldId] ?? "") === value) {
      overriddenFieldIds.push(fieldId);
      return;
    }
    if (next === childValues) next = { ...childValues };
    next[fieldId] = value;
    overriddenFieldIds.push(fieldId);
  }

  if (manager) assign(manager.id, manager.relationMultiple === true);
  if (performer) assign(performer.id, performer.relationMultiple === true);

  return {
    values: next,
    overriddenFieldIds,
    applied: true,
  };
}

/**
 * Label extras for a nested department chip: for «ГИП» under «Разбор ТКП»
 * show the parent’s GIP user(s) instead of the catalog head.
 */
export function formatTkpGipDepartmentExtras(options: {
  ctx: EntityValueContext;
  hostEntity: Entity;
  parentEntity: Entity;
  parentRecord: EntityRecord;
  departmentEntity: Entity;
  departmentRecordId: string;
  displayFieldIds: readonly string[];
  defaultExtras: string;
}): string | null {
  const {
    ctx,
    hostEntity,
    parentEntity,
    parentRecord,
    departmentEntity,
    departmentRecordId,
    displayFieldIds,
    defaultExtras,
  } = options;

  if (!isTkpAnalysisEntity(parentEntity)) return null;
  if (!isDeptCalculationsEntity(hostEntity)) return null;

  const record = departmentEntity.records.find(
    (item) => item.id === departmentRecordId,
  );
  if (!record) return null;
  if (!isGipDepartmentRecord(departmentEntity, record, ctx.entities)) {
    return null;
  }

  const gipField = findTkpGipUserField(parentEntity);
  if (!gipField) return null;

  const text = formatRecordFieldValue(
    ctx,
    parentEntity,
    parentRecord,
    gipField,
  ).trim();
  if (!text || text === "—") return defaultExtras || null;

  // Replace manager-like display fields with the parent GIP; keep other extras.
  if (displayFieldIds.length === 0) return text;

  const parts: string[] = [];
  let replacedManager = false;
  for (const fieldId of displayFieldIds) {
    const extraField = departmentEntity.fields.find(
      (item) => item.id === fieldId,
    );
    if (!extraField) continue;
    const isManagerLike =
      isUsersRelationField(extraField) &&
      fieldNameMatches(extraField, [
        ...MANAGER_KEYS,
        ...PERFORMER_KEYS,
        ...GIP_KEYS,
      ]);
    if (isManagerLike) {
      if (!replacedManager) {
        parts.push(text);
        replacedManager = true;
      }
      continue;
    }
    const other = formatRecordFieldValue(
      ctx,
      departmentEntity,
      record,
      extraField,
    );
    if (!other || other === "—") continue;
    parts.push(other);
  }
  if (!replacedManager) parts.unshift(text);
  return parts.join(" · ");
}

/**
 * When resolving assignees through a department record named «ГИП» under
 * «Разбор ТКП», use the parent’s «ГИП» users instead of the catalog manager.
 */
export function resolveTkpGipAssigneeUserIds(options: {
  triggerEntity: Entity;
  triggerValues: Record<string, string | undefined>;
  departmentEntity: Entity;
  departmentRecord: EntityRecord;
  fallbackUserIds: string[];
}): string[] | null {
  const {
    triggerEntity,
    triggerValues,
    departmentEntity,
    departmentRecord,
    fallbackUserIds,
  } = options;
  if (!isTkpAnalysisEntity(triggerEntity)) return null;
  if (!isGipDepartmentRecord(departmentEntity, departmentRecord)) return null;
  const gipField = findTkpGipUserField(triggerEntity);
  if (!gipField) return null;
  const ids = parseEntityRelationIds(triggerValues[gipField.id]);
  if (ids.length === 0) return null;
  void fallbackUserIds;
  return ids;
}
