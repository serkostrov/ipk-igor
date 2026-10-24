import {
  getEntityFieldDisplayName,
  getEntityRelationTargetId,
  getRelationGroupsLeafEntityId,
  getRelationGroupsLevelEntityId,
  isEntityRelationLikeFieldType,
  resolveEntityLookupTarget,
  SYSTEM_USERS_ENTITY_ID,
  type Entity,
  type EntityField,
} from "@/entities/entity";

/** Direct user field on the root entity. */
export type UserFieldPathDirect = {
  kind: "direct";
  fieldId: string;
};

/**
 * First hop through a linked-entity tab on the trigger
 * (e.g. «Разбор ТКП» → «Расчёты отделов»).
 */
export type UserFieldPathLinkedChild = {
  tabId: string;
  entityId: string;
  /** Belonging / relation on the child that points at the trigger record. */
  parentFieldId: string;
  label: string;
};

/**
 * User field reached through one or more relation hops
 * (e.g. Лид → РКО → Менеджер, or Набор · Строки → Менеджер).
 * Optional `linkedChild` walks child records of a linked tab first.
 */
export type UserFieldPathRelated = {
  kind: "related";
  linkedChild?: UserFieldPathLinkedChild;
  relationPath: string[];
  /**
   * Parallel to `relationPath`: depth when the hop is `relationGroups`
   * (0 = «Строки», 1 = «Вложенные»). Omitted / undefined = leaf.
   */
  relationGroupsDepths?: Array<number | undefined>;
  fieldId: string;
};

export type UserFieldPath = UserFieldPathDirect | UserFieldPathRelated;

/** Minimal entity shape for path navigation (root may be synthetic). */
export type UserFieldPathEntity = Pick<
  Entity,
  "id" | "name" | "namePlural" | "fields"
>;

function resolveFieldTargetAmong(
  entities: Entity[],
  entityId: string,
  fieldId: string,
): string | null {
  const host = entities.find((item) => item.id === entityId);
  const source = host?.fields.find((item) => item.id === fieldId);
  return source ? getEntityRelationTargetId(source) : null;
}

export function relationGroupsLevelLabel(depth: number) {
  return depth === 0 ? "Строки" : "Вложенные";
}

export function userRelationFields(fields: EntityField[]) {
  return fields.filter(
    (field) =>
      isEntityRelationLikeFieldType(field.type) &&
      getEntityRelationTargetId(field) === SYSTEM_USERS_ENTITY_ID,
  );
}

export function bridgeRelationFields(fields: EntityField[]) {
  return fields.filter((field) => {
    if (!isEntityRelationLikeFieldType(field.type)) return false;
    const targetId = getEntityRelationTargetId(field);
    return Boolean(targetId) && targetId !== SYSTEM_USERS_ENTITY_ID;
  });
}

/** `relationGroups` fields that bridge to at least one level entity. */
export function bridgeRelationGroupsFields(fields: EntityField[]) {
  return fields.filter(
    (field) =>
      field.type === "relationGroups" &&
      Boolean(field.relationGroups?.levels.length),
  );
}

/**
 * Lookup fields on `host` whose target is a Users relation —
 * including lookups through a `relationGroups` bridge («из наборов»).
 * Each option expands to a concrete related path for resolve.
 */
export function userLookupPathOptions(
  host: UserFieldPathEntity | null | undefined,
  entities: Entity[],
): Array<{ field: EntityField; path: UserFieldPathRelated }> {
  if (!host) return [];
  const result: Array<{ field: EntityField; path: UserFieldPathRelated }> = [];
  for (const field of host.fields) {
    if (field.type !== "lookup" || !field.lookup) continue;
    const target = resolveEntityLookupTarget(host, field, entities);
    if (!target) continue;
    if (
      !isEntityRelationLikeFieldType(target.field.type) ||
      getEntityRelationTargetId(target.field) !== SYSTEM_USERS_ENTITY_ID
    ) {
      continue;
    }
    const bridge = target.relationField;
    if (bridge.type === "relationGroups") {
      const depth =
        field.lookup.relationGroupsDepth ??
        Math.max(0, (bridge.relationGroups?.levels.length ?? 1) - 1);
      result.push({
        field,
        path: {
          kind: "related",
          relationPath: [bridge.id],
          relationGroupsDepths: [depth],
          fieldId: target.field.id,
        },
      });
      continue;
    }
    if (isEntityRelationLikeFieldType(bridge.type)) {
      result.push({
        field,
        path: {
          kind: "related",
          relationPath: [bridge.id],
          fieldId: target.field.id,
        },
      });
    }
  }
  return result;
}

/** Drill targets for a relationGroups field (one per resolvable level). */
export function relationGroupsDrillOptions(
  field: EntityField,
  entities: Entity[],
): Array<{ depth: number; label: string; entity: UserFieldPathEntity }> {
  if (field.type !== "relationGroups" || !field.relationGroups) return [];
  const resolve = (entityId: string, fieldId: string) =>
    resolveFieldTargetAmong(entities, entityId, fieldId);
  const options: Array<{
    depth: number;
    label: string;
    entity: UserFieldPathEntity;
  }> = [];
  let previous: string | null = null;
  for (let i = 0; i < field.relationGroups.levels.length; i++) {
    const level = field.relationGroups.levels[i];
    if (!level) break;
    const entityId = getRelationGroupsLevelEntityId(level, previous, resolve);
    if (!entityId) break;
    const entity = entities.find((item) => item.id === entityId);
    if (entity) {
      options.push({
        depth: i,
        label: relationGroupsLevelLabel(i),
        entity,
      });
    }
    previous = entityId;
  }
  return options;
}

