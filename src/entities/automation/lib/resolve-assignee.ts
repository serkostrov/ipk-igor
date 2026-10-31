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
  SYSTEM_USERS_ENTITY_ID,
  SYSTEM_USERS_FIELD_ROLE_ID,
  collectRelationGroupsIdsAtDepth,
  collectRelationGroupsLeafIds,
  entityRelationIncludesId,
  getEntityRelationTargetId,
  getRelationGroupsLeafEntityId,
  getRelationGroupsLevelEntityId,
  getSystemUsersEntity,
  findEntityManagerUserField,
  isDeptCalculationsEntity,
  isEntityRelationLikeFieldType,
  isTkpAnalysisEntity,
  parseEntityRelationGroups,
  parseEntityRelationIds,
  resolveTkpGipAssigneeUserIds,
  type Entity,
  type EntityField,
} from "@/entities/entity";

export type ResolveAssigneeContext = AutomationConditionEvalContext & {
  actorUserId?: string | null;
  entities?: Entity[];
  triggerEntityId?: string;
  /** Trigger record id — required to walk linked-entity tabs. */
  triggerRecordId?: string | null;
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

/** Relation, belonging or relationGroups hop used in assignee paths. */
function findBridgeField(
  entity: Entity | null | undefined,
  fieldId: string,
): EntityField | null {
  const field = entity?.fields.find((item) => item.id === fieldId);
  if (!field) return null;
  if (isEntityRelationLikeFieldType(field.type)) return field;
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
  relationGroupsDepth?: number,
): string[] {
  if (isEntityRelationLikeFieldType(field.type)) {
    return parseEntityRelationIds(values[field.id]);
  }
  if (field.type === "relationGroups") {
    const nodes = parseEntityRelationGroups(values[field.id]);
    if (relationGroupsDepth != null && Number.isFinite(relationGroupsDepth)) {
      return collectRelationGroupsIdsAtDepth(nodes, relationGroupsDepth);
    }
    return collectRelationGroupsLeafIds(nodes);
  }
  return [];
}

function bridgeTargetEntityId(
  field: EntityField,
  entities: Entity[],
  relationGroupsDepth?: number,
): string | null {
  if (isEntityRelationLikeFieldType(field.type)) {
    return getEntityRelationTargetId(field);
  }
  if (field.type === "relationGroups") {
    const resolve = (entityId: string, fieldId: string) =>
      resolveFieldTarget(entities, entityId, fieldId);
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
      return atDepth;
    }
    return getRelationGroupsLeafEntityId(field.relationGroups, resolve);
  }
  return null;
}

function collectLinkedChildCursors(
  linkedChild: {
    entityId: string;
    parentFieldId: string;
  },
  entities: Entity[],
  triggerRecordId: string,
  fanOut: boolean,
): Array<{
  entity: Entity;
  values: Record<string, string | undefined>;
  recordId: string;
}> {
  const childEntity = entities.find((item) => item.id === linkedChild.entityId);
  if (!childEntity) return [];
  const children = childEntity.records.filter((record) =>
    entityRelationIncludesId(
      record.values[linkedChild.parentFieldId],
      triggerRecordId,
    ),
  );
  const pick = fanOut ? children : children.slice(0, 1);
  return pick.map((record) => ({
    entity: childEntity,
    values: record.values,
    recordId: record.id,
  }));
}

