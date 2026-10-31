import {
  collectRelationGroupsIdsAtDepth,
  collectRelationGroupsLeafIds,
  getCurrentUserRecordId,
  getEntityRelationTargetId,
  getRelationGroupsLeafEntityId,
  getRelationGroupsLevelEntityId,
  isEntityNameField,
  isEntityRelationLikeFieldType,
  isEntityTabWithLinkedEntity,
  parseEntityRelationGroups,
  parseEntityRelationIds,
  resolveEntityLookupTarget,
  resolveRelationRecordLabel,
  serializeEntityRelationGroups,
  serializeEntityRelationIds,
  type Entity,
  type EntityField,
  type EntityFieldType,
  type EntityRelationGroupNode,
} from "@/entities/entity";
import {
  addCalendarDays,
  nowTimeHHmm,
  todayIsoDate,
} from "@/shared/lib/business-days";
import { collectLinkedTabRecordIds } from "../lib/ask-related";

function wantsRelationIds(fieldType: EntityFieldType | undefined) {
  return (
    fieldType === "relation" ||
    fieldType === "belonging" ||
    fieldType === "dependencies"
  );
}

/** Path bridge via a linked-entity tab on the trigger (`tab:{tabId}`). */
export const AUTOMATION_PATH_TAB_PREFIX = "tab:";

export function toAutomationTabPathBridge(tabId: string) {
  const id = tabId.trim();
  return id ? `${AUTOMATION_PATH_TAB_PREFIX}${id}` : "";
}

export function parseAutomationTabPathBridge(bridgeId: string): string | null {
  const raw = bridgeId.trim();
  if (!raw.startsWith(AUTOMATION_PATH_TAB_PREFIX)) return null;
  const tabId = raw.slice(AUTOMATION_PATH_TAB_PREFIX.length).trim();
  return tabId || null;
}

export function isAutomationTabPathBridge(bridgeId: string) {
  return parseAutomationTabPathBridge(bridgeId) != null;
}

function wantsRelationGroupsValue(fieldType: EntityFieldType | undefined) {
  return fieldType === "relationGroups";
}

/** Union relation-groups trees by root/child ids (copy groups → groups). */
function mergeRelationGroupsTrees(
  trees: readonly EntityRelationGroupNode[][],
): EntityRelationGroupNode[] {
  const roots = new Map<string, EntityRelationGroupNode>();
  for (const tree of trees) {
    for (const node of tree) {
      const existing = roots.get(node.id);
      if (!existing) {
        roots.set(node.id, {
          id: node.id,
          children: node.children.map((child) => ({
            id: child.id,
            children: [...child.children],
          })),
        });
        continue;
      }
      const childIds = new Set(existing.children.map((child) => child.id));
      for (const child of node.children) {
        if (childIds.has(child.id)) continue;
        childIds.add(child.id);
        existing.children.push({ id: child.id, children: [...child.children] });
      }
    }
  }
  return [...roots.values()];
}

/** Human label for a trigger record (name field), never a raw id. */
function resolveTriggerRecordLabel(
  options: ResolveAutomationActionValueOptions,
  recordId: string,
): string {
  const entity = options.entities?.find(
    (item) => item.id === options.triggerEntityId,
  );
  if (!entity) return "";
  const label = resolveRelationRecordLabel(entity, recordId)?.trim() ?? "";
  if (!label || label === "Без названия" || label === recordId) return "";
  return label;
}

/**
 * When copying a relation field into text, resolve ids to labels.
 * Relation/dependencies targets keep raw ids.
 */
