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
  parseEntityListValueIds,
  parseEntityRelationIds,
  serializeEntityRelationIds,
} from "../model/field";
import {
  getEntityListOption,
  resolveEntityListFieldOptions,
} from "../model/types";
import {
  collectRelationGroupsLeafIds,
  getRelationGroupsLeafEntityId,
  parseEntityRelationGroups,
  serializeEntityRelationGroups,
} from "../model/relation-groups";
import {
  getSystemUserName,
  SYSTEM_USERS_ENTITY_ID,
} from "../model/system-entities";
import {
  isEntityNameField,
  resolveRelationRecordLabel,
  type Entity,
  type EntityField,
  type EntityRecord,
} from "../model/types";
import {
  formatRecordFieldValue,
  getEntityParentLinkField,
  getRecordFieldIds,
  resolveEntityFieldSource,
  type EntityValueContext,
} from "../model/field-value";
import { findEntityManagerUserField } from "../model/table-hierarchy";

/** Merge draft over live without blanking filled lead fields with "". */
function mergeLeadFieldValues(
  live: Record<string, string> | undefined,
  draft: Record<string, string> | undefined,
): Record<string, string> {
  const next: Record<string, string> = { ...(live ?? {}) };
  for (const [key, value] of Object.entries(draft ?? {})) {
    if (value.trim() === "") continue;
    next[key] = value;
  }
  return next;
}

/**
 * Parent record for soft-fill / GIP chip labels: form edits overlay the
 * stored lead, but empty draft keys do not wipe «ГИП» / other filled fields.
 */
export function buildTkpGipSoftFillParentRecord(
  record: EntityRecord,
  formValues: Record<string, string>,
): EntityRecord {
  const localDraft = Object.fromEntries(
    Object.entries(formValues).filter(([key]) => !key.includes(":")),
  );
  return {
    ...record,
    values: mergeLeadFieldValues(record.values, localDraft),
  };
}

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
/**
 * Process stage «На заполнении ГИПа» — when ГИП rows should appear.
 * Must not match «На заполнении отделами».
 */
const GIP_FILLING_STAGE_MARKERS = ["гип"] as const;
const GIP_FILLING_STAGE_CONTEXT = ["заполн"] as const;
/** Exact «лид» / «лиды» — not «Главный инженер» or other people fields. */
const LEAD_FIELD_KEYS = ["Лид", "Лиды"] as const;
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

/**
 * True for stage option names like «На заполнении ГИПа».
 * False for «На заполнении отделами» (has «заполн» but not «гип»).
 */
export function isTkpGipFillingStageName(name: string): boolean {
  const normalized = normalizeName(name);
  if (!normalized) return false;
  const hasGip = GIP_FILLING_STAGE_MARKERS.some((marker) =>
    normalized.includes(marker),
  );
  if (!hasGip) return false;
  return GIP_FILLING_STAGE_CONTEXT.some((marker) =>
    normalized.includes(marker),
  );
}

/** Resolve list option display name from a raw field value. */
export function resolveEntityListOptionName(
  field: EntityField,
  raw: string | undefined,
  entities: readonly Entity[],
): string {
  const optionId = parseEntityListValueIds(raw ?? "")[0] ?? (raw ?? "").trim();
  if (!optionId) return "";
  const options = resolveEntityListFieldOptions(field, entities);
  const option = getEntityListOption(options, optionId);
  return (option?.name ?? "").trim() || optionId;
}

/**
 * True when any list field on the host is currently on «На заполнении ГИПа».
 */
export function isTkpHostOnGipFillingStage(
  hostEntity: Entity,
  hostValues: Record<string, string | undefined>,
  entities: readonly Entity[],
): boolean {
  if (!isTkpAnalysisEntity(hostEntity)) return false;
  for (const field of hostEntity.fields) {
    if (field.type !== "list") continue;
    const name = resolveEntityListOptionName(
      field,
      hostValues[field.id],
      entities,
    );
    if (isTkpGipFillingStageName(name)) return true;
  }
  return false;
}

/** True when the given list option id/name is the GIP-filling stage. */
export function isTkpGipFillingStageOption(
  hostEntity: Entity,
  field: EntityField,
  optionId: string,
  entities: readonly Entity[],
): boolean {
  if (!isTkpAnalysisEntity(hostEntity) || field.type !== "list") return false;
  const name = resolveEntityListOptionName(field, optionId, entities);
  return isTkpGipFillingStageName(name);
}

