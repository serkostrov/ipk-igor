import {
  ENTITY_OVERVIEW_TAB_ID,
  createEntityNameField,
  createEntityOverviewTab,
  resolveRelationRecordLabel,
  type Entity,
  type EntityField,
  type EntityRecord,
} from "./types";

export const SYSTEM_ENTITY_KEY_USERS = "users";

export const SYSTEM_USERS_ENTITY_ID = "entity-system-users";
export const SYSTEM_USERS_FIELD_NAME_ID = "field-system-users-name";
export const SYSTEM_USERS_FIELD_EMAIL_ID = "field-system-users-email";
export const SYSTEM_USERS_FIELD_PHONE_ID = "field-system-users-phone";
export const SYSTEM_USERS_FIELD_ROLE_ID = "field-system-users-role";

export const SYSTEM_FIELD_KEY_NAME = "name";
export const SYSTEM_FIELD_KEY_EMAIL = "email";
export const SYSTEM_FIELD_KEY_PHONE = "phone";
export const SYSTEM_FIELD_KEY_ROLE = "role";

/** Built-in fields that cannot be removed from Users. Phone is a default field, not system. */
const USERS_SYSTEM_FIELD_KEYS = [
  SYSTEM_FIELD_KEY_NAME,
  SYSTEM_FIELD_KEY_EMAIL,
  SYSTEM_FIELD_KEY_ROLE,
] as const;

export type UsersSystemFieldKey = (typeof USERS_SYSTEM_FIELD_KEYS)[number];

function createUsersEmailField(): EntityField {
  return {
    id: SYSTEM_USERS_FIELD_EMAIL_ID,
    name: "Email",
    type: "email",
    hint: "",
    group: "",
    tabId: ENTITY_OVERVIEW_TAB_ID,
    required: true,
    locked: false,
    systemKey: SYSTEM_FIELD_KEY_EMAIL,
    showInTable: true,
    showInFilters: true,
    showOnRecord: true,
    showOnCreate: true,
    includeInTotal: false,
    tableOrder: 1,
    relationEntityId: null,
    relationMultiple: false,
    unitSuffix: null,
    sumFieldIds: [],
    listOptions: [],
    listSourceFieldId: null,
    listFixed: false,
    listMultiple: false,
    listAllowOther: false,
    listDependsOnFieldId: null,
    listUseColors: true,
    datetimeWithTime: false,
    booleanInline: false,
    colSpan: 2,
    rowSpan: 1,
  };
}

/** Default phone field on Users — editable/removable (not a system field). */
function createUsersPhoneField(): EntityField {
  return {
    id: SYSTEM_USERS_FIELD_PHONE_ID,
    name: "Телефон",
    type: "phone",
    hint: "",
    group: "",
    tabId: ENTITY_OVERVIEW_TAB_ID,
    required: false,
    locked: false,
    systemKey: null,
    showInTable: true,
    showInFilters: true,
    showOnRecord: true,
    showOnCreate: true,
    includeInTotal: false,
    tableOrder: 2,
    relationEntityId: null,
    relationMultiple: false,
    unitSuffix: null,
    sumFieldIds: [],
    listOptions: [],
    listSourceFieldId: null,
    listFixed: false,
    listMultiple: false,
    listAllowOther: false,
    listDependsOnFieldId: null,
    listUseColors: true,
    datetimeWithTime: false,
    booleanInline: false,
    colSpan: 2,
    rowSpan: 1,
  };
}

/** System role field — options synced from roles config. */
export function createUsersRoleField(
  listOptions: EntityField["listOptions"] = [],
): EntityField {
  return {
    id: SYSTEM_USERS_FIELD_ROLE_ID,
    name: "Роль",
    type: "list",
    hint: "Определяет права доступа пользователя в системе",
    group: "",
    tabId: ENTITY_OVERVIEW_TAB_ID,
    required: true,
    locked: false,
    systemKey: SYSTEM_FIELD_KEY_ROLE,
    showInTable: true,
    showInFilters: true,
    showOnRecord: true,
    showOnCreate: true,
    includeInTotal: false,
    tableOrder: 3,
    relationEntityId: null,
    relationMultiple: false,
    unitSuffix: null,
    sumFieldIds: [],
    listOptions,
    listSourceFieldId: null,
    listFixed: true,
    listMultiple: false,
    listAllowOther: false,
    listDependsOnFieldId: null,
    listUseColors: true,
    datetimeWithTime: false,
    booleanInline: false,
    colSpan: 2,
    rowSpan: 1,
  };
}