function resolveCopiedFieldValue(
  sourceFieldId: string,
  rawValue: string,
  options: ResolveAutomationActionValueOptions,
): string {
  if (!rawValue || wantsRelationIds(options.fieldType)) return rawValue;
  const trigger = options.entities?.find(
    (item) => item.id === options.triggerEntityId,
  );
  const sourceField = trigger?.fields.find((item) => item.id === sourceFieldId);
  if (!sourceField || !isEntityRelationLikeFieldType(sourceField.type)) {
    return rawValue;
  }
  const targetId = getEntityRelationTargetId(sourceField);
  const target = targetId
    ? (options.entities?.find((item) => item.id === targetId) ?? null)
    : null;
  const label = resolveRelationRecordLabel(target, rawValue)?.trim() ?? "";
  if (!label || label === "Без названия") return "";
  return label;
}

/** Nested relation → text: resolve the nested field if it stores relation ids. */
function resolveNestedFieldDisplayValue(
  relatedEntity: Entity,
  nestedFieldId: string,
  rawValue: string,
  options: ResolveAutomationActionValueOptions,
): string {
  if (!rawValue || wantsRelationIds(options.fieldType)) return rawValue;
  const nestedField = relatedEntity.fields.find(
    (item) => item.id === nestedFieldId,
  );
  if (nestedField && isEntityRelationLikeFieldType(nestedField.type)) {
    const targetId = getEntityRelationTargetId(nestedField);
    const target = targetId
      ? (options.entities?.find((item) => item.id === targetId) ?? null)
      : null;
    const label = resolveRelationRecordLabel(target, rawValue)?.trim() ?? "";
    if (!label || label === "Без названия") return "";
    return label;
  }
  if (isEntityNameField(nestedField ?? { locked: false })) {
    const trimmed = rawValue.trim();
    if (trimmed.startsWith("record-")) return "";
  }
  return rawValue;
}

/** Dynamic tokens stored in `setField.value` / mappings — resolved at runtime. */
export const AUTOMATION_VALUE_TODAY = "__today__";
export const AUTOMATION_VALUE_TOMORROW = "__tomorrow__";
export const AUTOMATION_VALUE_NOW = "__now__";
export const AUTOMATION_VALUE_TIME_NOW = "__timeNow__";
export const AUTOMATION_VALUE_CURRENT_USER = "__currentUser__";
/** Trigger record of the running automation (link from createRecord mappings). */
export const AUTOMATION_VALUE_CURRENT_RECORD = "__currentRecord__";

/**
 * Nested path segment meaning «the related record itself» (its id),
 * not a field on that record — e.g. `{{stages@1.__record__}}` → department ids.
 */
export const AUTOMATION_PATH_RELATED_RECORD = "__record__";

export function isAutomationPathRelatedRecord(fieldId: string) {
  return fieldId.trim() === AUTOMATION_PATH_RELATED_RECORD;
}

/** `{{fieldId}}` — value from a field on the same record. */
export function isAutomationFieldRef(value: string) {
  return /^\{\{[^.}]+\}\}$/.test(value.trim());
}

/**
 * `{{relationFieldId.nestedFieldId}}` — related record field.
 * `{{groupsFieldId@depth.nestedFieldId}}` — relationGroups at level depth
 * (0 = «Строки», 1 = «Вложенные»). Omit `@depth` → leaf level.
 * Nested id may be {@link AUTOMATION_PATH_RELATED_RECORD} for the record itself.
 */
export function isAutomationEntityPathRef(value: string) {
  return /^\{\{[^.@}]+(?:@\d+)?\.[^}]+\}\}$/.test(value.trim());
}

export function parseAutomationFieldRef(value: string): string | null {
  const match = value.trim().match(/^\{\{([^.}]+)\}\}$/);
  return match?.[1]?.trim() || null;
}

export type AutomationEntityPathRef = {
  relationFieldId: string;
  fieldId: string;
  /** Level index for relationGroups; undefined = leaf. */
  relationGroupsDepth?: number;
};

