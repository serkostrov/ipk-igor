import { isEntityInternal, type Entity } from "@/entities/entity";
import {
  addMenuGroup,
  getMenuConfig,
  getMenuEntryLocation,
  moveMenuEntry,
  syncEntityMenuItems,
  updateMenuGroup,
  updateMenuItem,
  type MenuConfig,
  type MenuEntry,
  type MenuIconName,
} from "@/entities/menu";

function findGroup(entries: MenuEntry[], title: string): MenuEntry | null {
  for (const entry of entries) {
    if (entry.type !== "group") continue;
    if (entry.title === title) return entry;
    const nested = findGroup(entry.entries, title);
    if (nested) return nested;
  }
  return null;
}

function ensureGroup(title: string, icon: MenuIconName): string {
  const existing = findGroup(getMenuConfig().entries, title);
  if (existing && existing.type === "group") {
    if (existing.icon !== icon) {
      updateMenuGroup(existing.id, { icon });
    }
    return existing.id;
  }
  return addMenuGroup(title, icon);
}

function entByName(entities: Entity[], key: string) {
  return (
    entities.find(
      (entity) =>
        entity.id === key || entity.namePlural === key || entity.name === key,
    ) ?? null
  );
}

function reorderInGroup(
  groupId: string,
  ids: string[],
  nestGroupId: string | null,
) {
  for (const [index, id] of ids.entries()) {
    const current = getMenuEntryLocation(id);
    if (!current) continue;
    moveMenuEntry(current, { parentGroupId: groupId, index });
  }
  if (nestGroupId) {
    const nested = getMenuEntryLocation(nestGroupId);
    if (nested) {
      moveMenuEntry(nested, {
        parentGroupId: groupId,
        index: ids.length,
      });
    }
  }
}

type ItemSpec = {
  key: string;
  label: string;
  icon: MenuIconName;
  group: "commercial" | "commercialDict" | "finance" | "financeDict";
};

const ITEMS: ItemSpec[] = [
  { key: "Лиды", label: "Лиды", icon: "target", group: "commercial" },
  {
    key: "Договоры",
    label: "Договоры",
    icon: "file-text",
    group: "commercial",
  },
  { key: "Сделки", label: "Сделки", icon: "briefcase", group: "commercial" },
  {
    key: "Задачи менеджеров",
    label: "Задачи менеджеров",
    icon: "clipboard",
    group: "commercial",
  },
  { key: "Планы", label: "Планы", icon: "pie-chart", group: "commercial" },
  {
    key: "Контрагенты",
    label: "Контрагенты",
    icon: "building",
    group: "commercialDict",
  },
  {
    key: "Контакты",
    label: "Контакты",
    icon: "users",
    group: "commercialDict",
  },
  {
    key: "Юрлица",
    label: "Юрлица",
    icon: "landmark",
    group: "commercialDict",
  },
  {
    key: "Направления",
    label: "Направления",
    icon: "layers",
    group: "commercialDict",
  },
  {
    key: "Записи ДДС",
    label: "Операции ДДС",
    icon: "wallet",
    group: "finance",
  },
  {
    key: "Плановые поступления",
    label: "Плановые поступления",
    icon: "calendar",
    group: "finance",
  },
  {
    key: "Плановые выбытия",
    label: "Плановые выбытия",
    icon: "calendar",
    group: "finance",
  },
  {
    key: "Заявки на оплату",
    label: "Реестр заявок",
    icon: "file-text",
    group: "finance",
  },
  { key: "Акты", label: "Акты", icon: "file-text", group: "finance" },
  {
    key: "Заявки ПБК",
    label: "Заявки ПБК",
    icon: "clipboard",
    group: "finance",
  },
  { key: "Кошельки", label: "Кошельки", icon: "wallet", group: "financeDict" },
  {
    key: "Статьи ДДС",
    label: "Статьи ДДС",
    icon: "layers",
    group: "financeDict",
  },
  {
    key: "Уровни ДДС",
    label: "Уровни ДДС",
    icon: "list",
    group: "financeDict",
  },
  {
    key: "Типы платежей",
    label: "Типы платежей",
    icon: "credit-card",
    group: "financeDict",
  },
  {
    key: "Банковские счета",
    label: "Банковские счета",
    icon: "landmark",
    group: "financeDict",
  },
  {
    key: "Подразделения ПБК",
    label: "Подразделения ПБК",
    icon: "building",
    group: "financeDict",
  },
  {
    key: "Типы заявок ПБК",
    label: "Типы заявок ПБК",
    icon: "hash",
    group: "financeDict",
  },
];

