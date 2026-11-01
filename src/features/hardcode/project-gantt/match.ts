import type { Entity } from "@/entities/entity";

function normalizeName(value: string): string {
  return value.trim().toLocaleLowerCase("ru");
}

function entityMatches(
  entity: Pick<Entity, "id" | "name" | "namePlural">,
  keys: readonly string[],
): boolean {
  const candidates = [entity.id, entity.name, entity.namePlural]
    .map((value) => value.trim())
    .filter(Boolean);
  return keys.some((key) =>
    candidates.some((value) => normalizeName(value) === normalizeName(key)),
  );
}

export const PROJECT_GANTT_ENTITY_KEYS = ["Проекты", "Проект"] as const;

export function isProjectsEntity(
  entity: Pick<Entity, "id" | "name" | "namePlural">,
): boolean {
  return entityMatches(entity, PROJECT_GANTT_ENTITY_KEYS);
}

export function findProjectsEntity(entities: readonly Entity[]): Entity | null {
  return entities.find((entity) => isProjectsEntity(entity)) ?? null;
}
