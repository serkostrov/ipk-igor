/**
 * Optional client ACL for record mutations.
 * Wired from `entities/access` so the entity store can deny deletes without
 * importing the access layer (avoids a circular dependency).
 */

export type EntityRecordMutationAction = "create" | "update" | "delete";

type Guard = (entityId: string, action: EntityRecordMutationAction) => boolean;

let guard: Guard | null = null;

export function setEntityRecordMutationGuard(next: Guard | null) {
  guard = next;
}

/** When no guard is installed, allow (local/bootstrap). */
export function canMutateEntityRecord(
  entityId: string,
  action: EntityRecordMutationAction,
): boolean {
  if (!guard) return true;
  return guard(entityId, action);
}
