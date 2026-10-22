import {
  getEntityFieldDisplayName,
  getEntityRelationTargetId,
  getRelationGroupsLeafEntityId,
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
 * User field reached through one or more relation hops
 * (e.g. Лид → РКО → Менеджер).
 */
export type UserFieldPathRelated = {
  kind: "related";
  relationPath: string[];
  fieldId: string;
};

export type UserFieldPath = UserFieldPathDirect | UserFieldPathRelated;

/** Minimal entity shape for path navigation (root may be synthetic). */
export type UserFieldPathEntity = Pick<
  Entity,
  "id" | "name" | "namePlural" | "fields"
>;

export function userRelationFields(fields: EntityField[]) {
  return fields.filter(
    (field) =>
      field.type === "relation" &&
      getEntityRelationTargetId(field) === SYSTEM_USERS_ENTITY_ID,
  );
}

export function bridgeRelationFields(fields: EntityField[]) {
  return fields.filter((field) => {
    if (field.type !== "relation") return false;
    const targetId = getEntityRelationTargetId(field);
    return Boolean(targetId) && targetId !== SYSTEM_USERS_ENTITY_ID;
  });
}

/** `relationGroups` fields that bridge to their leaf entity. */
export function bridgeRelationGroupsFields(fields: EntityField[]) {
  return fields.filter(
    (field) =>
      field.type === "relationGroups" &&
      Boolean(field.relationGroups?.levels.length),
  );
}

/** Relation or relationGroups hop target for path navigation. */
export function relationTargetEntity(
  field: EntityField | null | undefined,
  entities: Entity[],
): UserFieldPathEntity | null {
  if (!field) return null;
  if (field.type === "relation") {
    const targetId = getEntityRelationTargetId(field);
    if (!targetId) return null;
    return entities.find((item) => item.id === targetId) ?? null;
  }
  if (field.type === "relationGroups") {
    const leafId = getRelationGroupsLeafEntityId(
      field.relationGroups,
      (entityId, fieldId) => {
        const host = entities.find((item) => item.id === entityId);
        const source = host?.fields.find((item) => item.id === fieldId);
        return source ? getEntityRelationTargetId(source) : null;
      },
    );
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
  for (const relationId of path.relationPath) {
    const relation = findField(entity, relationId);
    if (!relation) return null;
    parts.push(getEntityFieldDisplayName(relation));
    entity = relationTargetEntity(relation, entities);
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
}): UserFieldPath | null {
  if (args.type === "field" || args.type === "relationFieldFanOut") {
    if (!args.fieldId) return null;
    return { kind: "direct", fieldId: args.fieldId };
  }
  if (!args.relationFieldId || !args.fieldId) return null;
  const via = args.via?.filter((id) => id.trim()) ?? [];
  return {
    kind: "related",
    relationPath: [args.relationFieldId, ...via],
    fieldId: args.fieldId,
  };
}