export function buildRoleListOptions(
  roles: readonly { id: string; name: string }[],
): EntityField["listOptions"] {
  const colors = ["#3b82f6", "#22c55e", "#f59e0b", "#8b5cf6", "#ef4444"];
  return roles.map((role, index) => ({
    id: role.id,
    name: role.name,
    color: colors[index % colors.length]!,
    parentOptionId: null,
  }));
}

/** Sync Users «Роль» listOptions with the roles catalog. */
export function syncUsersRoleFieldOptions(
  entities: Entity[],
  roles: readonly { id: string; name: string }[],
): { entities: Entity[]; changed: boolean } {
  const options = buildRoleListOptions(roles);
  let changed = false;
  const next = entities.map((entity) => {
    if (
      entity.systemKey !== SYSTEM_ENTITY_KEY_USERS &&
      entity.id !== SYSTEM_USERS_ENTITY_ID
    ) {
      return entity;
    }

    let fields = [...entity.fields];
    const roleIndex = fields.findIndex(
      (field) =>
        field.systemKey === SYSTEM_FIELD_KEY_ROLE ||
        field.id === SYSTEM_USERS_FIELD_ROLE_ID,
    );
    let entityChanged = false;

    if (roleIndex < 0) {
      fields = [...fields, createUsersRoleField(options)];
      entityChanged = true;
    } else {
      const current = fields[roleIndex]!;
      const sameOptions =
        current.listOptions.length === options.length &&
        current.listOptions.every(
          (option, index) =>
            option.id === options[index]?.id &&
            option.name === options[index]?.name,
        );
      const sameMeta =
        current.required === true &&
        current.systemKey === SYSTEM_FIELD_KEY_ROLE;
      if (!sameOptions || !sameMeta) {
        // Preserve list presentation (colors / fixed) — user can change those
        // in settings; only catalog options + required system meta are forced.
        const listFixed = current.listFixed;
        fields[roleIndex] = {
          ...createUsersRoleField(options),
          name: current.name || "Роль",
          hint: current.hint,
          group: current.group,
          tabId: current.tabId,
          showInTable: current.showInTable,
          showInFilters: current.showInFilters,
          showOnRecord: current.showOnRecord,
          showOnCreate: current.showOnCreate,
          tableOrder: current.tableOrder,
          colSpan: current.colSpan,
          rowSpan: current.rowSpan,
          listUseColors: current.listUseColors,
          listFixed,
          listMultiple: listFixed ? current.listMultiple : false,
          listOptions: sameOptions
            ? current.listOptions
            : options.map((option) => ({
                ...option,
                color:
                  current.listOptions.find((item) => item.id === option.id)
                    ?.color ?? option.color,
              })),
        };
        entityChanged = true;
      }
    }

    if (!entityChanged) return entity;
    changed = true;
    return { ...entity, fields };
  });

  return { entities: next, changed };
}

export function createSystemUsersEntity(): Entity {
  const nameField = {
    ...createEntityNameField(SYSTEM_USERS_FIELD_NAME_ID),
    name: "ФИО",
    systemKey: SYSTEM_FIELD_KEY_NAME,
  };

  return {
    id: SYSTEM_USERS_ENTITY_ID,
    name: "Пользователь",
    namePlural: "Пользователи",
    description: "Системная сущность аккаунтов. Можно добавлять свои поля.",
    views: ["table"],
    defaultView: null,
    fields: [
      nameField,
      createUsersEmailField(),
      createUsersPhoneField(),
      createUsersRoleField(),
    ],
    headerFieldId: SYSTEM_USERS_FIELD_EMAIL_ID,
    kanbanFieldId: null,
    kanbanCardFieldIds: null,
    tabs: [createEntityOverviewTab()],
    fieldGroups: [],
    systemKey: SYSTEM_ENTITY_KEY_USERS,
    locked: false,
    parentEntityId: null,
    recordColumns: 2,
    recordsDisplay: "cards",
    timeTracking: null,
    timeline: null,
    records: [],
  };
}

