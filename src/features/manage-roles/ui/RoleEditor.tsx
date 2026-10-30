import {
  createElement,
  Fragment,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Switch } from "@/shared/ui/switch";
import { Textarea } from "@/shared/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { cn } from "@/shared/lib/cn";
import {
  DATA_SCOPE_LABELS,
  SETTINGS_TAB_IDS,
  createEmptyEntityAccess,
  createFullEntityAccess,
  isDataScope,
  type DataScope,
  type EntityAccess,
  type FieldAccess,
  type Role,
  type SettingsTabId,
} from "@/entities/access";
import {
  ConditionBuilder,
  findLegalEntitiesEntity,
  getEntityFieldDisplayName,
  getRelationRecordOptions,
  parseEntityRelationIds,
  RelationSelect,
  serializeEntityRelationIds,
  useEntityConfig,
  type Entity,
  type EntityCondition,
} from "@/entities/entity";
import {
  flattenMenuGroupItems,
  getMenuEntityTree,
  getMenuIcon,
  useMenuConfig,
  type MenuEntityTreeNode,
  type MenuEntry,
  type MenuIconName,
  type MenuItem,
} from "@/entities/menu";

const SETTINGS_TAB_LABELS: Record<SettingsTabId, string> = {
  menu: "Меню",
  entities: "Сущности",
  automations: "Автоматизации",
  notifications: "Уведомления",
  roles: "Роли",
};

/** Automations are configured in the Entities table, not here. */
const SETTINGS_TABS_IN_UI = SETTINGS_TAB_IDS.filter(
  (tab) => tab !== "automations",
);

type RoleEditorProps = {
  role: Role;
  onChange: (role: Role) => void;
};

function PermissionCell({ children }: { children: ReactNode }) {
  return <td className="px-3 py-2">{children}</td>;
}

function PermissionDash() {
  return (
    <span className="text-xs text-muted-foreground/60" aria-hidden>
      —
    </span>
  );
}

function hasSettingsTab(role: Role, tab: SettingsTabId): boolean {
  const tabs = role.permissions.settingsTabs;
  return tabs === "*" || tabs.includes(tab);
}

function withSettingsTab(
  role: Role,
  tab: SettingsTabId,
  enabled: boolean,
): Role {
  if (role.permissions.settingsTabs === "*") {
    if (enabled) return role;
    return patchPermissions(role, {
      settingsTabs: SETTINGS_TAB_IDS.filter((item) => item !== tab),
    });
  }
  const current = role.permissions.settingsTabs;
  return patchPermissions(role, {
    settingsTabs: enabled
      ? [...new Set([...current, tab])]
      : current.filter((item) => item !== tab),
  });
}