export function parseAutomationEntityPathRef(
  value: string,
): AutomationEntityPathRef | null {
  const match = value.trim().match(/^\{\{([^.@}]+)(?:@(\d+))?\.([^}]+)\}\}$/);
  if (!match) return null;
  const relationFieldId = match[1]?.trim() ?? "";
  const fieldId = match[3]?.trim() ?? "";
  if (!relationFieldId || !fieldId) return null;
  const depthRaw = match[2];
  const relationGroupsDepth =
    depthRaw != null && depthRaw !== ""
      ? Number.parseInt(depthRaw, 10)
      : undefined;
  return {
    relationFieldId,
    fieldId,
    ...(relationGroupsDepth != null && Number.isFinite(relationGroupsDepth)
      ? { relationGroupsDepth }
      : {}),
  };
}

export function toAutomationFieldRef(fieldId: string) {
  return fieldId ? `{{${fieldId}}}` : "";
}

export function toAutomationEntityPathRef(
  relationFieldId: string,
  fieldId: string,
  relationGroupsDepth?: number,
) {
  if (!relationFieldId || !fieldId) return "";
  if (relationGroupsDepth != null && Number.isFinite(relationGroupsDepth)) {
    return `{{${relationFieldId}@${relationGroupsDepth}.${fieldId}}}`;
  }
  return `{{${relationFieldId}.${fieldId}}}`;
}

function resolveFieldTargetAmongEntities(
  entities: Entity[],
  entityId: string,
  fieldId: string,
): string | null {
  const host = entities.find((item) => item.id === entityId);
  const source = host?.fields.find((item) => item.id === fieldId);
  return source ? getEntityRelationTargetId(source) : null;
}

/**
 * Lookup whose target is a `relationGroups` field — hop through it like a
 * groups bridge (`{{lookup@depth.nestedField}}`).
 */
export function automationLookupRelationGroupsField(
  host: Pick<Entity, "id" | "fields">,
  field: EntityField,
  entities: readonly Entity[],
): EntityField | null {
  if (field.type !== "lookup") return null;
  const target = resolveEntityLookupTarget(host, field, entities);
  return target?.field.type === "relationGroups" ? target.field : null;
}

/** Entity id for a relation / belonging / relationGroups / lookup→groups hop. */
export function automationBridgeTargetEntityId(
  field: EntityField,
  entities: Entity[],
  relationGroupsDepth?: number,
  host?: Pick<Entity, "id" | "fields"> | null,
): string | null {
  if (isEntityRelationLikeFieldType(field.type)) {
    return getEntityRelationTargetId(field);
  }
  if (field.type === "lookup" && host) {
    const groupsField = automationLookupRelationGroupsField(
      host,
      field,
      entities,
    );
    if (groupsField) {
      return automationBridgeTargetEntityId(
        groupsField,
        entities,
        relationGroupsDepth,
      );
    }
    return null;
  }
  if (field.type !== "relationGroups" || !field.relationGroups) return null;
  const resolve = (entityId: string, fieldId: string) =>
    resolveFieldTargetAmongEntities(entities, entityId, fieldId);
  if (relationGroupsDepth != null && Number.isFinite(relationGroupsDepth)) {
    let previous: string | null = null;
    let atDepth: string | null = null;
    for (let i = 0; i <= relationGroupsDepth; i++) {
      const level = field.relationGroups.levels[i];
      if (!level) return null;
      atDepth = getRelationGroupsLevelEntityId(level, previous, resolve);
      if (!atDepth) return null;
      previous = atDepth;
    }
    return atDepth;
  }
  return getRelationGroupsLeafEntityId(field.relationGroups, resolve);
}

function collectGroupsIdsAtDepth(
  raw: string | undefined,
  relationGroupsDepth?: number,
): string[] {
  const nodes = parseEntityRelationGroups(raw);
  if (relationGroupsDepth != null && Number.isFinite(relationGroupsDepth)) {
    return collectRelationGroupsIdsAtDepth(nodes, relationGroupsDepth);
  }
  return collectRelationGroupsLeafIds(nodes);
}

