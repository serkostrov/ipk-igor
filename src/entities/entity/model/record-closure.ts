import { getEntityRelationTargetId } from "./field";
import { resolveRelationGroupsBridgeEntityId } from "./field-value";
import type { Entity } from "./types";

/**
 * Entity ids whose *records* a page needs loaded to render + compute correctly,
 * starting from the page's root entities.
 *
 * Page-scoped loading (path B): instead of shipping every record at startup, a
 * page declares its roots and we load the transitive set of entities their
 * records reference. Once that working set is present, the synchronous value
 * context resolves exactly as it does today.
 *
 * Edges followed (per entity already in the set):
 * - `relation` / `belonging` → the target entity (pickers need its candidates,
 *   labels need its names). `belonging` targets itself — harmless.
 * - `rollup` → the source entity (aggregation reads *all* its children).
 * - `relationGroups` → each level's entity (nested pickers).
 * - `lookup` via-chains → covered transitively: the bridge relation's target is
 *   pulled by the relation edge, and its own relation fields are walked when the
 *   target entity is processed.
 * - tab-linked sub-entities (`tab.linkedEntityId`) and `tableNestedEntityId` →
 *   entities rendered inline on the record / table page.
 *
 * This is a *transitive* closure over those edges: a page whose graph reaches
 * most of the schema genuinely needs it (no regression vs. today), while a page
 * on an isolated entity loads only a handful. Bounding the depth is a later
 * tuning knob — correctness first.
 */
export function resolveEntityRecordClosure(
  rootIds: readonly string[],
  entities: readonly Entity[],
): Set<string> {
  const byId = new Map(entities.map((entity) => [entity.id, entity]));
  const closure = new Set<string>();
  const queue: string[] = [];

  const enqueue = (id: string | null | undefined) => {
    if (!id) return;
    if (closure.has(id)) return;
    if (!byId.has(id)) return; // Dangling reference — nothing to load.
    closure.add(id);
    queue.push(id);
  };

  for (const id of rootIds) enqueue(id);

  while (queue.length > 0) {
    const entity = byId.get(queue.shift()!)!;

    for (const field of entity.fields) {
      if (field.type === "relation" || field.type === "belonging") {
        enqueue(getEntityRelationTargetId(field));
      } else if (field.type === "rollup" && field.rollup) {
        enqueue(field.rollup.sourceEntityId);
      } else if (field.type === "relationGroups" && field.relationGroups) {
        // Two nesting levels (rows = depth 0, nested = depth 1).
        for (let depth = 0; depth < field.relationGroups.levels.length; depth++) {
          enqueue(resolveRelationGroupsBridgeEntityId(field, entities, depth));
        }
      }
    }

    enqueue(entity.tableNestedEntityId);
    for (const tab of entity.tabs) {
      if (tab.kind === "entity") enqueue(tab.linkedEntityId);
    }
  }

  return closure;
}