function ToggleRow({
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {description ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}

function collectMenuItems(entries: MenuEntry[]): MenuItem[] {
  const items: MenuItem[] = [];
  for (const entry of entries) {
    if (entry.type === "item") {
      items.push({
        id: entry.id,
        label: entry.label,
        icon: entry.icon,
      });
      continue;
    }
    items.push(...flattenMenuGroupItems(entry));
  }
  return items;
}

type MenuAccessViewMode = "tree" | "flat";

type MenuAccessRow =
  | {
      type: "group";
      id: string;
      title: string;
      icon: MenuIconName;
      depth: number;
      internal: boolean;
      itemIds: string[];
    }
  | {
      type: "item";
      item: MenuItem;
      depth: number;
    };

function buildMenuAccessRows(
  entries: MenuEntry[],
  depth: number,
  mode: MenuAccessViewMode,
): MenuAccessRow[] {
  if (mode === "flat") {
    return collectMenuItems(entries).map((item) => ({
      type: "item" as const,
      item,
      depth: 0,
    }));
  }

  const rows: MenuAccessRow[] = [];
  for (const entry of entries) {
    if (entry.type === "item") {
      rows.push({ type: "item", item: entry, depth });
      continue;
    }
    const itemIds = flattenMenuGroupItems(entry).map((item) => item.id);
    rows.push({
      type: "group",
      id: entry.id,
      title: entry.title,
      icon: entry.icon,
      depth,
      internal: entry.internal === true,
      itemIds,
    });
    rows.push(...buildMenuAccessRows(entry.entries, depth + 1, "tree"));
  }
  return rows;
}

function MenuAccessIcon({
  name,
  className,
}: {
  name: MenuIconName;
  className?: string;
}) {
  return createElement(getMenuIcon(name), {
    className: cn("size-3.5 shrink-0", className),
    "aria-hidden": true,
  });
}

function MenuAccessList({
  entries,
  menuAll,
  menuFlat,
  selectedIds,
  onToggleAll,
  onMenuFlatChange,
  onToggleItem,
  onToggleItems,
}: {
  entries: MenuEntry[];
  menuAll: boolean;
  menuFlat: boolean;
  selectedIds: string[];
  onToggleAll: (checked: boolean) => void;
  onMenuFlatChange: (flat: boolean) => void;
  onToggleItem: (itemId: string, checked: boolean) => void;
  onToggleItems: (itemIds: string[], checked: boolean) => void;
}) {
  const viewMode: MenuAccessViewMode = menuFlat ? "flat" : "tree";
  const rows = useMemo(
    () => buildMenuAccessRows(entries, 0, viewMode),
    [entries, viewMode],
  );
  const allItems = useMemo(() => collectMenuItems(entries), [entries]);

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/20 px-3 py-2">
        <p className="text-[11px] text-muted-foreground">
          {viewMode === "tree"
            ? "В боковом меню — папки и пункты"
            : "В боковом меню — плоский список без папок"}
        </p>
        <div
          className="inline-flex rounded-lg border border-border/80 bg-background p-0.5"
          role="group"
          aria-label="Отображение меню для роли"
        >
          <button
            type="button"
            className={cn(
              "rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
              viewMode === "tree"
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
            aria-pressed={viewMode === "tree"}
            onClick={() => onMenuFlatChange(false)}
          >
            Как в меню
          </button>
          <button
            type="button"
            className={cn(
              "rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
              viewMode === "flat"
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
            aria-pressed={viewMode === "flat"}
            onClick={() => onMenuFlatChange(true)}
          >
            Без папок
          </button>
        </div>
      </div>

      <div className="divide-y divide-border px-3.5">
        <ToggleRow
          label="Все пункты меню"
          description="Иначе отметьте пункты ниже"
          checked={menuAll}
          onCheckedChange={onToggleAll}
        />

        {!menuAll
          ? rows.map((row) => {
              if (row.type === "group") {
                const enabledCount = row.itemIds.filter((id) =>
                  selectedIds.includes(id),
                ).length;
                const allOn =
                  row.itemIds.length > 0 && enabledCount === row.itemIds.length;
                const someOn = enabledCount > 0 && !allOn;
                return (
                  <div
                    key={`group-${row.id}`}
                    className="flex items-center justify-between gap-3 py-2"
                    style={{
                      paddingLeft: 4 + Math.min(row.depth, 4) * 14,
                    }}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className={cn(
                          "flex size-7 shrink-0 items-center justify-center rounded-md border",
                          row.internal
                            ? "border-dashed border-border/70 bg-muted/30 text-muted-foreground"
                            : "border-border/70 bg-muted/40 text-muted-foreground",
                        )}
                      >
                        <MenuAccessIcon name={row.icon} />
                      </span>
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <p className="truncate text-sm font-medium text-foreground">
                            {row.title}
                          </p>
                          {row.internal ? (
                            <span className="rounded px-1 py-px text-[9px] font-medium tracking-wide text-muted-foreground uppercase">
                              служ.
                            </span>
                          ) : null}
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          Папка · {row.itemIds.length}{" "}
                          {row.itemIds.length === 1
                            ? "пункт"
                            : row.itemIds.length < 5
                              ? "пункта"
                              : "пунктов"}
                          {someOn ? ` · выбрано ${enabledCount}` : ""}
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={allOn}
                      disabled={row.itemIds.length === 0}
                      onCheckedChange={(checked) =>
                        onToggleItems(row.itemIds, checked)
                      }
                    />
                  </div>
                );
              }

              const checked = selectedIds.includes(row.item.id);
              return (
                <div
                  key={row.item.id}
                  className="flex items-center justify-between gap-3 py-2"
                  style={{
                    paddingLeft: 4 + Math.min(row.depth, 4) * 14,
                  }}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border/60 bg-card text-muted-foreground">
                      <MenuAccessIcon name={row.item.icon} />
                    </span>
                    <p className="truncate text-sm font-medium text-foreground">
                      {row.item.label}
                    </p>
                  </div>
                  <Switch
                    checked={checked}
                    onCheckedChange={(next) => onToggleItem(row.item.id, next)}
                  />
                </div>
              );
            })
          : null}

        {menuAll ? (
          <p className="py-3 text-xs text-muted-foreground">
            Доступны все {allItems.length} пунктов меню
            {viewMode === "tree" ? " (включая вложенные в папки)" : ""}.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function patchPermissions(
  role: Role,
  patch: Partial<Role["permissions"]>,
): Role {
  return {
    ...role,
    permissions: { ...role.permissions, ...patch },
  };
}

function getEntityAccessList(role: Role, entities: Entity[]): EntityAccess[] {
  if (role.permissions.entities === "*") {
    return entities.map((entity) => createFullEntityAccess(entity.id));
  }
  const byId = new Map(
    role.permissions.entities.map((item) => [item.entityId, item]),
  );
  return entities.map(
    (entity) => byId.get(entity.id) ?? createEmptyEntityAccess(entity.id),
  );
}

/** Same grouping as EntityMenuSelect: menu tree + leftovers «Вне меню». */
type EntityAccessTableRow =
  | { type: "group"; id: string; title: string; depth: number }
  | { type: "entity"; entity: Entity; depth: number };

function resolveMenuEntityRows(
  nodes: MenuEntityTreeNode[],
  byId: Map<string, Entity>,
  seen: Set<string>,
  depth: number,
): EntityAccessTableRow[] {
  const rows: EntityAccessTableRow[] = [];
  for (const node of nodes) {
    if (node.type === "entity") {
      const entity = byId.get(node.entityId);
      if (!entity || seen.has(entity.id)) {
        rows.push(...resolveMenuEntityRows(node.children, byId, seen, depth));
        continue;
      }
      seen.add(entity.id);
      rows.push({ type: "entity", entity, depth });
      rows.push(...resolveMenuEntityRows(node.children, byId, seen, depth + 1));
      continue;
    }
    const children = resolveMenuEntityRows(
      node.children,
      byId,
      seen,
      depth + 1,
    );
    if (children.length === 0) continue;
    rows.push({ type: "group", id: node.id, title: node.title, depth });
    rows.push(...children);
  }
  return rows;
}

function buildEntityAccessTableRows(
  entities: Entity[],
  menuEntries: MenuEntry[],
): EntityAccessTableRow[] {
  const byId = new Map(entities.map((entity) => [entity.id, entity]));
  const seen = new Set<string>();
  const rows = resolveMenuEntityRows(
    getMenuEntityTree(menuEntries),
    byId,
    seen,
    0,
  );
  const leftovers = entities.filter((entity) => !seen.has(entity.id));
  if (leftovers.length > 0) {
    rows.push({
      type: "group",
      id: "outside-menu",
      title: "Вне меню",
      depth: 0,
    });
    for (const entity of leftovers) {
      rows.push({ type: "entity", entity, depth: 1 });
    }
  }
  return rows;
}

function rowIndent(depth: number) {
  if (depth <= 0) return undefined;
  return { paddingLeft: Math.min(depth, 4) * 12 };
}

function withScope(
  access: EntityAccess,
  scope: DataScope,
): Partial<EntityAccess> {
  if (scope === "filter") {
    return {
      scope,
      scopeFilter: access.scopeFilter ?? [],
    };
  }
  return {
    scope,
    scopeFilter: undefined,
  };
}

function ScopeFilterPanel({
  entity,
  entities,
  conditions,
  onChange,
  title = "Условия видимости записей",
  description = "Роль видит только записи, у которых все условия выполнены. Без условий записи не показываются.",
}: {
  entity: Entity;
  entities: Entity[];
  conditions: EntityCondition[];
  onChange: (conditions: EntityCondition[]) => void;
  title?: string;
  description?: string;
}) {
  return (
    <div className="space-y-2 rounded-lg border border-border/70 bg-muted/15 p-3">
      <div>
        <p className="text-xs font-medium text-foreground">{title}</p>
        <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
          {description}
        </p>
      </div>
      <ConditionBuilder
        entity={entity}
        entities={entities}
        conditions={conditions}
        onChange={onChange}
      />
      {conditions.length === 0 ? (
        <p className="text-[11px] text-amber-700 dark:text-amber-400">
          Добавьте хотя бы одно условие
        </p>
      ) : null}
    </div>
  );
}

export function RoleEditor({ role, onChange }: RoleEditorProps) {
  const { entries } = useMenuConfig();
  const { entities } = useEntityConfig();
  const menuItems = useMemo(() => collectMenuItems(entries), [entries]);
  const entityTableRows = useMemo(
    () => buildEntityAccessTableRows(entities, entries),
    [entities, entries],
  );
  const [fieldsEntityId, setFieldsEntityId] = useState<string>(
    entities[0]?.id ?? "",
  );

  const entitiesAll = role.permissions.entities === "*";
  const menuAll = role.permissions.menuItemIds === "*";
  const settingsAll = role.permissions.settingsTabs === "*";
  const entityAccessList = getEntityAccessList(role, entities);
  const accessByEntityId = useMemo(() => {
    const map = new Map<string, EntityAccess>();
    for (const item of entityAccessList) {
      map.set(item.entityId, item);
    }
    return map;
  }, [entityAccessList]);
  const fieldsEntity =
    entities.find((entity) => entity.id === fieldsEntityId) ?? entities[0];
  const fieldsAccess = fieldsEntity
    ? (accessByEntityId.get(fieldsEntity.id) ?? null)
    : null;
  const legalEntitiesEntity = useMemo(
    () => findLegalEntitiesEntity(entities),
    [entities],
  );
  const legalEntityOptions = useMemo(
    () => getRelationRecordOptions(legalEntitiesEntity, entities),
    [legalEntitiesEntity, entities],
  );
  const legalEntityValue = serializeEntityRelationIds(
    role.permissions.legalEntityIds ?? [],
  );

  const updateEntityAccess = (
    entityId: string,
    patch: Partial<EntityAccess>,
  ) => {
    const merge = (base: EntityAccess): EntityAccess => {
      const next: EntityAccess = { ...base, ...patch };
      if (patch.scopeFilter === undefined && "scopeFilter" in patch) {
        delete next.scopeFilter;
      }
      if (next.scope !== "filter") {
        delete next.scopeFilter;
      }
      return next;
    };
    if (entitiesAll) {
      const list = entities.map((entity) => {
        const base = createFullEntityAccess(entity.id);
        return entity.id === entityId ? merge(base) : base;
      });
      onChange(patchPermissions(role, { entities: list }));
      return;
    }
    const list = entityAccessList.map((item) =>
      item.entityId === entityId ? merge(item) : item,
    );
    onChange(patchPermissions(role, { entities: list }));
  };

  const setFieldAccess = (
    entityId: string,
    fieldId: string,
    patch: Partial<FieldAccess>,
  ) => {
    const current =
      entityAccessList.find((item) => item.entityId === entityId) ??
      createEmptyEntityAccess(entityId);
    const entity = entities.find((item) => item.id === entityId);
    let fields: Record<string, FieldAccess>;
    if (current.fields === "*") {
      fields = Object.fromEntries(
        (entity?.fields ?? []).map((field) => [
          field.id,
          { view: true, edit: true },
        ]),
      );
    } else {
      fields = { ...current.fields };
    }
    fields[fieldId] = {
      view: fields[fieldId]?.view ?? false,
      edit: fields[fieldId]?.edit ?? false,
      ...patch,
    };
    updateEntityAccess(entityId, { fields });
  };

  const grantAllFields = (entityId: string, enabled: boolean) => {
    const entity = entities.find((item) => item.id === entityId);
    if (!entity) return;
    if (enabled) {
      updateEntityAccess(entityId, { fields: "*" });
      return;
    }
    updateEntityAccess(entityId, { fields: {} });
  };

  return (
    <div className="flex flex-col gap-8">
      <section className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="role-name">Название</Label>
          <Input
            id="role-name"
            value={role.name}
            onChange={(event) =>
              onChange({ ...role, name: event.target.value })
            }
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="role-description">Описание</Label>
          <Textarea
            id="role-description"
            value={role.description}
            onChange={(event) =>
              onChange({ ...role, description: event.target.value })
            }
            rows={2}
          />
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            Видимость по юрлицам
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            «Вижу только» выбранные юрлица. Пустой список — без ограничения.
            Ограничение применяется к записям сущностей, связанных с юрлицом
            (напрямую или через принадлежность).
          </p>
        </div>
        {legalEntitiesEntity ? (
          <div className="space-y-2 rounded-xl border border-border p-4">
            <Label htmlFor="role-legal-entities">Юрлица</Label>
            <RelationSelect
              id="role-legal-entities"
              multiple
              options={legalEntityOptions}
              value={legalEntityValue}
              placeholder="Все юрлица"
              aria-label="Юрлица роли"
              onChange={(value) =>
                onChange(
                  patchPermissions(role, {
                    legalEntityIds: parseEntityRelationIds(value),
                  }),
                )
              }
            />
            {(role.permissions.legalEntityIds ?? []).length > 0 ? (
              <p className="text-[11px] text-muted-foreground">
                Выбрано: {(role.permissions.legalEntityIds ?? []).length}. Новые
                юрлица из каталога «
                {legalEntitiesEntity.namePlural.trim() ||
                  legalEntitiesEntity.name}
                » появятся в этом списке автоматически.
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                Ограничение выключено — роль видит записи всех юрлиц.
              </p>
            )}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-border px-4 py-3 text-xs text-muted-foreground">
            Создайте сущность «Юрлица», чтобы ограничивать видимость записей по
            компаниям.
          </p>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Разделы</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Что видит пользователь в меню и системных разделах
          </p>
        </div>

        <MenuAccessList
          entries={entries}
          menuAll={menuAll}
          menuFlat={role.permissions.menuFlat === true}
          selectedIds={
            role.permissions.menuItemIds === "*"
              ? menuItems.map((item) => item.id)
              : role.permissions.menuItemIds
          }
          onToggleAll={(checked) =>
            onChange(
              patchPermissions(role, {
                menuItemIds: checked ? "*" : menuItems.map((item) => item.id),
              }),
            )
          }
          onMenuFlatChange={(flat) =>
            onChange(patchPermissions(role, { menuFlat: flat }))
          }
          onToggleItem={(itemId, checked) => {
            const current =
              role.permissions.menuItemIds === "*"
                ? menuItems.map((item) => item.id)
                : [...role.permissions.menuItemIds];
            const ids = checked
              ? [...new Set([...current, itemId])]
              : current.filter((id) => id !== itemId);
            onChange(patchPermissions(role, { menuItemIds: ids }));
          }}
          onToggleItems={(itemIds, checked) => {
            const current =
              role.permissions.menuItemIds === "*"
                ? menuItems.map((item) => item.id)
                : [...role.permissions.menuItemIds];
            const ids = checked
              ? [...new Set([...current, ...itemIds])]
              : current.filter((id) => !itemIds.includes(id));
            onChange(patchPermissions(role, { menuItemIds: ids }));
          }}
        />

        <div className="divide-y divide-border rounded-xl border border-border px-4">
          <div className="py-2.5">
            <p className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
              Системные
            </p>
          </div>
          <ToggleRow
            label="История изменений"
            checked={role.permissions.canAccessHistory}
            onCheckedChange={(checked) =>
              onChange(patchPermissions(role, { canAccessHistory: checked }))
            }
          />
          <ToggleRow
            label="Уведомления"
            checked={role.permissions.canAccessNotifications}
            onCheckedChange={(checked) =>
              onChange(
                patchPermissions(role, {
                  canAccessNotifications: checked,
                }),
              )
            }
          />
          <ToggleRow
            label="Приглашать пользователей"
            description="Создание аккаунтов в сущности Пользователи"
            checked={role.permissions.canInviteUsers}
            onCheckedChange={(checked) =>
              onChange(patchPermissions(role, { canInviteUsers: checked }))
            }
          />
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Настройки</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Вкладки страницы «Настройки». Пустой список скрывает раздел.
          </p>
        </div>
        <div className="divide-y divide-border rounded-xl border border-border px-4">
          <ToggleRow
            label="Все вкладки настроек"
            checked={settingsAll}
            onCheckedChange={(checked) =>
              onChange(
                patchPermissions(role, {
                  settingsTabs: checked ? "*" : [...SETTINGS_TAB_IDS],
                }),
              )
            }
          />
          {!settingsAll
            ? SETTINGS_TABS_IN_UI.map((tab) => {
                const checked = role.permissions.settingsTabs.includes(tab);
                return (
                  <ToggleRow
                    key={tab}
                    label={SETTINGS_TAB_LABELS[tab]}
                    checked={checked}
                    onCheckedChange={(next) => {
                      const current =
                        role.permissions.settingsTabs === "*"
                          ? [...SETTINGS_TAB_IDS]
                          : [...role.permissions.settingsTabs];
                      const tabs = next
                        ? [...new Set([...current, tab])]
                        : current.filter((item) => item !== tab);
                      onChange(patchPermissions(role, { settingsTabs: tabs }));
                    }}
                  />
                );
              })
            : null}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Сущности</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              CRUD и область данных: все записи, только свои или фильтр по
              полям. У заданий автоматизации — та же область: кто какие задания
              видит.
            </p>
          </div>
          <ToggleRow
            label="Все сущности (полный доступ)"
            checked={entitiesAll}
            onCheckedChange={(checked) =>
              onChange(
                patchPermissions(role, {
                  entities: checked
                    ? "*"
                    : entities.map((entity) =>
                        createFullEntityAccess(entity.id),
                      ),
                }),
              )
            }
          />
        </div>

        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Сущность</th>
                <th className="px-3 py-2 font-medium">Чтение</th>
                <th className="px-3 py-2 font-medium">Создание</th>
                <th className="px-3 py-2 font-medium">Изменение</th>
                <th className="px-3 py-2 font-medium">Удаление</th>
                <th className="px-3 py-2 font-medium">Область</th>
              </tr>
            </thead>
            <tbody>
              {entitiesAll ? (
                <tr className="border-b border-border">
                  <td
                    colSpan={6}
                    className="px-3 py-2.5 text-xs text-muted-foreground"
                  >
                    Полный доступ ко всем сущностям данных
                  </td>
                </tr>
              ) : (
                entityTableRows.map((row) => {
                  if (row.type === "group") {
                    return (
                      <tr
                        key={`group-${row.id}`}
                        className="border-b border-border bg-muted/25"
                      >
                        <td
                          colSpan={6}
                          className="px-3 py-1.5 text-[11px] font-medium tracking-wide text-muted-foreground"
                        >
                          <span
                            className="block truncate"
                            style={rowIndent(row.depth)}
                          >
                            {row.title}
                          </span>
                        </td>
                      </tr>
                    );
                  }

                  const access = accessByEntityId.get(row.entity.id);
                  if (!access) return null;
                  const filterOpen = access.scope === "filter";

                  return (
                    <Fragment key={row.entity.id}>
                      <tr className="border-b border-border">
                        <td className="px-3 py-2 font-medium">
                          <span
                            className="block truncate"
                            style={rowIndent(row.depth)}
                          >
                            {row.entity.name.trim() || "Без названия"}
                          </span>
                        </td>
                        {(["read", "create", "update", "delete"] as const).map(
                          (action) => (
                            <PermissionCell key={action}>
                              <Switch
                                checked={access[action]}
                                onCheckedChange={(checked) =>
                                  updateEntityAccess(row.entity.id, {
                                    [action]: checked,
                                  })
                                }
                              />
                            </PermissionCell>
                          ),
                        )}
                        <PermissionCell>
                          <Select
                            value={access.scope}
                            onValueChange={(value) => {
                              if (
                                value == null ||
                                !isDataScope(String(value))
                              ) {
                                return;
                              }
                              updateEntityAccess(
                                row.entity.id,
                                withScope(access, String(value) as DataScope),
                              );
                            }}
                          >
                            <SelectTrigger className="h-8 w-[148px]">
                              <SelectValue>
                                {DATA_SCOPE_LABELS[access.scope]}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">
                                {DATA_SCOPE_LABELS.all}
                              </SelectItem>
                              <SelectItem value="own">
                                {DATA_SCOPE_LABELS.own}
                              </SelectItem>
                              <SelectItem value="filter">
                                {DATA_SCOPE_LABELS.filter}
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </PermissionCell>
                      </tr>
                      {filterOpen ? (
                        <tr className="border-b border-border bg-muted/10">
                          <td colSpan={6} className="px-3 py-3">
                            <div style={rowIndent(row.depth)}>
                              <ScopeFilterPanel
                                entity={row.entity}
                                entities={entities}
                                conditions={access.scopeFilter ?? []}
                                onChange={(conditions) =>
                                  updateEntityAccess(row.entity.id, {
                                    scope: "filter",
                                    scopeFilter: conditions,
                                  })
                                }
                              />
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })
              )}

              <tr className="border-b border-border bg-muted/25">
                <td
                  colSpan={6}
                  className="px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
                >
                  Системные разделы
                </td>
              </tr>

              <tr className="border-b border-border">
                <td className="px-3 py-2">
                  <p className="font-medium">Автоматизации</p>
                  <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                    Вкладка «Автоматизации» в настройках — сценарии и шаблоны
                  </p>
                </td>
                <PermissionCell>
                  <Switch
                    checked={hasSettingsTab(role, "automations")}
                    onCheckedChange={(checked) =>
                      onChange(withSettingsTab(role, "automations", checked))
                    }
                  />
                </PermissionCell>
                <PermissionCell>
                  <PermissionDash />
                </PermissionCell>
                <PermissionCell>
                  <PermissionDash />
                </PermissionCell>
                <PermissionCell>
                  <PermissionDash />
                </PermissionCell>
                <PermissionCell>
                  <PermissionDash />
                </PermissionCell>
              </tr>

              <Fragment>
                <tr
                  className={
                    role.permissions.canAccessAutomationTasks &&
                    role.permissions.automationTasksScope === "filter"
                      ? "border-b border-border"
                      : undefined
                  }
                >
                  <td className="px-3 py-2">
                    <p className="font-medium">Задания автоматизации</p>
                    <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                      Список заданий и страница задачи. Удаление — корзина
                    </p>
                  </td>
                  <PermissionCell>
                    <Switch
                      checked={role.permissions.canAccessAutomationTasks}
                      onCheckedChange={(checked) =>
                        onChange(
                          patchPermissions(role, {
                            canAccessAutomationTasks: checked,
                            ...(!checked
                              ? { canDeleteAutomationTasks: false }
                              : {}),
                          }),
                        )
                      }
                    />
                  </PermissionCell>
                  <PermissionCell>
                    <PermissionDash />
                  </PermissionCell>
                  <PermissionCell>
                    <PermissionDash />
                  </PermissionCell>
                  <PermissionCell>
                    <Switch
                      checked={
                        role.permissions.canAccessAutomationTasks &&
                        role.permissions.canDeleteAutomationTasks
                      }
                      disabled={!role.permissions.canAccessAutomationTasks}
                      onCheckedChange={(checked) =>
                        onChange(
                          patchPermissions(role, {
                            canDeleteAutomationTasks: checked,
                          }),
                        )
                      }
                    />
                  </PermissionCell>
                  <PermissionCell>
                    {role.permissions.canAccessAutomationTasks ? (
                      <Select
                        value={role.permissions.automationTasksScope}
                        onValueChange={(value) => {
                          if (value == null || !isDataScope(String(value))) {
                            return;
                          }
                          const scope = String(value) as DataScope;
                          if (scope === "filter") {
                            onChange(
                              patchPermissions(role, {
                                automationTasksScope: scope,
                                automationTasksScopeEntityId:
                                  role.permissions
                                    .automationTasksScopeEntityId ??
                                  entities[0]?.id,
                                automationTasksScopeFilter:
                                  role.permissions.automationTasksScopeFilter ??
                                  [],
                              }),
                            );
                            return;
                          }
                          onChange(
                            patchPermissions(role, {
                              automationTasksScope: scope,
                              automationTasksScopeEntityId: undefined,
                              automationTasksScopeFilter: undefined,
                            }),
                          );
                        }}
                      >
                        <SelectTrigger className="h-8 w-[148px]">
                          <SelectValue>
                            {
                              DATA_SCOPE_LABELS[
                                role.permissions.automationTasksScope
                              ]
                            }
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">
                            {DATA_SCOPE_LABELS.all}
                          </SelectItem>
                          <SelectItem value="own">
                            {DATA_SCOPE_LABELS.own}
                          </SelectItem>
                          <SelectItem value="filter">
                            {DATA_SCOPE_LABELS.filter}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <PermissionDash />
                    )}
                  </PermissionCell>
                </tr>
                {role.permissions.canAccessAutomationTasks &&
                role.permissions.automationTasksScope === "filter" ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-3">
                      <div className="space-y-3">
                        <div className="flex flex-col gap-1.5 sm:max-w-sm">
                          <Label className="text-xs text-muted-foreground">
                            Сущность записи задания
                          </Label>
                          <Select
                            value={
                              role.permissions.automationTasksScopeEntityId ??
                              entities[0]?.id ??
                              ""
                            }
                            onValueChange={(value) => {
                              if (typeof value !== "string" || !value) return;
                              onChange(
                                patchPermissions(role, {
                                  automationTasksScopeEntityId: value,
                                  automationTasksScopeFilter: [],
                                }),
                              );
                            }}
                          >
                            <SelectTrigger className="h-8 w-full bg-background">
                              <SelectValue placeholder="Сущность">
                                {entities.find(
                                  (entity) =>
                                    entity.id ===
                                    role.permissions
                                      .automationTasksScopeEntityId,
                                )?.name ?? "Выберите сущность"}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {entities.map((entity) => (
                                <SelectItem key={entity.id} value={entity.id}>
                                  {entity.name.trim() || "Без названия"}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        {(() => {
                          const filterEntity =
                            entities.find(
                              (entity) =>
                                entity.id ===
                                role.permissions.automationTasksScopeEntityId,
                            ) ?? entities[0];
                          if (!filterEntity) {
                            return (
                              <p className="text-xs text-muted-foreground">
                                Нет сущностей для фильтра
                              </p>
                            );
                          }
                          return (
                            <ScopeFilterPanel
                              entity={filterEntity}
                              entities={entities}
                              conditions={
                                role.permissions.automationTasksScopeFilter ??
                                []
                              }
                              title="Условия видимости заданий"
                              description="Роль видит только задания по записям этой сущности, у которых все условия выполнены. Без условий задания не показываются."
                              onChange={(conditions) =>
                                onChange(
                                  patchPermissions(role, {
                                    automationTasksScopeEntityId:
                                      filterEntity.id,
                                    automationTasksScopeFilter: conditions,
                                  }),
                                )
                              }
                            />
                          );
                        })()}
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Поля</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Видимость и редактирование полей выбранной сущности
          </p>
        </div>
        {entities.length === 0 ? (
          <p className="text-sm text-muted-foreground">Нет сущностей</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <Select
                value={fieldsEntity?.id ?? ""}
                onValueChange={(value) => {
                  if (typeof value === "string" && value) {
                    setFieldsEntityId(value);
                  }
                }}
              >
                <SelectTrigger className="w-[240px]">
                  <SelectValue placeholder="Сущность">
                    {fieldsEntity?.name ?? "Сущность"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {entities.map((entity) => (
                    <SelectItem key={entity.id} value={entity.id}>
                      {entity.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldsEntity ? (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => grantAllFields(fieldsEntity.id, true)}
                  >
                    Все поля
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => grantAllFields(fieldsEntity.id, false)}
                  >
                    Сбросить
                  </Button>
                </div>
              ) : null}
            </div>
            {fieldsEntity && fieldsAccess ? (
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full min-w-[420px] text-left text-sm">
                  <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Поле</th>
                      <th className="px-3 py-2 font-medium">Видеть</th>
                      <th className="px-3 py-2 font-medium">Редактировать</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fieldsEntity.fields.map((field) => {
                      const allFields = fieldsAccess.fields === "*";
                      const fieldMap =
                        fieldsAccess.fields === "*"
                          ? null
                          : fieldsAccess.fields;
                      const access = allFields
                        ? { view: true, edit: true }
                        : (fieldMap?.[field.id] ?? {
                            view: false,
                            edit: false,
                          });
                      return (
                        <tr
                          key={field.id}
                          className="border-b border-border last:border-0"
                        >
                          <td className="px-3 py-2 font-medium">
                            {getEntityFieldDisplayName(field)}
                          </td>
                          <td className="px-3 py-2">
                            <Switch
                              checked={access.view}
                              onCheckedChange={(checked) =>
                                setFieldAccess(fieldsEntity.id, field.id, {
                                  view: checked,
                                  edit: checked ? access.edit : false,
                                })
                              }
                            />
                          </td>
                          <td className="px-3 py-2">
                            <Switch
                              checked={access.edit}
                              onCheckedChange={(checked) =>
                                setFieldAccess(fieldsEntity.id, field.id, {
                                  view: checked ? true : access.view,
                                  edit: checked,
                                })
                              }
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