function automationBridgeRelatedIds(
  values: Record<string, string | undefined>,
  field: EntityField,
  relationGroupsDepth: number | undefined,
  entities: Entity[],
  host: Entity,
): string[] {
  if (isEntityRelationLikeFieldType(field.type)) {
    return parseEntityRelationIds(values[field.id]);
  }
  if (field.type === "relationGroups") {
    return collectGroupsIdsAtDepth(values[field.id], relationGroupsDepth);
  }
  if (field.type !== "lookup" || !field.lookup) return [];
  const target = resolveEntityLookupTarget(host, field, entities);
  if (!target || target.field.type !== "relationGroups") return [];
  const outerBridge = host.fields.find(
    (item) => item.id === field.lookup!.relationFieldId,
  );
  if (!outerBridge) return [];
  const outerIds = automationBridgeRelatedIds(
    values,
    outerBridge,
    field.lookup.relationGroupsDepth,
    entities,
    host,
  );
  const ids: string[] = [];
  for (const outerId of outerIds) {
    const relatedRecord = target.entity.records.find(
      (record) => record.id === outerId,
    );
    if (!relatedRecord) continue;
    ids.push(
      ...collectGroupsIdsAtDepth(
        relatedRecord.values[target.field.id],
        relationGroupsDepth,
      ),
    );
  }
  return [...new Set(ids)];
}

export type ResolveAutomationActionValueOptions = {
  createdRecordIds?: string[];
  actorUserId?: string | null;
  fieldType?: EntityFieldType;
  datetimeWithTime?: boolean;
  /**
   * Resolve `{{relationFieldId.nestedFieldId}}` using the current record’s
   * relation value and the related entity’s records.
   */
  getRelatedFieldValue?: (
    relationFieldId: string,
    nestedFieldId: string,
  ) => string;
  entities?: Entity[];
  triggerEntityId?: string;
  triggerRecordId?: string;
  values?: Record<string, string>;
};

function resolveTabBridgeRelated(
  trigger: Entity,
  tabId: string,
  entities: Entity[],
  triggerRecordId: string | undefined,
): { relatedEntity: Entity; relatedIds: string[] } | null {
  const tab = trigger.tabs.find((item) => item.id === tabId);
  if (!tab || !isEntityTabWithLinkedEntity(tab) || !tab.linkedEntityId) {
    return null;
  }
  const relatedEntity = entities.find((item) => item.id === tab.linkedEntityId);
  if (!relatedEntity) return null;
  const recordId = triggerRecordId?.trim() ?? "";
  if (!recordId) return { relatedEntity, relatedIds: [] };
  const relatedIds = collectLinkedTabRecordIds({
    tab,
    linkedEntity: relatedEntity,
    parentEntityId: trigger.id,
    parentRecordId: recordId,
  });
  return { relatedEntity, relatedIds: [...new Set(relatedIds)] };
}

