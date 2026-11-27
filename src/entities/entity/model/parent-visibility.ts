import { getEntityRecordById } from "./record-queries";
import { getEntityRelationTargetId, parseEntityRelationIds } from "./field";
import {
  getEntityTableNestedTargets,
  resolveEntityTableParentField,
} from "./table-hierarchy";
import { SYSTEM_USERS_ENTITY_ID } from "./system-entities";
import { findDepartmentsEntity } from "./departments";
import { findLegalEntitiesEntity } from "./legal-entities";
import type { Entity, EntityField, EntityRecord, EntityTab } from "./types";

export type ParentVisibilityLink = {
  parentEntity: Entity;
  /** Field on the child that stores the parent record id(s). */
  childLinkFieldId: string;
};

/**
 * Parent-link field on the linked entity for an entity tab.
 * Same rule as `resolveLinkedTabParentLinkFieldId` (entity layer — no automation import).
 */
export function resolveEntityTabParentLinkFieldId(
  tab: Pick<EntityTab, "parentLinkFieldId">,
  linkedEntity: Entity,
  parentEntityId: string,
): string | null {
  const configured = tab.parentLinkFieldId?.trim() || null;
  if (configured) return configured;
  const inferred = linkedEntity.fields.find(
    (field) =>
      (field.type === "relation" || field.type === "belonging") &&
      getEntityRelationTargetId(field) === parentEntityId,
  );
  return inferred?.id ?? null;
}

function inferChildLinkToParent(
  childEntity: Entity,
  parentEntityId: string,
): string | null {
  const field = childEntity.fields.find(
    (item) =>
      (item.type === "relation" || item.type === "belonging") &&
      getEntityRelationTargetId(item) === parentEntityId,
  );
  return field?.id ?? null;
}

/**
 * Users, departments and legal entities are catalogs. A tab or link to them
 * describes the record; it does not make every catalog row an owner.
 */
function isVisibilityCatalog(
  entity: Entity,
  entities: readonly Entity[],
): boolean {
  if (entity.id === SYSTEM_USERS_ENTITY_ID) return true;
  const departmentsId = findDepartmentsEntity(entities)?.id ?? null;
  if (departmentsId && entity.id === departmentsId) return true;
  const legalId = findLegalEntitiesEntity(entities)?.id ?? null;
  return legalId != null && entity.id === legalId;
}

/**
 * Ownership, not a reference. A plain relation used only by another entity's
 * tab (counterparty → projects) does not grant visibility.
 */
function isStructuralOwnershipField(
  childEntity: Entity,
  field: EntityField,
  parent: Entity,
): boolean {
  if (field.type === "belonging") return true;
  if (field.relationCascadeDelete === true) return true;
  if (resolveEntityTableParentField(childEntity)?.id === field.id) return true;
  return childEntity.parentEntityId?.trim() === parent.id;
}

/**
 * How a child entity attaches to an owning parent for view-inheritance:
 * - belonging, cascade delete, table parent field, or `parentEntityId`
 * - the host's nested table (`tableNestedEntityId`), even via a plain relation
 * Catalogs (users, departments, legal entities) are never owners.
 * An entity tab alone is not ownership.
 */
function collectParentVisibilityLinks(
  childEntity: Entity,
  entities: readonly Entity[],
): ParentVisibilityLink[] {
  const links: ParentVisibilityLink[] = [];
  const seen = new Set<string>();

  const add = (
    parentEntity: Entity,
    childLinkFieldId: string,
    nestedTable = false,
  ) => {
    if (isVisibilityCatalog(parentEntity, entities)) return;
    const field = childEntity.fields.find(
      (item) => item.id === childLinkFieldId,
    );
    if (!field) return;
    if (field.type !== "relation" && field.type !== "belonging") return;
    if (getEntityRelationTargetId(field) !== parentEntity.id) return;
    if (
      !nestedTable &&
      !isStructuralOwnershipField(childEntity, field, parentEntity)
    ) {
      return;
    }
    const key = `${parentEntity.id}:${childLinkFieldId}`;
    if (seen.has(key)) return;
    seen.add(key);
    links.push({ parentEntity, childLinkFieldId });
  };

  for (const parent of entities) {
    if (parent.tableNestedEntityId?.trim() !== childEntity.id) continue;
    const nested = getEntityTableNestedTargets(parent, entities).find(
      (item) => item.entityId === childEntity.id,
    );
    const fieldId =
      nested?.parentLinkFieldId ??
      inferChildLinkToParent(childEntity, parent.id);
    if (fieldId) add(parent, fieldId, true);
  }

  const parentEntityId = childEntity.parentEntityId?.trim();
  if (parentEntityId) {
    const parent = entities.find((item) => item.id === parentEntityId);
    if (parent) {
      for (const field of childEntity.fields) {
        if (field.type !== "relation" && field.type !== "belonging") continue;
        if (getEntityRelationTargetId(field) !== parent.id) continue;
        add(parent, field.id);
      }
    }
  }

  for (const field of childEntity.fields) {
    if (field.type !== "relation" && field.type !== "belonging") continue;
    const targetId = getEntityRelationTargetId(field);
    if (!targetId) continue;
    const parent = entities.find((item) => item.id === targetId);
    if (!parent) continue;
    add(parent, field.id);
  }

  return links;
}

const parentVisibilityLinkCache = new WeakMap<
  readonly Entity[],
  Map<string, ParentVisibilityLink[]>
>();

/**
 * Ownership links of one entity. The schema does not change between rows of
 * a list, so the walk is computed once per entity.
 */
export function findParentVisibilityLinks(
  childEntity: Entity,
  entities: readonly Entity[],
): ParentVisibilityLink[] {
  let byChild = parentVisibilityLinkCache.get(entities);
  if (!byChild) {
    byChild = new Map();
    parentVisibilityLinkCache.set(entities, byChild);
  }
  const cached = byChild.get(childEntity.id);
  if (cached) return cached;
  const links = collectParentVisibilityLinks(childEntity, entities);
  byChild.set(childEntity.id, links);
  return links;
}

const MAX_PARENT_VISIBILITY_DEPTH = 4;

/**
 * Child is visible when at least one linked parent record is visible under
 * `isParentVisible` (usually direct data-scope + recursive inheritance).
 */
export async function recordMatchesParentVisibility(
  entity: Entity,
  record: EntityRecord,
  entities: readonly Entity[],
  isParentVisible: (
    parentEntity: Entity,
    parentRecord: EntityRecord,
    depth: number,
  ) => Promise<boolean>,
  depth = 0,
  visiting = new Set<string>(),
): Promise<boolean> {
  if (depth >= MAX_PARENT_VISIBILITY_DEPTH) return false;
  const visitKey = `${entity.id}:${record.id}`;
  if (visiting.has(visitKey)) return false;
  visiting.add(visitKey);

  const links = findParentVisibilityLinks(entity, entities);
  for (const link of links) {
    const parentIds = parseEntityRelationIds(
      record.values[link.childLinkFieldId],
    );
    for (const parentId of parentIds) {
      if (!parentId) continue;
      const parentRecord = await getEntityRecordById(
        link.parentEntity,
        parentId,
      );
      if (!parentRecord) continue;
      if (await isParentVisible(link.parentEntity, parentRecord, depth + 1)) {
        return true;
      }
    }
  }
  return false;
}
