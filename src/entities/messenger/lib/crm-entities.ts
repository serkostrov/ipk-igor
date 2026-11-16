import type { Entity } from "@/entities/entity";

const CRM_ENTITY_SPECS = [
  {
    typeLabel: "Лид",
    names: ["Лид", "Лиды", "Lead", "Leads"],
  },
  {
    typeLabel: "Сделка",
    names: ["Сделка", "Сделки", "Deal", "Deals"],
  },
  {
    typeLabel: "Проект",
    names: ["Проект", "Проекты", "Project", "Projects"],
  },
  {
    typeLabel: "Договор",
    names: ["Договор", "Договоры", "Contract", "Contracts"],
  },
  {
    typeLabel: "ТКП",
    names: ["ТКП", "Разбор ТКП", "TKP"],
  },
] as const;

function normalizeName(value: string): string {
  return value.trim().toLocaleLowerCase("ru");
}

function entityNameMatches(
  entity: Pick<Entity, "id" | "name" | "namePlural">,
  keys: readonly string[],
): boolean {
  const candidates = [entity.id, entity.name, entity.namePlural]
    .map((value) => value.trim())
    .filter(Boolean)
    .map(normalizeName);
  return keys.some((key) => candidates.includes(normalizeName(key)));
}

export function getMessengerCrmTypeLabel(
  entity: Pick<Entity, "id" | "name" | "namePlural">,
): string | null {
  for (const spec of CRM_ENTITY_SPECS) {
    if (entityNameMatches(entity, spec.names)) return spec.typeLabel;
  }
  return null;
}

export function isMessengerCrmEntity(
  entity: Pick<Entity, "id" | "name" | "namePlural">,
): boolean {
  return getMessengerCrmTypeLabel(entity) != null;
}

export function formatMessengerCrmChatTitle(
  entity: Pick<Entity, "id" | "name" | "namePlural">,
  recordTitle: string,
): string {
  const typeLabel = getMessengerCrmTypeLabel(entity) ?? entity.name;
  const name = recordTitle.trim() || "Без названия";
  return `${typeLabel} — ${name}`;
}

export function getMessengerCrmNavigateLabel(
  entity: Pick<Entity, "id" | "name" | "namePlural">,
): string {
  const typeLabel = getMessengerCrmTypeLabel(entity);
  if (!typeLabel) return "Перейти к записи";
  if (typeLabel === "ТКП") return "Перейти к ТКП";
  return `Перейти к ${typeLabel.toLocaleLowerCase("ru")}`;
}