function resolveRelatedFieldValue(
  path: AutomationEntityPathRef,
  options: ResolveAutomationActionValueOptions,
): string {
  const { relationFieldId, fieldId: nestedFieldId, relationGroupsDepth } = path;
  const values = options.values;
  const entities = options.entities;
  const triggerEntityId = options.triggerEntityId;
  const tabId = parseAutomationTabPathBridge(relationFieldId);

  if (!values || !entities || !triggerEntityId) {
    // Legacy callback path (no depth / record-self / tab support).
    if (
      !tabId &&
      options.getRelatedFieldValue &&
      !isAutomationPathRelatedRecord(nestedFieldId)
    ) {
      return options.getRelatedFieldValue(relationFieldId, nestedFieldId);
    }
    return "";
  }

  const trigger = entities.find((entity) => entity.id === triggerEntityId);
  if (!trigger) return "";

  let relatedIds: string[] = [];
  let relatedEntity: Entity | null = null;

  if (tabId) {
    const fromTab = resolveTabBridgeRelated(
      trigger,
      tabId,
      entities,
      options.triggerRecordId,
    );
    if (!fromTab) return "";
    relatedEntity = fromTab.relatedEntity;
    relatedIds = fromTab.relatedIds;
  } else {
    const bridgeField = trigger.fields.find(
      (field) => field.id === relationFieldId,
    );
    if (!bridgeField) return "";
    relatedIds = automationBridgeRelatedIds(
      values,
      bridgeField,
      relationGroupsDepth,
      entities,
      trigger,
    );
    const targetId = automationBridgeTargetEntityId(
      bridgeField,
      entities,
      relationGroupsDepth,
      trigger,
    );
    relatedEntity = targetId
      ? (entities.find((entity) => entity.id === targetId) ?? null)
      : null;
    if (!relatedEntity && relatedIds[0]) {
      relatedEntity =
        entities.find((entity) =>
          entity.records.some((record) => record.id === relatedIds[0]),
        ) ?? null;
    }
  }

  if (relatedIds.length === 0) return "";

  if (isAutomationPathRelatedRecord(nestedFieldId)) {
    const unique = [...new Set(relatedIds)];
    if (wantsRelationIds(options.fieldType)) {
      return serializeEntityRelationIds(unique);
    }
    if (!relatedEntity) return unique.join(", ");
    const labels = unique
      .map((id) => resolveRelationRecordLabel(relatedEntity, id)?.trim() || id)
      .filter(Boolean);
    return [...new Set(labels)].join(", ");
  }

  if (!relatedEntity) return "";

  if (!tabId && options.getRelatedFieldValue) {
    const rawValue = options.getRelatedFieldValue(
      relationFieldId,
      nestedFieldId,
    );
    return resolveNestedFieldDisplayValue(
      relatedEntity,
      nestedFieldId,
      rawValue,
      options,
    );
  }

  // Union nested values across every selected related record (multi / groups).
  const nestedParts: string[] = [];
  for (const relatedId of relatedIds) {
    const relatedRecord = relatedEntity.records.find(
      (record) => record.id === relatedId,
    );
    const rawValue = relatedRecord?.values[nestedFieldId] ?? "";
    const part = resolveNestedFieldDisplayValue(
      relatedEntity,
      nestedFieldId,
      rawValue,
      options,
    );
    if (!part) continue;
    if (wantsRelationIds(options.fieldType)) {
      nestedParts.push(...parseEntityRelationIds(part));
    } else {
      nestedParts.push(part);
    }
  }
  if (nestedParts.length === 0) return "";
  if (wantsRelationIds(options.fieldType)) {
    return serializeEntityRelationIds([...new Set(nestedParts)]);
  }
  // Groups JSON must not be joined with commas — merge trees instead.
  if (wantsRelationGroupsValue(options.fieldType)) {
    const trees = nestedParts
      .map((part) => parseEntityRelationGroups(part))
      .filter((nodes) => nodes.length > 0);
    if (trees.length === 0) return "";
    return serializeEntityRelationGroups(mergeRelationGroupsTrees(trees));
  }
  return [...new Set(nestedParts)].join(", ");
}