/**
 * Rebuild ПБК → commercial/finance nesting from entity names.
 * Safe to run multiple times; only rearranges known entities.
 */
export function restoreDepartmentMenu(entities: Entity[]): string[] {
  const log: string[] = [];
  const roots = entities.filter(
    (entity) => !entity.parentEntityId && !isEntityInternal(entity),
  );
  const nestedDictKeys = ["Кошельки", "Банковские счета"];
  const nested = nestedDictKeys
    .map((key) => entByName(entities, key))
    .filter((entity): entity is Entity => entity != null)
    .filter((entity) => !roots.some((root) => root.id === entity.id));

  syncEntityMenuItems([
    ...roots.map((entity) => ({
      id: entity.id,
      label: entity.namePlural || entity.name,
    })),
    ...nested.map((entity) => ({
      id: entity.id,
      label: entity.namePlural || entity.name,
    })),
  ]);

  const pbkId = ensureGroup("ПБК", "graduation-cap");
  const commercialId = ensureGroup("Коммерческий отдел", "hand-coins");
  const commercialDictId = ensureGroup("Справочники", "book-open");
  const financeId = ensureGroup("Финансовый отдел", "wallet");
  const financeDictId = ensureGroup("Справочники финансов", "book-open");
  const paramsId = ensureGroup("Параметры", "wrench");
  updateMenuGroup(paramsId, { internal: true });

  for (const [groupId, index] of [
    [commercialId, 0],
    [financeId, 1],
  ] as const) {
    const loc = getMenuEntryLocation(groupId);
    if (!loc) continue;
    moveMenuEntry(loc, { parentGroupId: pbkId, index });
  }

  const groupIds = {
    commercial: commercialId,
    commercialDict: commercialDictId,
    finance: financeId,
    financeDict: financeDictId,
  } as const;

  const orders: Record<keyof typeof groupIds, string[]> = {
    commercial: [],
    commercialDict: [],
    finance: [],
    financeDict: [],
  };

  for (const spec of ITEMS) {
    const entity = entByName(entities, spec.key);
    if (!entity) continue;
    const groupId = groupIds[spec.group];
    updateMenuItem(entity.id, {
      label: spec.label,
      icon: spec.icon,
      groupId,
    });
    orders[spec.group].push(entity.id);
  }

  // Юрлица may appear in both lists — keep finance dict placement if present.
  const legal = entByName(entities, "Юрлица");
  if (legal && !orders.financeDict.includes(legal.id)) {
    // already handled via commercialDict when listed there
  }

  reorderInGroup(commercialId, orders.commercial, commercialDictId);
  reorderInGroup(commercialDictId, orders.commercialDict, null);
  const paramsLoc = getMenuEntryLocation(paramsId);
  if (paramsLoc) {
    moveMenuEntry(paramsLoc, {
      parentGroupId: commercialId,
      index: orders.commercial.length + 1,
    });
  }
  reorderInGroup(financeId, orders.finance, financeDictId);
  reorderInGroup(financeDictId, orders.financeDict, null);

  log.push("Восстановлена структура меню ПБК / коммерция / финансы");
  return log;
}

export function menuLooksUnnested(config: MenuConfig): boolean {
  const commercial = findGroup(config.entries, "Коммерческий отдел");
  if (!commercial || commercial.type !== "group") return false;
  const hasEntityChild = commercial.entries.some(
    (entry) => entry.type === "item",
  );
  return !hasEntityChild;
}
