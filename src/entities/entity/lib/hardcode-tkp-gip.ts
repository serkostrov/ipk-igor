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
  serializeEntityRelationGroups,
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
  return value.trim().toLocaleLowerCase("ru").replaceAll("ё", "е");
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

/**
 * Exact, spaced prefix («Руководитель отдела»), or simple plural
 * («Руководитель» → «Руководители»).
 */
function fieldNameMatches(
  field: EntityField,
  keys: readonly string[],
): boolean {
  const name = normalizeName(getEntityFieldDisplayName(field));
  return keys.some((key) => {
    const needle = normalizeName(key);
    if (!needle) return false;
    if (name === needle || name.startsWith(`${needle} `)) return true;
    if (!name.startsWith(needle) || name.length <= needle.length) return false;
    const suffix = name.slice(needle.length);
    // «и» / «ы» / «а» plurals and short endings only.
    return /^[аеиыя]{1,3}$/i.test(suffix);
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
const MANAGER_KEYS = ["Руководитель", "Руководители"] as const;
const PERFORMER_KEYS = ["Исполнитель", "Исполнители"] as const;

export function isTkpAnalysisEntity(
  entity: Pick<Entity, "id" | "name" | "namePlural">,
): boolean {
  if (entityMatchesLoose(entity, TKP_ANALYSIS_KEYS)) return true;
  const text = normalizeName(`${entity.name} ${entity.namePlural}`);
  return text.includes("разбор") && text.includes("ткп");
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
  const usersMatch = entity.fields.find(
    (field) =>
      isUsersRelationField(field) && fieldNameMatches(field, GIP_KEYS),
  );
  if (usersMatch) return usersMatch;
  // Custom people catalog still named «ГИП».
  return (
    entity.fields.find(
      (field) =>
        (field.type === "relation" || field.type === "belonging") &&
        fieldNameMatches(field, GIP_KEYS),
    ) ?? null
  );
}

/**
 * Lead («Разбор ТКП») whose «ГИП» users override department catalog heads.
 * Prefer explicit softFill parent; else the host itself; else parent link
 * from a «Расчёты отделов» row.
 */
export function resolveTkpGipLeadContext(options: {
  hostEntity: Entity;
  hostRecord: EntityRecord;
  entities: readonly Entity[];
  softFillParent?: { entity: Entity; record: EntityRecord } | null;
}): { entity: Entity; record: EntityRecord } | null {
  const { hostEntity, hostRecord, entities, softFillParent } = options;

  function withLiveValues(
    entity: Entity,
    record: EntityRecord,
  ): { entity: Entity; record: EntityRecord } {
    const live = entity.records.find((item) => item.id === record.id);
    if (!live) return { entity, record };
    return {
      entity,
      record: {
        ...live,
        values: { ...live.values, ...record.values },
      },
    };
  }

  if (softFillParent && isTkpAnalysisEntity(softFillParent.entity)) {
    return withLiveValues(softFillParent.entity, softFillParent.record);
  }

  if (isTkpAnalysisEntity(hostEntity)) {
    return withLiveValues(hostEntity, hostRecord);
  }

  if (!isDeptCalculationsEntity(hostEntity)) return null;

  for (const field of hostEntity.fields) {
    if (field.type !== "relation" && field.type !== "belonging") continue;
    const targetId = getEntityRelationTargetId(field);
    if (!targetId) continue;
    const target = entities.find((item) => item.id === targetId);
    if (!target || !isTkpAnalysisEntity(target)) continue;
    const parentId = parseEntityRelationIds(hostRecord.values[field.id])[0];
    if (!parentId) continue;
    const parentRecord = target.records.find((item) => item.id === parentId);
    if (!parentRecord) continue;
    return withLiveValues(target, parentRecord);
  }

  return null;
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

/** One «Расчёты отделов» row = one stage root × one nested department. */
export type TkpStageDepartmentPair = {
  stageId: string;
  departmentId: string;
};

/**
 * Expand a 2-level relationGroups value into stage×department pairs.
 * Stages without nested departments are skipped.
 */
export function collectTkpStageDepartmentPairs(
  groupsValue: string | undefined,
): TkpStageDepartmentPair[] {
  const roots = parseEntityRelationGroups(groupsValue);
  const pairs: TkpStageDepartmentPair[] = [];
  const seen = new Set<string>();
  for (const root of roots) {
    const stageId = root.id.trim();
    if (!stageId) continue;
    for (const child of root.children) {
      const departmentId = child.id.trim();
      if (!departmentId) continue;
      const key = `${stageId}\0${departmentId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push({ stageId, departmentId });
    }
  }
  return pairs;
}

/**
 * When creating «Расчёты отделов» from «Разбор ТКП», fan out to one child
 * per selected nested department under each stage — not one row with the
 * whole tree (UI would only show the first nested chip, often «ГИП»).
 */
export function resolveDeptCalculationsCreateFanOut(options: {
  triggerEntity: Entity;
  targetEntity: Entity;
  triggerValues: Record<string, string | undefined>;
  /** Mapped / ask values for the child (may already copy the full tree). */
  createValues?: Record<string, string | undefined>;
}): {
  groupsField: EntityField;
  pairs: TkpStageDepartmentPair[];
} | null {
  const { triggerEntity, targetEntity, triggerValues, createValues } = options;
  if (!isTkpAnalysisEntity(triggerEntity)) return null;
  if (!isDeptCalculationsEntity(targetEntity)) return null;

  const groupsField = findDeptCalculationsGroupsField(targetEntity);
  if (!groupsField) return null;

  const triggerGroupsField =
    findDeptCalculationsGroupsField(triggerEntity) ??
    triggerEntity.fields.find(
      (field) =>
        field.type === "relationGroups" &&
        Boolean(field.relationGroups?.levels.length),
    ) ??
    null;

  const sources = [
    createValues?.[groupsField.id],
    triggerGroupsField ? triggerValues[triggerGroupsField.id] : undefined,
  ];

  let pairs: TkpStageDepartmentPair[] = [];
  for (const source of sources) {
    const next = collectTkpStageDepartmentPairs(source);
    if (next.length > 0) {
      pairs = next;
      break;
    }
  }
  if (pairs.length === 0) return null;
  return { groupsField, pairs };
}

/** Encode one stage × one department for a «Расчёты отделов» row. */
export function encodeTkpStageDepartmentPair(
  pair: TkpStageDepartmentPair,
): string {
  const stageId = pair.stageId.trim();
  const departmentId = pair.departmentId.trim();
  if (!stageId || !departmentId) return "";
  return serializeEntityRelationGroups([
    {
      id: stageId,
      children: [{ id: departmentId, children: [] }],
    },
  ]);
}

/** True when a child row is exactly one stage + one nested department. */
export function deptCalculationValuesMatchStagePair(
  groupsValue: string | undefined,
  pair: TkpStageDepartmentPair,
): boolean {
  const roots = parseEntityRelationGroups(groupsValue);
  if (roots.length !== 1) return false;
  const root = roots[0]!;
  if (root.id.trim() !== pair.stageId) return false;
  if (root.children.length !== 1) return false;
  return root.children[0]!.id.trim() === pair.departmentId;
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
 * always show the lead’s «ГИП» user(s), not the catalog department head.
 *
 * Works both when the relationGroups field lives on «Разбор ТКП» itself and
 * when it lives on a child «Расчёты отделов» with softFillParent = lead.
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
  } = options;

  // Lead = softFill parent when child form, or the host itself when
  // «Стадия/отделы» lives on «Разбор ТКП».
  const leadEntity = isTkpAnalysisEntity(parentEntity)
    ? parentEntity
    : isTkpAnalysisEntity(hostEntity)
      ? hostEntity
      : null;
  if (!leadEntity) return null;

  const record = departmentEntity.records.find(
    (item) => item.id === departmentRecordId,
  );
  if (!record) return null;
  if (!isGipDepartmentRecord(departmentEntity, record, ctx.entities)) {
    return null;
  }

  const gipField = findTkpGipUserField(leadEntity);
  if (!gipField) return null;

  // Prefer draft/parent values, fall back to the live lead record in the store.
  const liveLead =
    leadEntity.records.find((item) => item.id === parentRecord.id) ?? null;
  const leadForFormat: EntityRecord = {
    ...parentRecord,
    values: {
      ...(liveLead?.values ?? {}),
      ...parentRecord.values,
    },
  };

  const text = formatRecordFieldValue(
    ctx,
    leadEntity,
    leadForFormat,
    gipField,
  ).trim();
  if (!text || text === "—") {
    // Lead GIP empty — do not fall back to catalog head for «ГИП» chips.
    return "";
  }

  // Replace any Users display field (руководитель / руководители / …)
  // with the lead’s «ГИП»; keep non-user extras as-is.
  if (displayFieldIds.length === 0) return text;

  const parts: string[] = [];
  let replacedUserExtra = false;
  for (const fieldId of displayFieldIds) {
    const extraField = departmentEntity.fields.find(
      (item) => item.id === fieldId,
    );
    if (!extraField) continue;
    if (isUsersRelationField(extraField)) {
      if (!replacedUserExtra) {
        parts.push(text);
        replacedUserExtra = true;
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
  if (!replacedUserExtra) parts.unshift(text);
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