/** Resolve literal / `{{fieldId}}` / `{{rel.field}}` / dynamic tokens. */
export function resolveAutomationActionValue(
  source: string,
  values: Record<string, string>,
  options: ResolveAutomationActionValueOptions = {},
): string {
  const raw = source.trim();
  if (!raw) return "";

  if (raw === AUTOMATION_VALUE_TODAY) {
    return todayIsoDate();
  }
  if (raw === AUTOMATION_VALUE_TOMORROW) {
    return addCalendarDays(todayIsoDate(), 1);
  }
  if (raw === AUTOMATION_VALUE_TIME_NOW) {
    return nowTimeHHmm();
  }
  if (raw === AUTOMATION_VALUE_NOW) {
    if (options.fieldType === "time") return nowTimeHHmm();
    if (
      options.fieldType === "datetime" &&
      options.datetimeWithTime === false
    ) {
      return todayIsoDate();
    }
    return `${todayIsoDate()}T${nowTimeHHmm()}`;
  }
  if (raw === AUTOMATION_VALUE_CURRENT_USER) {
    return options.actorUserId?.trim() || getCurrentUserRecordId() || "";
  }
  if (raw === AUTOMATION_VALUE_CURRENT_RECORD) {
    const recordId = options.triggerRecordId?.trim() || "";
    if (!recordId) return "";
    if (wantsRelationIds(options.fieldType)) {
      return serializeEntityRelationIds([recordId]);
    }
    return resolveTriggerRecordLabel(options, recordId);
  }
  if (raw === "{{created}}" || raw === "created") {
    const ids = options.createdRecordIds ?? [];
    return ids[ids.length - 1] ?? "";
  }

  const path = parseAutomationEntityPathRef(raw);
  if (path) {
    return resolveRelatedFieldValue(path, {
      ...options,
      values: options.values ?? values,
    });
  }

  const match = raw.match(/^\{\{([^}]+)\}\}$/);
  if (match) {
    const fieldId = match[1]!.trim();
    return resolveCopiedFieldValue(fieldId, values[fieldId] ?? "", options);
  }

  // Partial templates: replace every {{fieldId}} occurrence (not dotted paths).
  if (raw.includes("{{")) {
    return raw.replace(/\{\{([^.}]+)\}\}/g, (_, fieldId: string) => {
      const key = fieldId.trim();
      if (key === "created") {
        const ids = options.createdRecordIds ?? [];
        return ids[ids.length - 1] ?? "";
      }
      return resolveCopiedFieldValue(key, values[key] ?? "", options);
    });
  }

  return source;
}

/** Short Russian label for a stored action value (builder UI). */
export function describeAutomationActionValue(
  value: string,
  field: EntityField | null | undefined,
  fieldNameById?: (fieldId: string) => string,
): string {
  const raw = value.trim();
  if (!raw) return "Пустое значение";
  if (raw === AUTOMATION_VALUE_TODAY) return "Сегодня";
  if (raw === AUTOMATION_VALUE_TOMORROW) return "Завтра";
  if (raw === AUTOMATION_VALUE_NOW) {
    return field?.type === "time" ? "Сейчас" : "Сейчас";
  }
  if (raw === AUTOMATION_VALUE_TIME_NOW) return "Сейчас";
  if (raw === AUTOMATION_VALUE_CURRENT_USER) return "Текущий пользователь";
  if (raw === AUTOMATION_VALUE_CURRENT_RECORD) return "Текущая запись";
  if (raw === "true") return "Да";
  if (raw === "false") return "Нет";

  const path = parseAutomationEntityPathRef(raw);
  if (path) {
    const tabBridge = parseAutomationTabPathBridge(path.relationFieldId);
    const relationName = tabBridge
      ? (fieldNameById?.(path.relationFieldId) ?? "связанная вкладка")
      : (fieldNameById?.(path.relationFieldId) ?? "связь");
    const nestedName = isAutomationPathRelatedRecord(path.fieldId)
      ? "запись"
      : (fieldNameById?.(path.fieldId) ?? "поле");
    const depthLabel =
      path.relationGroupsDepth === 0
        ? " · строки"
        : path.relationGroupsDepth === 1
          ? " · вложенные"
          : "";
    return `Из «${relationName}»${depthLabel} · «${nestedName}»`;
  }

  const match = raw.match(/^\{\{([^}]+)\}\}$/);
  if (match) {
    const fieldId = match[1]!.trim();
    if (fieldId === "created") return "Созданная запись";
    const name = fieldNameById?.(fieldId) ?? "поле";
    return `Из поля «${name}»`;
  }

  if (field?.type === "list") {
    const option = field.listOptions.find((item) => item.id === raw);
    if (option) return option.name;
  }

  return raw;
}
