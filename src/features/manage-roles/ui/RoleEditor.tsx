import { useMemo, useState } from "react";
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
import {
  SETTINGS_TAB_IDS,
  createEmptyEntityAccess,
  createFullEntityAccess,
  type EntityAccess,
  type FieldAccess,
  type Role,
  type SettingsTabId,
} from "@/entities/access";
import {
  getEntityFieldDisplayName,
  useEntityConfig,
  type Entity,
} from "@/entities/entity";
import {
  flattenMenuGroupItems,
  useMenuConfig,
  type MenuItem,
} from "@/entities/menu";

const SETTINGS_TAB_LABELS: Record<SettingsTabId, string> = {
  menu: "Меню",
  entities: "Сущности",
  automations: "Автоматизации",
  notifications: "Уведомления",
  roles: "Роли",
};

type RoleEditorProps = {
  role: Role;
  onChange: (role: Role) => void;
};

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

function collectMenuItems(
  entries: ReturnType<typeof useMenuConfig>["entries"],
): MenuItem[] {
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

export function RoleEditor({ role, onChange }: RoleEditorProps) {
  const { entries } = useMenuConfig();
  const { entities } = useEntityConfig();
  const menuItems = useMemo(() => collectMenuItems(entries), [entries]);
  const [fieldsEntityId, setFieldsEntityId] = useState<string>(
    entities[0]?.id ?? "",
  );

  const entitiesAll = role.permissions.entities === "*";
  const menuAll = role.permissions.menuItemIds === "*";
  const settingsAll = role.permissions.settingsTabs === "*";
  const entityAccessList = getEntityAccessList(role, entities);
  const fieldsEntity =
    entities.find((entity) => entity.id === fieldsEntityId) ?? entities[0];
  const fieldsAccess = fieldsEntity
    ? entityAccessList.find((item) => item.entityId === fieldsEntity.id)
    : null;

  const updateEntityAccess = (
    entityId: string,
    patch: Partial<EntityAccess>,
  ) => {
    if (entitiesAll) {
      const list = entities.map((entity) => {
        const base = createFullEntityAccess(entity.id);
        return entity.id === entityId ? { ...base, ...patch } : base;
      });
      onChange(patchPermissions(role, { entities: list }));
      return;
    }
    const list = entityAccessList.map((item) =>
      item.entityId === entityId ? { ...item, ...patch } : item,
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
          <h3 className="text-sm font-semibold text-foreground">Разделы</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Что видит пользователь в меню и системных разделах
          </p>
        </div>
        <div className="divide-y divide-border rounded-xl border border-border px-4">
          <ToggleRow
            label="Все пункты меню"
            description="Иначе отметьте пункты ниже"
            checked={menuAll}
            onCheckedChange={(checked) =>
              onChange(
                patchPermissions(role, {
                  menuItemIds: checked ? "*" : menuItems.map((item) => item.id),
                }),
              )
            }
          />
          {!menuAll
            ? menuItems.map((item) => {
                const checked = role.permissions.menuItemIds.includes(item.id);
                return (
                  <ToggleRow
                    key={item.id}
                    label={item.label}
                    checked={checked}
                    onCheckedChange={(next) => {
                      const current =
                        role.permissions.menuItemIds === "*"
                          ? []
                          : [...role.permissions.menuItemIds];
                      const ids = next
                        ? [...new Set([...current, item.id])]
                        : current.filter((id) => id !== item.id);
                      onChange(patchPermissions(role, { menuItemIds: ids }));
                    }}
                  />
                );
              })
            : null}
          <ToggleRow
            label="История изменений"
            checked={role.permissions.canAccessHistory}
            onCheckedChange={(checked) =>
              onChange(patchPermissions(role, { canAccessHistory: checked }))
            }
          />
          <ToggleRow
            label="Задачи автоматизаций"
            checked={role.permissions.canAccessAutomationTasks}
            onCheckedChange={(checked) =>
              onChange(
                patchPermissions(role, {
                  canAccessAutomationTasks: checked,
                }),
              )
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
            ? SETTINGS_TAB_IDS.map((tab) => {
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
              CRUD и область данных. «Только свои» — записи, где вы создатель.
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

        {!entitiesAll ? (
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
                {entityAccessList.map((access) => {
                  const entity = entities.find(
                    (item) => item.id === access.entityId,
                  );
                  if (!entity) return null;
                  return (
                    <tr
                      key={access.entityId}
                      className="border-b border-border last:border-0"
                    >
                      <td className="px-3 py-2 font-medium">{entity.name}</td>
                      {(["read", "create", "update", "delete"] as const).map(
                        (action) => (
                          <td key={action} className="px-3 py-2">
                            <Switch
                              checked={access[action]}
                              onCheckedChange={(checked) =>
                                updateEntityAccess(access.entityId, {
                                  [action]: checked,
                                })
                              }
                            />
                          </td>
                        ),
                      )}
                      <td className="px-3 py-2">
                        <Select
                          value={access.scope}
                          onValueChange={(value) => {
                            if (value == null) return;
                            updateEntityAccess(access.entityId, {
                              scope: value === "own" ? "own" : "all",
                            });
                          }}
                        >
                          <SelectTrigger className="h-8 w-[140px]">
                            <SelectValue>
                              {access.scope === "own"
                                ? "Только свои"
                                : "Все записи"}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Все записи</SelectItem>
                            <SelectItem value="own">Только свои</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
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