/**
 * Relation / belonging / relationGroups hop target for path navigation.
 * For relationGroups, `depth` selects the level (default = leaf).
 */
export function relationTargetEntity(
  field: EntityField | null | undefined,
  entities: Entity[],
  relationGroupsDepth?: number,
): UserFieldPathEntity | null {
  if (!field) return null;
  if (isEntityRelationLikeFieldType(field.type)) {
    const targetId = getEntityRelationTargetId(field);
    if (!targetId) return null;
    return entities.find((item) => item.id === targetId) ?? null;
  }
  if (field.type === "relationGroups") {
    const resolve = (entityId: string, fieldId: string) =>
      resolveFieldTargetAmong(entities, entityId, fieldId);
    if (relationGroupsDepth != null && Number.isFinite(relationGroupsDepth)) {
      let previous: string | null = null;
      let atDepth: string | null = null;
      for (let i = 0; i <= relationGroupsDepth; i++) {
        const level = field.relationGroups?.levels[i];
        if (!level) return null;
        atDepth = getRelationGroupsLevelEntityId(level, previous, resolve);
        if (!atDepth) return null;
        previous = atDepth;
      }
      return atDepth
        ? (entities.find((item) => item.id === atDepth) ?? null)
        : null;
    }
    const leafId = getRelationGroupsLeafEntityId(field.relationGroups, resolve);
    if (!leafId) return null;
    return entities.find((item) => item.id === leafId) ?? null;
  }
  return null;
}

export function formatUserFieldLabel(field: EntityField) {
  const name = getEntityFieldDisplayName(field);
  return field.relationMultiple ? `${name} · несколько` : name;
}

function findField(
  entity: UserFieldPathEntity | null | undefined,
  fieldId: string,
): EntityField | null {
  return entity?.fields.find((field) => field.id === fieldId) ?? null;
}

function hopDepthAt(
  path: UserFieldPathRelated,
  index: number,
): number | undefined {
  const raw = path.relationGroupsDepths?.[index];
  return raw != null && Number.isFinite(raw) ? raw : undefined;
}

/** Human-readable path for the closed trigger. */
export function formatUserFieldPathLabel(
  path: UserFieldPath | null,
  rootEntity: UserFieldPathEntity | null,
  entities: Entity[],
): string | null {
  if (!path || !rootEntity) return null;

  if (path.kind === "direct") {
    const field = findField(rootEntity, path.fieldId);
    return field ? formatUserFieldLabel(field) : null;
  }

  const parts: string[] = [];
  let entity: UserFieldPathEntity | null = rootEntity;
  if (path.linkedChild) {
    parts.push(path.linkedChild.label);
    entity =
      entities.find((item) => item.id === path.linkedChild!.entityId) ?? null;
    if (!entity) return null;
  }
  for (let index = 0; index < path.relationPath.length; index++) {
    const relationId = path.relationPath[index]!;
    const relation = findField(entity, relationId);
    if (!relation) return null;
    const depth = hopDepthAt(path, index);
    const hopLabel =
      relation.type === "relationGroups" && depth != null
        ? `${getEntityFieldDisplayName(relation)} · ${relationGroupsLevelLabel(depth)}`
        : getEntityFieldDisplayName(relation);
    parts.push(hopLabel);
    entity = relationTargetEntity(relation, entities, depth);
    if (!entity) return null;
  }
  const leaf = findField(entity, path.fieldId);
  if (!leaf) return null;
  parts.push(formatUserFieldLabel(leaf));
  return parts.join(" → ");
}

export function pathFromAssigneeSelection(args: {
  type: "field" | "relationFieldFanOut" | "relatedField";
  fieldId: string;
  relationFieldId?: string;
  via?: string[];
  relationGroupsDepths?: Array<number | undefined>;
  linkedChild?: UserFieldPathLinkedChild;
}): UserFieldPath | null {
  if (args.type === "field" || args.type === "relationFieldFanOut") {
    if (!args.fieldId) return null;
    return { kind: "direct", fieldId: args.fieldId };
  }
  if (!args.fieldId) return null;
  const via = args.via?.filter((id) => id.trim()) ?? [];
  const first = args.relationFieldId?.trim() ?? "";
  const relationPath = first ? [first, ...via] : [...via];
  if (relationPath.length === 0 && !args.linkedChild) return null;
  const depths = args.relationGroupsDepths;
  const hasDepth =
    depths != null &&
    depths.some((depth) => depth != null && Number.isFinite(depth));
  return {
    kind: "related",
    relationPath,
    fieldId: args.fieldId,
    ...(args.linkedChild ? { linkedChild: args.linkedChild } : {}),
    ...(hasDepth
      ? { relationGroupsDepths: depths.slice(0, relationPath.length) }
      : {}),
  };
}

/** True when the path fans out across many child / groups records. */
export function pathImpliesMultiAssignee(path: UserFieldPath | null): boolean {
  if (!path || path.kind !== "related") return false;
  if (path.linkedChild) return true;
  return (path.relationGroupsDepths ?? []).some(
    (depth) => depth != null && Number.isFinite(depth),
  );
}
