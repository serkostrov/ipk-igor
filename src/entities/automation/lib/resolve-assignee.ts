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
  getEntityRelationTargetId,
  getSystemUsersEntity,
  parseEntityRelationIds,
  type Entity,
  type EntityField,
} from "@/entities/entity";

export type ResolveAssigneeContext = AutomationConditionEvalContext & {
  actorUserId?: string | null;
  entities?: Entity[];
  triggerEntityId?: string;
};

function findRelationField(
  entity: Entity | null | undefined,
  fieldId: string,
): EntityField | null {
  const field = entity?.fields.find((item) => item.id === fieldId);
  return field?.type === "relation" ? field : null;
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

  let currentEntity =
    entities.find((entity) => entity.id === triggerEntityId) ?? null;
  let currentValues = values;

  for (const relationFieldId of path) {
    if (!currentEntity) return [];
    const relationField = findRelationField(currentEntity, relationFieldId);
    if (!relationField) return [];

    const relatedId = parseEntityRelationIds(currentValues[relationFieldId])[0];
    if (!relatedId) return [];

    const targetId = getEntityRelationTargetId(relationField);
    const relatedEntity =
      (targetId ? entities.find((entity) => entity.id === targetId) : null) ??
      entities.find((entity) =>
        entity.records.some((record) => record.id === relatedId),
      );
    if (!relatedEntity) return [];

    const relatedRecord = relatedEntity.records.find(
      (record) => record.id === relatedId,
    );
    if (!relatedRecord) return [];

    currentEntity = relatedEntity;
    currentValues = relatedRecord.values;
  }

  const ids = parseEntityRelationIds(currentValues[resolver.fieldId]);
  return ids[0] ? [ids[0]] : [];
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
