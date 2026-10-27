import type { Entity } from "@/entities/entity";

/** Menu / entity names used for DDS operations (see restore-department-menu). */
const DDS_OPERATIONS_KEYS = ["Записи ДДС", "Операции ДДС"] as const;

/**
 * True when the entity is the DDS operations register (name-based hardcode).
 */
export function isDdsOperationsEntity(
  entity: Pick<Entity, "id" | "name" | "namePlural">,
): boolean {
  const candidates = [entity.id, entity.name, entity.namePlural]
    .map((value) => value.trim())
    .filter(Boolean);
  return DDS_OPERATIONS_KEYS.some((key) => candidates.includes(key));
}
