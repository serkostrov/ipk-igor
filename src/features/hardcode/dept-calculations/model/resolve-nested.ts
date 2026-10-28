import {
  getEntityTableNestedTargets,
  resolveEntityTableNestedTarget,
  type Entity,
  type EntityTableNestedTarget,
} from "@/entities/entity";

function normalizeName(value: string): string {
  return value.trim().toLocaleLowerCase("ru").replaceAll("ё", "е");
}

/** Nested «Подзадачи отдела» (or configured tableNestedEntityId). */
export function resolveDeptCalculationsNestedTarget(
  host: Entity,
  entities: readonly Entity[],
): EntityTableNestedTarget | null {
  const configured = resolveEntityTableNestedTarget(host, entities);
  if (configured) return configured;

  const targets = getEntityTableNestedTargets(host, entities);
  const byName = targets.find((item) => {
    const label = normalizeName(item.label);
    const entityName = normalizeName(item.entity.name);
    const plural = normalizeName(item.entity.namePlural);
    return (
      label.includes("подзадач") ||
      entityName.includes("подзадач") ||
      plural.includes("подзадач")
    );
  });
  return byName ?? targets[0] ?? null;
}