function systemFieldTemplate(key: UsersSystemFieldKey): EntityField {
  if (key === SYSTEM_FIELD_KEY_NAME) {
    return {
      ...createEntityNameField(SYSTEM_USERS_FIELD_NAME_ID),
      name: "ФИО",
      systemKey: SYSTEM_FIELD_KEY_NAME,
    };
  }
  if (key === SYSTEM_FIELD_KEY_ROLE) {
    return createUsersRoleField();
  }
  return createUsersEmailField();
}

/** Abandoned pack seed — strip on load so it can leave persisted configs. */
const LEGACY_COMMERCIAL_PLANS_ENTITY_ID = "entity-system-commercial-plans";
const LEGACY_COMMERCIAL_PLANS_SYSTEM_KEY = "commercial-plans";

/** Ensures Users entity exists and has required system fields. */
export function ensureSystemEntities(entities: Entity[]): {
  entities: Entity[];
  changed: boolean;
} {
  let changed = false;
  let next = entities.filter((entity) => {
    const drop =
      entity.systemKey === LEGACY_COMMERCIAL_PLANS_SYSTEM_KEY ||
      entity.id === LEGACY_COMMERCIAL_PLANS_ENTITY_ID;
    if (drop) changed = true;
    return !drop;
  });

  let usersIndex = next.findIndex(
    (entity) => entity.systemKey === SYSTEM_ENTITY_KEY_USERS,
  );

  if (usersIndex < 0) {
    usersIndex = next.findIndex(
      (entity) => entity.id === SYSTEM_USERS_ENTITY_ID,
    );
  }

  if (usersIndex < 0) {
    next = [createSystemUsersEntity(), ...next];
    return { entities: next, changed: true };
  }

  const users = next[usersIndex]!;
  let fields = users.fields.map((field) => {
    // Legacy: phone used to be a system field — demote so it can be edited/removed.
    if (field.systemKey === SYSTEM_FIELD_KEY_PHONE) {
      changed = true;
      return { ...field, systemKey: null };
    }
    return field;
  });

  const presentKeys = new Set(
    fields
      .map((field) => field.systemKey?.trim() || "")
      .filter((key) => key.length > 0),
  );

  for (const key of USERS_SYSTEM_FIELD_KEYS) {
    if (presentKeys.has(key)) continue;
    fields = [...fields, systemFieldTemplate(key)];
    changed = true;
  }

  const patched: Entity = {
    ...users,
    id: SYSTEM_USERS_ENTITY_ID,
    systemKey: SYSTEM_ENTITY_KEY_USERS,
    fields,
  };

  if (
    users.id !== SYSTEM_USERS_ENTITY_ID ||
    users.systemKey !== SYSTEM_ENTITY_KEY_USERS ||
    changed
  ) {
    next[usersIndex] = patched;
    changed = true;
  }

  return { entities: next, changed };
}

export function getSystemUsersEntity(
  entities: readonly Entity[],
): Entity | null {
  return (
    entities.find((entity) => entity.systemKey === SYSTEM_ENTITY_KEY_USERS) ??
    entities.find((entity) => entity.id === SYSTEM_USERS_ENTITY_ID) ??
    null
  );
}

/** Users record linked to a Supabase Auth account. */
export function findSystemUserByAuthId(
  entities: readonly Entity[],
  authUserId: string | null,
): EntityRecord | null {
  if (!authUserId) return null;
  return (
    getSystemUsersEntity(entities)?.records.find(
      (record) => record.authUserId === authUserId,
    ) ?? null
  );
}

/** Display name of the Users record linked to an auth account. */
export function getSystemUserNameByAuthId(
  entities: readonly Entity[],
  authUserId: string | null,
): string | null {
  const record = findSystemUserByAuthId(entities, authUserId);
  return record ? getSystemUserName(entities, record.id) : null;
}

/** Display name of a Users record (`null` when it is unknown). */
export function getSystemUserName(
  entities: readonly Entity[],
  userRecordId: string | null,
): string | null {
  if (!userRecordId) return null;
  const users = getSystemUsersEntity(entities);
  const exists = users?.records.some((record) => record.id === userRecordId);
  return exists ? resolveRelationRecordLabel(users, userRecordId) : null;
}

export function getUsersSystemField(
  entity: Entity,
  key: UsersSystemFieldKey,
): EntityField | null {
  return entity.fields.find((field) => field.systemKey === key) ?? null;
}
