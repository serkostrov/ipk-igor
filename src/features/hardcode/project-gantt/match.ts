import {
  isEntityTabWithLinkedEntity,
  type Entity,
  type EntityTab,
} from "@/entities/entity";

function normalizeName(value: string): string {
  return value.trim().toLocaleLowerCase("ru").replaceAll("ё", "е");
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

export const PROJECT_GANTT_TASKS_ENTITY_KEYS = ["Задачи", "Задача"] as const;

export function isProjectsEntity(
  entity: Pick<Entity, "id" | "name" | "namePlural">,
): boolean {
  return entityMatches(entity, PROJECT_GANTT_ENTITY_KEYS);
}

export function isProjectTasksEntity(
  entity: Pick<Entity, "id" | "name" | "namePlural">,
): boolean {
  return entityMatches(entity, PROJECT_GANTT_TASKS_ENTITY_KEYS);
}

export function findProjectsEntity(entities: readonly Entity[]): Entity | null {
  return entities.find((entity) => isProjectsEntity(entity)) ?? null;
}

export type ProjectGanttTasksLink = {
  tasksEntity: Entity;
  tab: EntityTab | null;
};

/** Prefer Projects tab «Задачи»; fall back to name match / child entity. */
export function findProjectTasksLinkedEntity(
  projectEntity: Entity,
  entities: readonly Entity[],
): ProjectGanttTasksLink | null {
  for (const tab of projectEntity.tabs) {
    if (!isEntityTabWithLinkedEntity(tab) || !tab.linkedEntityId) continue;
    const linked =
      entities.find((item) => item.id === tab.linkedEntityId) ?? null;
    if (!linked) continue;
    const tabName = normalizeName(tab.name);
    if (isProjectTasksEntity(linked) || tabName.includes("задач")) {
      return { tasksEntity: linked, tab };
    }
  }

  const byParent =
    entities.find(
      (item) =>
        item.parentEntityId === projectEntity.id &&
        isProjectTasksEntity(item) &&
        item.id !== projectEntity.id,
    ) ?? null;
  if (byParent) return { tasksEntity: byParent, tab: null };

  const byName = entities.find((item) => isProjectTasksEntity(item)) ?? null;
  if (byName) return { tasksEntity: byName, tab: null };

  return null;
}
