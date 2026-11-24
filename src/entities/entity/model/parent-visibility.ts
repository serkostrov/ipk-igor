import { getEntityRecordById } from "./record-queries";
import { getEntityRelationTargetId, parseEntityRelationIds } from "./field";
import type { Entity, EntityRecord } from "./types";

export type ParentVisibilityLink = {
  parentEntity: Entity;
  /** Field on the child that stores the parent record id(s). */
  childLinkFieldId: string;
};

/**
 * How a child entity attaches to parents for view-inheritance:
 * - parent tabs `kind: "entity"` with `parentLinkFieldId`
 * - `parentEntityId` + belonging/relation on the child to that parent
 */
export function findParentVisibilityLinks(
  childEntity: Entity,
  entities: readonly Entity[],
): ParentVisibilityLink[] {
  const links: ParentVisibilityLink[] = [];
  const seen = new Set<string>();

  const add = (parentEntity: Entity, childLinkFieldId: string) => {
    const field = childEntity.fields.find(
      (item) => item.id === childLinkFieldId,
    );
    if (!field) return;
    if (field.type !== "relation" && field.type !== "belonging") return;
    const key = `${parentEntity.id}:${childLinkFieldId}`;
    if (seen.has(key)) return;
    seen.add(key);
    links.push({ parentEntity, childLinkFieldId });
  };

  for (const parent of entities) {
    for (const tab of parent.tabs) {
      if (tab.kind !== "entity") continue;
      if (tab.linkedEntityId !== childEntity.id) continue;
      const fieldId = tab.parentLinkFieldId?.trim();
      if (!fieldId) continue;
      add(parent, fieldId);
    }
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