function resolveRelatedFieldUserIds(
  resolver: Extract<AutomationAssigneeLeafResolver, { type: "relatedField" }>,
  ctx: ResolveAssigneeContext,
): string[] {
  const values = ctx.values;
  const entities = ctx.entities;
  const triggerEntityId = ctx.triggerEntityId;
  const path = relatedFieldRelationPath(resolver);
  const linkedChild = resolver.linkedChild;

  if (!linkedChild && path.length === 0) return [];

  if (!values || !entities || !triggerEntityId) {
    return [];
  }

  const rootEntity = entities.find((entity) => entity.id === triggerEntityId);
  if (!rootEntity) return [];

  const linkedChildEntity = linkedChild
    ? (entities.find((item) => item.id === linkedChild.entityId) ?? null)
    : null;
  // «Расчёты отделов» / стадии→отделы under «Разбор ТКП»: always one task
  // per department head (incl. lead «ГИП»), not only the first.
  const forceFanOut =
    (linkedChildEntity != null &&
      isDeptCalculationsEntity(linkedChildEntity)) ||
    (isTkpAnalysisEntity(rootEntity) &&
      path.some((fieldId) => {
        const field = findBridgeField(rootEntity, fieldId);
        return field?.type === "relationGroups";
      }));
  const fanOut = resolver.fanOut === true || forceFanOut;
  const depths = resolver.relationGroupsDepths ?? [];
  type Cursor = {
    entity: Entity;
    values: Record<string, string | undefined>;
    recordId?: string;
  };

  let cursors: Cursor[] = [{ entity: rootEntity, values }];

  if (linkedChild) {
    const triggerRecordId = ctx.triggerRecordId?.trim() ?? "";
    if (!triggerRecordId) return [];
    cursors = collectLinkedChildCursors(
      linkedChild,
      entities,
      triggerRecordId,
      fanOut,
    );
    if (cursors.length === 0) return [];
  }

  for (let hopIndex = 0; hopIndex < path.length; hopIndex++) {
    const relationFieldId = path[hopIndex]!;
    const hopDepth = depths[hopIndex];
    const nextCursors: Cursor[] = [];
    for (const cursor of cursors) {
      const bridgeField = findBridgeField(cursor.entity, relationFieldId);
      if (!bridgeField) continue;

      // Nested departments in «Стадия/отделы»: default to deepest level.
      const effectiveDepth =
        hopDepth != null && Number.isFinite(hopDepth)
          ? hopDepth
          : bridgeField.type === "relationGroups" &&
              (bridgeField.relationGroups?.levels.length ?? 0) > 1
            ? bridgeField.relationGroups!.levels.length - 1
            : undefined;

      const relatedIds = bridgeRelatedRecordIds(
        cursor.values,
        bridgeField,
        effectiveDepth,
      );
      const hopIds = fanOut ? relatedIds : relatedIds.slice(0, 1);
      if (hopIds.length === 0) continue;

      const targetId = bridgeTargetEntityId(
        bridgeField,
        entities,
        effectiveDepth,
      );
      const relatedEntity =
        (targetId ? entities.find((entity) => entity.id === targetId) : null) ??
        null;
      if (!relatedEntity) continue;

      const usersEntity = getSystemUsersEntity(entities);
      for (const relatedId of hopIds) {
        const relatedRecord = relatedEntity.records.find(
          (record) => record.id === relatedId,
        );
        if (relatedRecord) {
          nextCursors.push({
            entity: relatedEntity,
            values: relatedRecord.values,
            recordId: relatedRecord.id,
          });
          continue;
        }
        // Managers-task may store Users ids in department slots — still hop.
        const userRecord = usersEntity?.records.find(
          (record) => record.id === relatedId,
        );
        if (!userRecord || !usersEntity) continue;
        nextCursors.push({
          entity: usersEntity,
          values: userRecord.values,
          recordId: userRecord.id,
        });
      }
    }
    cursors = nextCursors;
    if (cursors.length === 0) return [];
  }

  const userIds: string[] = [];
  const seen = new Set<string>();
  const triggerRecordId = ctx.triggerRecordId?.trim() || null;
  for (const cursor of cursors) {
    // Prefer configured field; if missing/empty on this entity (e.g. wrongly
    // saved Users.«Руководитель»), fall back to catalog «Руководитель(и)».
    let fallbackIds = parseEntityRelationIds(cursor.values[resolver.fieldId]);
    if (fallbackIds.length === 0) {
      const managerField =
        cursor.entity.fields.find((field) => field.id === resolver.fieldId) ??
        findEntityManagerUserField(cursor.entity);
      if (managerField && managerField.id !== resolver.fieldId) {
        fallbackIds = parseEntityRelationIds(cursor.values[managerField.id]);
      }
    }
    // «Стадия/отделы» depth may already be Users (selected heads). Configured
    // «Отдел.Руководители» is empty on those rows — use the user cursor id.
    if (
      fallbackIds.length === 0 &&
      cursor.entity.id === SYSTEM_USERS_ENTITY_ID &&
      cursor.recordId?.trim()
    ) {
      fallbackIds = [cursor.recordId.trim()];
    }
    const stored =
      (cursor.recordId
        ? cursor.entity.records.find((item) => item.id === cursor.recordId)
        : null) ?? null;
    const departmentRecord = stored ?? {
      id: cursor.recordId ?? "draft",
      values: Object.fromEntries(
        Object.entries(cursor.values).map(([key, value]) => [key, value ?? ""]),
      ),
      authUserId: null,
      createdBy: null,
      schemaVersion: 0,
    };
    const gipIds = resolveTkpGipAssigneeUserIds({
      triggerEntity: rootEntity,
      triggerValues: values,
      triggerRecordId,
      departmentEntity: cursor.entity,
      departmentRecord,
      entities,
      fallbackUserIds: fallbackIds,
    });
    const ids = gipIds ?? fallbackIds;
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
