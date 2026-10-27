import type { Entity } from "@/entities/entity";

/** Exact name / plural / id matches for DDS operations. */
const DDS_OPERATIONS_KEYS = [
  "ДДС",
  "Записи ДДС",
  "Операции ДДС",
  "Операции движения денежных средств",
] as const;

const DDS_EXCLUDE_KEYS = ["Статьи ДДС", "Уровни ДДС", "Кошельки"] as const;

function normalizeName(value: string): string {
  return value.trim().toLocaleLowerCase("ru");
}

/**
 * True when the entity is the DDS operations register (name-based hardcode).
 */
export function isDdsOperationsEntity(
  entity: Pick<Entity, "id" | "name" | "namePlural">,
): boolean {
  const candidates = [entity.id, entity.name, entity.namePlural]
    .map((value) => value.trim())
    .filter(Boolean);
  if (candidates.length === 0) return false;

  const excluded = new Set(DDS_EXCLUDE_KEYS.map(normalizeName));
  if (candidates.some((value) => excluded.has(normalizeName(value)))) {
    return false;
  }

  if (
    DDS_OPERATIONS_KEYS.some((key) =>
      candidates.some((value) => normalizeName(value) === normalizeName(key)),
    )
  ) {
    return true;
  }

  // Soft match: «…ДДС…» operations-like names (not articles / levels).
  return candidates.some((value) => {
    const name = normalizeName(value);
    if (!name.includes("ддс")) return false;
    return name.includes("операц") || name.includes("запис") || name === "ддс";
  });
}
