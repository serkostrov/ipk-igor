import type {
  AutomationAssigneeLeafResolver,
  AutomationAssigneeResolver,
} from "../model/assignee";
import { relatedFieldRelationPath } from "../model/assignee";
import {
  matchAutomationConditions,
  type AutomationConditionEvalContext,
} from "./evaluate-conditions";
import {
  SYSTEM_USERS_FIELD_ROLE_ID,
  collectRelationGroupsLeafIds,
  getEntityRelationTargetId,
  getRelationGroupsLeafEntityId,
  getSystemUsersEntity,
  parseEntityRelationGroups,
  parseEntityRelationIds,
  type Entity,
  type EntityField,
} from "@/entities/entity";

export type ResolveAssigneeContext = AutomationConditionEvalContext & {
  actorUserId?: string | null;
  entities?: Entity[];
  triggerEntityId?: string;
};

function resolveFieldTarget(
  entities: Entity[],
  entityId: string,
  fieldId: string,
): string | null {
  const host = entities.find((item) => item.id === entityId);
  const source = host?.fields.find((item) => item.id === fieldId);
  return source ? getEntityRelationTargetId(source) : null;
}

/** Relation or relationGroups hop used in assignee paths. */
function findBridgeField(
  entity: Entity | null | undefined,
  fieldId: string,
): EntityField | null {
  const field = entity?.fields.find((item) => item.id === fieldId);
  if (!field) return null;
  if (field.type === "relation") return field;
  if (
    field.type === "relationGroups" &&
    (field.relationGroups?.levels.length ?? 0) > 0
  ) {
    return field;
  }
  return null;
}

function bridgeRelatedRecordIds(
  values: Record<string, string | undefined>,
  field: EntityField,
): string[] {
  if (field.type === "relation") {
    return parseEntityRelationIds(values[field.id]);
  }
  if (field.type === "relationGroups") {
    return collectRelationGroupsLeafIds(
      parseEntityRelationGroups(values[field.id]),
    );
  }
  return [];
}

function bridgeTargetEntityId(
  field: EntityField,
  entities: Entity[],
): string | null {
  if (field.type === "relation") return getEntityRelationTargetId(field);
  if (field.type === "relationGroups") {
    return getRelationGroupsLeafEntityId(
      field.relationGroups,
      (entityId, fieldId) => resolveFieldTarget(entities, entityId, fieldId),
    );
  }
  return null;
}

function resolveRelatedFieldUserIds(
  resolver: Extract<AutomationAssigneeLeafResolver, { type: "relatedField" }>,
  ctx: ResolveAssigneeContext,
): string[] {
  const values = ctx.values;
  const entities = ctx.entities;
  const triggerEntityId = ctx.triggerEntityId;
  const path = relatedFieldRelationPath(resolver);
  if (path.length === 0) return [];

  if (!values || !entities || !triggerEntityId) {
    // Without entity graph we cannot walk nested hops.
    if (path.length === 1) {
      const raw = values?.[path[0]!];
      if (!raw) return [];
    }
    return [];
  }

  const rootEntity = entities.find((entity) => entity.id === triggerEntityId);
  if (!rootEntity) return [];

  const fanOut = resolver.fanOut === true;
  type Cursor = {
    entity: Entity;
    values: Record<string, string | undefined>;
  };

  let cursors: Cursor[] = [{ entity: rootEntity, values }];

  for (const relationFieldId of path) {
    const nextCursors: Cursor[] = [];
    for (const cursor of cursors) {
      const bridgeField = findBridgeField(cursor.entity, relationFieldId);
      if (!bridgeField) continue;

      const relatedIds = bridgeRelatedRecordIds(cursor.values, bridgeField);
      const hopIds = fanOut ? relatedIds : relatedIds.slice(0, 1);
      if (hopIds.length === 0) continue;

      const targetId = bridgeTargetEntityId(bridgeField, entities);
      const relatedEntity =
        (targetId ? entities.find((entity) => entity.id === targetId) : null) ??
        null;
      if (!relatedEntity) continue;

      for (const relatedId of hopIds) {
        const relatedRecord = relatedEntity.records.find(
          (record) => record.id === relatedId,
        );
        if (!relatedRecord) continue;
        nextCursors.push({
          entity: relatedEntity,
          values: relatedRecord.values,
        });
      }
    }
    cursors = nextCursors;
    if (cursors.length === 0) return [];
  }

  const userIds: string[] = [];
  const seen = new Set<string>();
  for (const cursor of cursors) {
    const ids = parseEntityRelationIds(cursor.values[resolver.fieldId]);
    const pick = fanOut ? ids : ids.slice(0, 1);
    for (const id of pick) {
      if (seen.has(id)) continue;
      seen.add(id);
      userIds.push(id);
    }
  }
  return userIds;
}

function resolveLeaf(
  resolver: AutomationAssigneeLeafResolver,
  ctx: ResolveAssigneeContext,
): string[] {
  switch (resolver.type) {
    case "none":
      return [];
    case "fixedUsers":
      return resolver.userIds;
    case "field": {
      const ids = parseEntityRelationIds(ctx.values[resolver.fieldId]);
      return ids[0] ? [ids[0]] : [];
    }
    case "relationFieldFanOut":
      return parseEntityRelationIds(ctx.values[resolver.fieldId]);
    case "relatedField":
      return resolveRelatedFieldUserIds(resolver, ctx);
    case "role": {
      const users = ctx.entities ? getSystemUsersEntity(ctx.entities) : null;
      if (!users) return [];
      return users.records
        .filter(
          (record) =>
            (record.values[SYSTEM_USERS_FIELD_ROLE_ID] ?? "").trim() ===
            resolver.roleId,
        )
        .map((record) => record.id);
    }
    case "recordCreator": {
      const creator =
        ctx.values.__createdByUserId?.trim() ||
        ctx.values.createdBy?.trim() ||
        "";
      if (creator) return [creator];
      return ctx.actorUserId ? [ctx.actorUserId] : [];
    }
    case "currentUser":
    default:
      return ctx.actorUserId ? [ctx.actorUserId] : [];
  }
}

/** Resolve assignee / watcher / recipient ids from a resolver + record values. */
export function resolveAssigneeUserIds(
  resolver: AutomationAssigneeResolver,
  ctx: ResolveAssigneeContext,
): string[] {
  if (resolver.type !== "conditional") {
    return resolveLeaf(resolver, ctx);
  }

  for (const branch of resolver.branches) {
    if (matchAutomationConditions(branch.conditions, ctx)) {
      return resolveLeaf(branch.resolver, ctx);
    }
  }
  return resolveLeaf(resolver.elseResolver, ctx);
}