/**
 * True when `optionId` is the «На заполнении ГИПа» option on any list field
 * of the TKP host (used for task.triggerOptionId before the record stage moves).
 */
export function isTkpGipFillingOptionId(
  hostEntity: Entity,
  optionId: string,
  entities: readonly Entity[],
): boolean {
  const id = optionId.trim();
  if (!id || !isTkpAnalysisEntity(hostEntity)) return false;
  for (const field of hostEntity.fields) {
    if (field.type !== "list") continue;
    if (isTkpGipFillingStageOption(hostEntity, field, id, entities)) {
      return true;
    }
  }
  // Fallback: raw label stored as the option id / value.
  return isTkpGipFillingStageName(id);
}

/** Current process-stage option id from the first matching list field value. */
export function resolveTkpHostStageOptionId(
  hostEntity: Entity,
  hostValues: Record<string, string | undefined>,
): string {
  if (!isTkpAnalysisEntity(hostEntity)) return "";
  for (const field of hostEntity.fields) {
    if (field.type !== "list") continue;
    const raw = hostValues[field.id];
    const optionId =
      parseEntityListValueIds(raw ?? "")[0] ?? (raw ?? "").trim();
    if (optionId) return optionId;
  }
  return "";
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

/** Catalog id of the department named «ГИП», if present. */
export function findGipDepartmentRecordId(
  departmentEntity: Entity,
  entities?: readonly Entity[],
): string | null {
  for (const record of departmentEntity.records) {
    if (isGipDepartmentRecord(departmentEntity, record, entities)) {
      return record.id;
    }
  }
  return null;
}

function isUsersRelationField(field: EntityField): boolean {
  return (
    (field.type === "relation" || field.type === "belonging") &&
    getEntityRelationTargetId(field) === SYSTEM_USERS_ENTITY_ID
  );
}

/** Department chip extras that should yield to the lead’s «ГИП». */
function isManagerLikeDisplayField(field: EntityField): boolean {
  if (isUsersRelationField(field)) return true;
  if (field.type !== "relation" && field.type !== "belonging") return false;
  return (
    fieldNameMatches(field, MANAGER_KEYS) || fieldNameMatches(field, GIP_KEYS)
  );
}

function entityHasGipUserField(
  entity: Entity,
  entities: readonly Entity[] = [],
): boolean {
  return findTkpGipUserField(entity, entities) != null;
}

export function findTkpGipUserField(
  entity: Entity,
  entities: readonly Entity[] = [],
): EntityField | null {
  const usersMatch = entity.fields.find(
    (field) => isUsersRelationField(field) && fieldNameMatches(field, GIP_KEYS),
  );
  if (usersMatch) return usersMatch;
  // Custom people catalog still named «ГИП».
  const namedRelation = entity.fields.find(
    (field) =>
      (field.type === "relation" || field.type === "belonging") &&
      fieldNameMatches(field, GIP_KEYS),
  );
  if (namedRelation) return namedRelation;

  // Lookup «ГИП» that resolves to a relation (users / people).
  if (entities.length === 0) return null;
  return (
    entity.fields.find((field) => {
      if (field.type !== "lookup" || !fieldNameMatches(field, GIP_KEYS)) {
        return false;
      }
      const source = resolveEntityFieldSource(entity, field, entities);
      return (
        source?.field.type === "relation" || source?.field.type === "belonging"
      );
    }) ?? null
  );
}

/**
 * Relation to the Lead record: field named «лид», or target entity named «лид».
 * Never matches «Главный инженер» / other people fields.
 */
export function findTkpLeadRelationField(
  entity: Entity,
  entities: readonly Entity[] = [],
): EntityField | null {
  const byName = entity.fields.find(
    (field) =>
      (field.type === "relation" || field.type === "belonging") &&
      fieldNameMatches(field, LEAD_FIELD_KEYS),
  );
  if (byName) return byName;

  for (const field of entity.fields) {
    if (field.type !== "relation" && field.type !== "belonging") continue;
    const targetId = getEntityRelationTargetId(field);
    if (!targetId || targetId === SYSTEM_USERS_ENTITY_ID) continue;
    const target = entities.find((item) => item.id === targetId);
    if (!target) continue;
    const label = normalizeName(`${target.name} ${target.namePlural}`);
    if (!label.includes("лид")) continue;
    // Avoid «руководитель» / engineer-like entities named with «лид» substring edge cases.
    if (label.includes("инженер")) continue;
    return field;
  }
  return null;
}

/**
 * People fields on Lead that identify the GIP, in product order:
 * «руководитель» → catalog manager → «ГИП». Never «Главный инженер».
 */
function leadGipPeopleFieldCandidates(
  leadEntity: Entity,
  entities: readonly Entity[],
): EntityField[] {
  const out: EntityField[] = [];
  const seen = new Set<string>();
  const push = (field: EntityField | null | undefined) => {
    if (!field || seen.has(field.id)) return;
    seen.add(field.id);
    out.push(field);
  };
  push(
    leadEntity.fields.find(
      (field) =>
        isUsersRelationField(field) && fieldNameMatches(field, MANAGER_KEYS),
    ),
  );
  push(findEntityManagerUserField(leadEntity));
  push(findTkpGipUserField(leadEntity, entities));
  return out;
}

/**
 * «ГИП» user ids for a TKP host: field «ГИП» on the host, else hop via «лид»
 * to the Lead and read «руководитель» (fallback «ГИП»). Never «Главный инженер».
 */
export function resolveTkpGipUserIdsFromHost(options: {
  hostEntity: Entity;
  hostValues: Record<string, string | undefined>;
  entities: readonly Entity[];
}): string[] {
  const { hostEntity, hostValues, entities } = options;

  const direct = findTkpGipUserField(hostEntity, entities);
  if (direct) {
    const ids = parseEntityRelationIds(hostValues[direct.id]);
    if (ids.length > 0) return ids;
  }

  const leadField = findTkpLeadRelationField(hostEntity, entities);
  if (!leadField) return [];
  const leadEntityId = getEntityRelationTargetId(leadField);
  if (!leadEntityId) return [];
  const leadEntity = entities.find((item) => item.id === leadEntityId);
  if (!leadEntity) return [];
  const leadRecordId = parseEntityRelationIds(hostValues[leadField.id])[0];
  if (!leadRecordId) return [];
  const leadRecord = leadEntity.records.find(
    (item) => item.id === leadRecordId,
  );
  if (!leadRecord) return [];

  // Prefer filled «руководитель»; empty must not block fallback to «ГИП».
  for (const peopleField of leadGipPeopleFieldCandidates(
    leadEntity,
    entities,
  )) {
    const ids = parseEntityRelationIds(leadRecord.values[peopleField.id]);
    if (ids.length > 0) return ids;
  }
  return [];
}

/** Whether `userId` is the lead GIP for this TKP host. */
export function isTkpLeadGipUser(options: {
  hostEntity: Entity;
  hostValues: Record<string, string | undefined>;
  entities: readonly Entity[];
  userId: string | null | undefined;
}): boolean {
  const userId = options.userId?.trim() ?? "";
  if (!userId) return false;
  return resolveTkpGipUserIdsFromHost(options).includes(userId);
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
    if (!live) {
      return {
        entity,
        record: {
          ...record,
          values: mergeLeadFieldValues(undefined, record.values),
        },
      };
    }
    return {
      entity,
      record: {
        ...live,
        values: mergeLeadFieldValues(live.values, record.values),
      },
    };
  }

  // Explicit form parent (related ask / linked child): prefer whenever it
  // looks like the lead — by name or by having a «ГИП» people field.
  if (
    softFillParent &&
    (isTkpAnalysisEntity(softFillParent.entity) ||
      (isDeptCalculationsEntity(hostEntity) &&
        entityHasGipUserField(softFillParent.entity, entities)))
  ) {
    return withLiveValues(softFillParent.entity, softFillParent.record);
  }

  if (
    isTkpAnalysisEntity(hostEntity) ||
    entityHasGipUserField(hostEntity, entities)
  ) {
    return withLiveValues(hostEntity, hostRecord);
  }

  if (!isDeptCalculationsEntity(hostEntity)) return null;

  for (const field of hostEntity.fields) {
    if (field.type !== "relation" && field.type !== "belonging") continue;
    const targetId = getEntityRelationTargetId(field);
    if (!targetId) continue;
    const target = entities.find((item) => item.id === targetId);
    if (
      !target ||
      (!isTkpAnalysisEntity(target) && !entityHasGipUserField(target, entities))
    ) {
      continue;
    }
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
 * Serialize stage→department map as a relationGroups value (stable stage order
 * of first appearance, departments sorted for stable compare).
 */
export function serializeTkpStageDepartmentPairs(
  pairs: readonly TkpStageDepartmentPair[],
): string {
  const byStage = new Map<string, Set<string>>();
  const stageOrder: string[] = [];
  for (const pair of pairs) {
    const stageId = pair.stageId.trim();
    const departmentId = pair.departmentId.trim();
    if (!stageId || !departmentId) continue;
    if (!byStage.has(stageId)) {
      byStage.set(stageId, new Set());
      stageOrder.push(stageId);
    }
    byStage.get(stageId)!.add(departmentId);
  }
  if (byStage.size === 0) return "";
  return serializeEntityRelationGroups(
    stageOrder.map((stageId) => ({
      id: stageId,
      children: [...(byStage.get(stageId) ?? [])]
        .sort()
        .map((id) => ({ id, children: [] })),
    })),
  );
}

/** Union two «Стадия/отделы» trees without dropping pairs from either side. */
export function unionTkpStageDepartmentGroupsValues(
  left: string | undefined,
  right: string | undefined,
): string {
  return serializeTkpStageDepartmentPairs([
    ...collectTkpStageDepartmentPairs(left),
    ...collectTkpStageDepartmentPairs(right),
  ]);
}

/**
 * All «Расчёты отделов» rows that share a parent with any seed id —
 * used when the ask layout only discovered a subset of fan-out siblings.
 *
 * Discovers via child→parent belonging and, when `parent` is passed, also via
 * the parent forward relation (orphans often hang only on that side).
 */
export function collectDeptCalculationSiblingRecords(
  entity: Entity,
  seedIds: readonly string[],
  parent?: {
    entity: Entity;
    recordId: string;
  } | null,
): EntityRecord[] {
  if (!isDeptCalculationsEntity(entity) || seedIds.length === 0) return [];
  const seedSet = new Set(
    seedIds.map((id) => id.trim()).filter((id) => id.length > 0),
  );
  if (seedSet.size === 0) return [];
  const seeds = entity.records.filter((record) => seedSet.has(record.id));
  if (seeds.length === 0) return [];

  const owned = getEntityParentLinkField(entity);
  const linkFields = entity.fields.filter((field) => {
    if (field.type !== "relation" && field.type !== "belonging") return false;
    const targetId = getEntityRelationTargetId(field);
    if (!targetId) return false;
    return (
      field.id === owned?.id ||
      field.type === "belonging" ||
      (entity.parentEntityId != null && targetId === entity.parentEntityId)
    );
  });

  const parentKeys = new Set<string>();
  for (const seed of seeds) {
    for (const field of linkFields) {
      for (const parentId of parseEntityRelationIds(seed.values[field.id])) {
        parentKeys.add(`${field.id}:${parentId}`);
      }
    }
  }
  if (parent?.recordId && parent.entity.id) {
    for (const field of linkFields) {
      if (getEntityRelationTargetId(field) !== parent.entity.id) continue;
      parentKeys.add(`${field.id}:${parent.recordId}`);
    }
  }

  const result: EntityRecord[] = [];
  const seen = new Set<string>();
  const push = (record: EntityRecord) => {
    if (seen.has(record.id)) return;
    seen.add(record.id);
    result.push(record);
  };
  for (const seed of seeds) push(seed);

  if (parentKeys.size > 0) {
    for (const record of entity.records) {
      const linked = linkFields.some((field) =>
        parseEntityRelationIds(record.values[field.id]).some((parentId) =>
          parentKeys.has(`${field.id}:${parentId}`),
        ),
      );
      if (linked) push(record);
    }
  }

  // Parent forward relation may list fan-out children that never got belonging.
  if (parent) {
    const parentRecord =
      parent.entity.records.find((item) => item.id === parent.recordId) ?? null;
    for (const field of parent.entity.fields) {
      if (field.type !== "relation" && field.type !== "dependencies") continue;
      if (getEntityRelationTargetId(field) !== entity.id) continue;
      for (const id of parseEntityRelationIds(
        parentRecord?.values[field.id] ?? "",
      )) {
        const record = entity.records.find((item) => item.id === id);
        if (record) push(record);
      }
    }
  }

  return result;
}

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

/** Stage root ids from «Стадия/отделы», including roots with no departments. */
export function collectTkpStageRootIds(
  groupsValue: string | undefined,
): string[] {
  const roots = parseEntityRelationGroups(groupsValue);
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const root of roots) {
    const stageId = root.id.trim();
    if (!stageId || seen.has(stageId)) continue;
    seen.add(stageId);
    ids.push(stageId);
  }
  return ids;
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
  entities?: readonly Entity[];
  /**
   * When true — also create «ГИП» under every selected stage.
   * Default true: every stage×department fan-out includes «ГИП».
   */
  includeGip?: boolean;
}): {
  groupsField: EntityField;
  pairs: TkpStageDepartmentPair[];
} | null {
  const {
    triggerEntity,
    targetEntity,
    triggerValues,
    createValues,
    entities = [],
    includeGip = true,
  } = options;
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

  // Union mapped + trigger trees so a partial ask/mapping never drops stages.
  const pairByKey = new Map<string, TkpStageDepartmentPair>();
  const stageIds = new Set<string>();
  for (const source of sources) {
    if (!source) continue;
    for (const stageId of collectTkpStageRootIds(source)) {
      stageIds.add(stageId);
    }
    for (const pair of collectTkpStageDepartmentPairs(source)) {
      const key = `${pair.stageId}\0${pair.departmentId}`;
      if (!pairByKey.has(key)) pairByKey.set(key, pair);
    }
  }

  let pairs: TkpStageDepartmentPair[] = [...pairByKey.values()];
  const catalog =
    entities.length > 0 ? entities : [triggerEntity, targetEntity];
  const gipId = findGipDepartmentRecordIdFromHost(targetEntity, catalog);

  if (includeGip) {
    // Empty stage roots (no nested depts yet) still need a «ГИП» row.
    for (const stageId of stageIds) {
      if (pairs.some((pair) => pair.stageId === stageId)) continue;
      pairs.push({ stageId, departmentId: "" });
    }
    if (gipId) {
      pairs = withGipDepartmentPairs(pairs, gipId);
    } else {
      pairs = pairs.filter((pair) => Boolean(pair.departmentId.trim()));
    }
  } else {
    // Department-filling: only explicitly selected departments — never ГИП.
    pairs = pairs.filter((pair) => {
      const departmentId = pair.departmentId.trim();
      if (!departmentId) return false;
      if (gipId && departmentId === gipId) return false;
      return true;
    });
  }
  if (pairs.length === 0) return null;
  return { groupsField, pairs };
}

/** Stage×dept pairs plus «ГИП» under every distinct stage. */
export function withGipDepartmentPairs(
  pairs: readonly TkpStageDepartmentPair[],
  gipDepartmentId: string,
): TkpStageDepartmentPair[] {
  const gipId = gipDepartmentId.trim();
  if (!gipId) {
    return pairs.filter((pair) => Boolean(pair.departmentId.trim()));
  }
  const next: TkpStageDepartmentPair[] = [];
  const seen = new Set<string>();
  const stages = new Set<string>();
  for (const pair of pairs) {
    const stageId = pair.stageId.trim();
    const departmentId = pair.departmentId.trim();
    if (!stageId) continue;
    stages.add(stageId);
    if (!departmentId) continue;
    const key = `${stageId}\0${departmentId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    next.push({ stageId, departmentId });
  }
  for (const stageId of stages) {
    const key = `${stageId}\0${gipId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    next.push({ stageId, departmentId: gipId });
  }
  return next;
}

function findGipDepartmentRecordIdFromHost(
  hostEntity: Entity,
  entities: readonly Entity[],
): string | null {
  const departmentEntity = resolveDepartmentEntity(hostEntity, entities);
  if (!departmentEntity) return null;
  return findGipDepartmentRecordId(departmentEntity, entities);
}

/**
 * Hardcode: every stage root always includes nested department «ГИП».
 * Applies to «Разбор ТКП» / «Расчёты отделов» relationGroups values.
 */
export function ensureTkpGipDepartmentInGroupsValue(options: {
  value: string;
  hostEntity: Entity;
  entities: readonly Entity[];
}): string {
  const { value, hostEntity, entities } = options;
  if (
    !isTkpAnalysisEntity(hostEntity) &&
    !isDeptCalculationsEntity(hostEntity)
  ) {
    return value;
  }
  const gipId = findGipDepartmentRecordIdFromHost(hostEntity, entities);
  if (!gipId) return value;
  const roots = parseEntityRelationGroups(value);
  if (roots.length === 0) return value;
  let changed = false;
  const next = roots.map((root) => {
    if (root.children.some((child) => child.id.trim() === gipId)) {
      return root;
    }
    changed = true;
    return {
      ...root,
      children: [...root.children, { id: gipId, children: [] }],
    };
  });
  return changed ? serializeEntityRelationGroups(next) : value;
}

/**
 * UI-only: hide «ГИП» chips from the nested picker while the stored value
 * still keeps them (see `ensureTkpGipDepartmentInGroupsValue`).
 */
export function stripTkpGipDepartmentFromGroupsValue(options: {
  value: string;
  hostEntity: Entity;
  entities: readonly Entity[];
}): string {
  const { value, hostEntity, entities } = options;
  if (
    !isTkpAnalysisEntity(hostEntity) &&
    !isDeptCalculationsEntity(hostEntity)
  ) {
    return value;
  }
  const gipId = findGipDepartmentRecordIdFromHost(hostEntity, entities);
  if (!gipId) return value;
  const roots = parseEntityRelationGroups(value);
  if (roots.length === 0) return value;
  let changed = false;
  const next = roots.map((root) => {
    const children = root.children.filter((child) => child.id.trim() !== gipId);
    if (children.length === root.children.length) return root;
    changed = true;
    return { ...root, children };
  });
  return changed ? serializeEntityRelationGroups(next) : value;
}

/** Catalog id of «ГИП» for a TKP / dept-calc host, if resolvable. */
export function resolveTkpGipDepartmentRecordId(
  hostEntity: Entity,
  entities: readonly Entity[],
): string | null {
  if (
    !isTkpAnalysisEntity(hostEntity) &&
    !isDeptCalculationsEntity(hostEntity)
  ) {
    return null;
  }
  return findGipDepartmentRecordIdFromHost(hostEntity, entities);
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

/** Leaf department catalog entity for «Расчёты отделов» relationGroups. */
export function resolveDepartmentEntity(
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

  const canResolveGip =
    isTkpAnalysisEntity(parentEntity) ||
    entityHasGipUserField(parentEntity, entities) ||
    findTkpLeadRelationField(parentEntity, entities) != null;
  if (!canResolveGip) return empty;
  if (!isDeptCalculationsEntity(childEntity)) return empty;

  const groupsField = findDeptCalculationsGroupsField(childEntity);
  if (!groupsField?.relationGroups) return empty;
  if (changedFieldId != null && changedFieldId !== groupsField.id) {
    return empty;
  }

  const { manager, performer } = findDeptCalculationUserFields(childEntity);
  if (!manager && !performer) return empty;

  const liveParent =
    parentEntity.records.find((item) => item.id === parentRecord.id) ?? null;
  const parentValues = mergeLeadFieldValues(
    liveParent?.values,
    parentRecord.values,
  );
  const resolvedGipIds = resolveTkpGipUserIdsFromHost({
    hostEntity: parentEntity,
    hostValues: parentValues,
    entities,
  });
  if (resolvedGipIds.length === 0) return empty;

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
      ? serializeEntityRelationIds(resolvedGipIds)
      : serializeEntityRelationIds(resolvedGipIds.slice(0, 1));
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
  const entities = ctx.entities ?? [];

  const record = departmentEntity.records.find(
    (item) => item.id === departmentRecordId,
  );
  if (!record) return null;
  if (!isGipDepartmentRecord(departmentEntity, record, entities)) {
    return null;
  }

  // Lead host = softFill parent when child form, or the host itself when
  // «Стадия/отделы» lives on «Разбор ТКП». «ГИП» may sit on the lead via «лид».
  const leadHost = entityHasGipUserField(parentEntity, entities)
    ? parentEntity
    : findTkpLeadRelationField(parentEntity, entities)
      ? parentEntity
      : entityHasGipUserField(hostEntity, entities)
        ? hostEntity
        : findTkpLeadRelationField(hostEntity, entities)
          ? hostEntity
          : isTkpAnalysisEntity(parentEntity)
            ? parentEntity
            : isTkpAnalysisEntity(hostEntity)
              ? hostEntity
              : null;
  if (!leadHost) return null;

  const liveLead =
    leadHost.records.find((item) => item.id === parentRecord.id) ?? null;
  const hostValues = mergeLeadFieldValues(
    liveLead?.values,
    parentRecord.values,
  );
  const gipIds = resolveTkpGipUserIdsFromHost({
    hostEntity: leadHost,
    hostValues,
    entities,
  });
  // Known «ГИП» department under a lead — never fall back to catalog head.
  let text = gipIds
    .map((id) => getSystemUserName(entities, id)?.trim())
    .filter((name): name is string => Boolean(name))
    .join(", ");
  if (!text) {
    // Fallback: format via direct «ГИП» field when present on the host.
    const gipField = findTkpGipUserField(leadHost, entities);
    if (gipField) {
      const leadForFormat: EntityRecord = {
        ...parentRecord,
        values: hostValues,
      };
      text = formatRecordFieldValue(
        ctx,
        leadHost,
        leadForFormat,
        gipField,
      ).trim();
      if (!text || text === "—") {
        const ids = getRecordFieldIds(ctx, leadHost, leadForFormat, gipField);
        text = ids
          .map((id) => getSystemUserName(entities, id)?.trim())
          .filter((name): name is string => Boolean(name))
          .join(", ");
      }
    }
  }
  if (!text || text === "—") {
    return "";
  }

  // Replace руководитель / ГИП display fields with the lead’s «ГИП»;
  // keep unrelated extras as-is.
  if (displayFieldIds.length === 0) return text;

  const parts: string[] = [];
  let replacedUserExtra = false;
  for (const fieldId of displayFieldIds) {
    const extraField = departmentEntity.fields.find(
      (item) => item.id === fieldId,
    );
    if (!extraField) continue;
    if (isManagerLikeDisplayField(extraField)) {
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
 * When resolving assignees through a department named «ГИП» (catalog) or a
 * «Расчёты отделов» row that selects that department, use the lead’s «ГИП»
 * users instead of the catalog manager.
 */
export function resolveTkpGipAssigneeUserIds(options: {
  triggerEntity: Entity;
  triggerValues: Record<string, string | undefined>;
  triggerRecordId?: string | null;
  departmentEntity: Entity;
  departmentRecord: EntityRecord;
  entities?: readonly Entity[];
  fallbackUserIds: string[];
}): string[] | null {
  const {
    triggerEntity,
    triggerValues,
    triggerRecordId = null,
    departmentEntity,
    departmentRecord,
    entities = [],
    fallbackUserIds,
  } = options;
  const canResolveGip =
    isTkpAnalysisEntity(triggerEntity) ||
    entityHasGipUserField(triggerEntity, entities) ||
    findTkpLeadRelationField(triggerEntity, entities) != null;
  if (!canResolveGip) {
    return null;
  }

  const catalog =
    entities.length > 0 ? entities : [triggerEntity, departmentEntity];
  const isGipCatalog = isGipDepartmentRecord(
    departmentEntity,
    departmentRecord,
    catalog,
  );
  const isGipCalc =
    !isGipCatalog &&
    childValuesSelectGipDepartment({
      childEntity: departmentEntity,
      childValues: departmentRecord.values,
      entities: catalog,
    });
  if (!isGipCatalog && !isGipCalc) return null;

  const live = triggerRecordId
    ? (triggerEntity.records.find((item) => item.id === triggerRecordId) ??
      null)
    : null;
  // Prefer filled live lead values; draft empties must not wipe «ГИП».
  const draft: Record<string, string> = {};
  for (const [key, value] of Object.entries(triggerValues)) {
    if (value == null) continue;
    draft[key] = value;
  }
  const merged = mergeLeadFieldValues(live?.values, draft);
  const ids = resolveTkpGipUserIdsFromHost({
    hostEntity: triggerEntity,
    hostValues: merged,
    entities: catalog,
  });
  if (ids.length === 0) return null;
  void fallbackUserIds;
  return ids;
}

function recordManagerUserIds(
  entity: Entity,
  record: EntityRecord,
  entities: readonly Entity[],
): string[] {
  const { manager, performer } = findDeptCalculationUserFields(entity);
  const ids: string[] = [];
  const seen = new Set<string>();
  const push = (id: string) => {
    if (!id || seen.has(id)) return;
    seen.add(id);
    ids.push(id);
  };
  for (const field of [manager, performer]) {
    if (!field) continue;
    for (const id of parseEntityRelationIds(record.values[field.id])) {
      push(id);
    }
  }
  // Fallback: catalog «Руководитель» of the nested department (assignee path
  // often walks the catalog even when the calc row manager is still empty).
  if (ids.length === 0) {
    const departmentEntity = resolveDepartmentEntity(entity, entities);
    if (departmentEntity) {
      // Prefer literal «Руководитель» over a soft «Менеджер» users match.
      const deptManager =
        departmentEntity.fields.find((field) => {
          if (field.type !== "relation" && field.type !== "belonging") {
            return false;
          }
          if (getEntityRelationTargetId(field) !== SYSTEM_USERS_ENTITY_ID) {
            return false;
          }
          return fieldNameMatches(field, MANAGER_KEYS);
        }) ?? findEntityManagerUserField(departmentEntity);
      if (deptManager) {
        const groupsField = findDeptCalculationsGroupsField(entity);
        for (const pair of collectTkpStageDepartmentPairs(
          groupsField ? record.values[groupsField.id] : undefined,
        )) {
          if (!pair.departmentId.trim()) continue;
          const deptRecord = departmentEntity.records.find(
            (item) => item.id === pair.departmentId,
          );
          if (!deptRecord) continue;
          if (isGipDepartmentRecord(departmentEntity, deptRecord, entities)) {
            continue;
          }
          for (const id of parseEntityRelationIds(
            deptRecord.values[deptManager.id],
          )) {
            push(id);
          }
        }
      }
    }
  }
  return ids;
}

/**
 * Rows visible in a department-fill / GIP-fill task:
 * - department head → their departments across stages (no GIP);
 * - lead GIP → **all** department rows (others read-only in the UI);
 * - no assignee → all non-GIP rows.
 */
export function filterDeptCalculationRecordsForAssignee(options: {
  entity: Entity;
  records: readonly EntityRecord[];
  entities: readonly Entity[];
  assigneeUserId?: string | null;
  /** «Разбор ТКП» / lead host — used to recognise the lead GIP assignee. */
  leadParent?: { entity: Entity; record: EntityRecord } | null;
}): EntityRecord[] {
  const {
    entity,
    records,
    entities,
    assigneeUserId = null,
    leadParent = null,
  } = options;

  const assigneeIsGip =
    Boolean(assigneeUserId) &&
    Boolean(leadParent) &&
    isTkpLeadGipUser({
      hostEntity: leadParent!.entity,
      hostValues: leadParent!.record.values,
      entities,
      userId: assigneeUserId,
    });

  // GIP review task: every department is visible; editability is separate.
  if (assigneeIsGip) return [...records];

  return records.filter((record) => {
    const isGip = childValuesSelectGipDepartment({
      childEntity: entity,
      childValues: record.values,
      entities,
    });
    if (isGip) return false;
    if (!assigneeUserId) return true;
    return recordManagerUserIds(entity, record, entities).includes(
      assigneeUserId,
    );
  });
}

/**
 * Record ids the assignee may edit in the departments table.
 * Lead GIP → only «ГИП» rows; department heads → their visible rows.
 */
export function resolveEditableDeptCalculationRecordIds(options: {
  entity: Entity;
  records: readonly EntityRecord[];
  entities: readonly Entity[];
  assigneeUserId?: string | null;
  leadParent?: { entity: Entity; record: EntityRecord } | null;
}): Set<string> {
  const {
    entity,
    entities,
    assigneeUserId = null,
    leadParent = null,
  } = options;
  const visible = filterDeptCalculationRecordsForAssignee(options);
  const assigneeIsGip =
    Boolean(assigneeUserId) &&
    Boolean(leadParent) &&
    isTkpLeadGipUser({
      hostEntity: leadParent!.entity,
      hostValues: leadParent!.record.values,
      entities,
      userId: assigneeUserId,
    });
  if (!assigneeIsGip) {
    return new Set(visible.map((record) => record.id));
  }
  return new Set(
    visible
      .filter((record) =>
        childValuesSelectGipDepartment({
          childEntity: entity,
          childValues: record.values,
          entities,
        }),
      )
      .map((record) => record.id),
  );
}
