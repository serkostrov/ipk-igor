import { getEntityRelationTargetId } from "./field";
import { getSystemUsersEntity } from "./system-entities";
import {
  ENTITY_OVERVIEW_TAB_ID,
  createEntityNameField,
  type Entity,
  type EntityField,
  type EntityFieldType,
  type EntityTimeTracking,
} from "./types";

function fieldsOfType(entity: Entity, type: EntityFieldType) {
  return entity.fields.filter((field) => field.type === type);
}

/** Relation fields of `entity` that point to `targetId`. */
export function getRelationFieldsTo(entity: Entity, targetId: string | null) {
  return fieldsOfType(entity, "relation").filter(
    (field) =>
      targetId != null && getEntityRelationTargetId(field) === targetId,
  );
}

/** Mapping prefilled by field types of the entry entity (editable later). */
export function suggestEntityTimeTracking(
  entity: Entity,
  entryEntity: Entity,
  entities: readonly Entity[],
): EntityTimeTracking {
  const users = getSystemUsersEntity(entities);
  const datetimes = fieldsOfType(entryEntity, "datetime");
  const method =
    entryEntity.fields.find(
      (field) =>
        field.type === "list" && field.name.trim().toLowerCase() === "способ",
    ) ?? null;
  const methodOptions = method?.listOptions ?? [];
  const timerOptionId =
    methodOptions.find((o) => /таймер/i.test(o.name))?.id ??
    methodOptions[0]?.id ??
    null;
  const manualOptionId =
    methodOptions.find((o) => /вручн/i.test(o.name))?.id ??
    methodOptions[1]?.id ??
    null;

  return {
    entryEntityId: entryEntity.id,
    linkFieldId: getRelationFieldsTo(entryEntity, entity.id)[0]?.id ?? "",
    employeeFieldId:
      getRelationFieldsTo(entryEntity, users?.id ?? null)[0]?.id ?? "",
    startFieldId: datetimes[0]?.id ?? "",
    endFieldId: datetimes[1]?.id ?? "",
    hoursFieldId: fieldsOfType(entryEntity, "number")[0]?.id ?? "",
    methodFieldId: method?.id ?? null,
    timerOptionId: method ? timerOptionId : null,
    manualOptionId: method ? manualOptionId : null,
    commentFieldId: fieldsOfType(entryEntity, "textarea")[0]?.id ?? null,
    statusFieldId: null,
    statusOptionIds: [],
    dailyLimitHours: 8,
    context: [],
  };
}

/** Why the settings cannot be saved (`null` — valid). */
export function getTimeTrackingSettingsError(
  draft: EntityTimeTracking,
): string | null {
  const required: Array<[string, string]> = [
    [draft.linkFieldId, "связь с записью"],
    [draft.employeeFieldId, "сотрудника"],
    [draft.startFieldId, "начало"],
    [draft.endFieldId, "окончание"],
    [draft.hoursFieldId, "часы"],
  ];
  const missing = required.filter(([id]) => !id).map(([, label]) => label);
  if (missing.length > 0) return `Укажите поля: ${missing.join(", ")}`;
  if (draft.startFieldId === draft.endFieldId) {
    return "Начало и окончание должны быть разными полями";
  }
  return null;
}

/** Whether an entity already has the fields needed for time entries of `host`. */
export function canEntityServeAsTimeJournal(
  entryEntity: Entity,
  hostEntityId: string,
  usersEntityId: string | null,
): boolean {
  return (
    getRelationFieldsTo(entryEntity, hostEntityId).length > 0 &&
    usersEntityId != null &&
    getRelationFieldsTo(entryEntity, usersEntityId).length > 0 &&
    fieldsOfType(entryEntity, "datetime").length >= 2 &&
    fieldsOfType(entryEntity, "number").length >= 1
  );
}

export function listTimeJournalCandidates(
  host: Entity,
  entities: readonly Entity[],
): Entity[] {
  const users = getSystemUsersEntity(entities);
  return entities.filter(
    (item) =>
      item.id !== host.id &&
      item !== users &&
      canEntityServeAsTimeJournal(item, host.id, users?.id ?? null),
  );
}

export type TimeTrackingJournalPlan = {
  entryEntity: Entity;
  timeTracking: EntityTimeTracking;
};

function fieldShell(
  id: string,
  patch: Partial<EntityField> & Pick<EntityField, "name" | "type">,
): EntityField {
  return {
    id,
    name: patch.name,
    type: patch.type,
    hint: patch.hint ?? "",
    group: "",
    tabId: ENTITY_OVERVIEW_TAB_ID,
    required: patch.required ?? false,
    locked: false,
    systemKey: null,
    showInTable: patch.showInTable ?? true,
    showInFilters: patch.showInFilters ?? false,
    showOnRecord: true,
    showOnCreate: true,
    visibilityConditions: [],
    includeInTotal: false,
    tableOrder: patch.tableOrder ?? 0,
    relationEntityId: patch.relationEntityId ?? null,
    relationMultiple: false,
    unitSuffix: patch.unitSuffix ?? null,
    decimals: patch.decimals ?? 2,
    sumFieldIds: [],
    listOptions: patch.listOptions ?? [],
    listSourceFieldId: null,
    listFixed: patch.listFixed ?? false,
    listMultiple: false,
    listAllowOther: false,
    listDependsOnFieldId: null,
    listUseColors: true,
    listShowEmptyValue: true,
    datetimeWithTime: patch.datetimeWithTime ?? false,
    booleanInline: false,
    colSpan: patch.colSpan ?? 1,
    rowSpan: 1,
  };
}

/** Build a ready journal entity + field mapping for a host (not persisted). */
export function buildTimeTrackingJournalPlan(input: {
  host: Entity;
  usersEntityId: string;
  createId: (prefix: string) => string;
}): TimeTrackingJournalPlan {
  const { host, usersEntityId, createId } = input;
  const hostLabel = host.name.trim() || host.namePlural.trim() || "Запись";
  const journalPlural = `Сессии · ${hostLabel}`;

  const nameFieldId = createId("field");
  const linkFieldId = createId("field");
  const employeeFieldId = createId("field");
  const startFieldId = createId("field");
  const endFieldId = createId("field");
  const hoursFieldId = createId("field");
  const methodFieldId = createId("field");
  const commentFieldId = createId("field");
  const timerOptionId = createId("list");
  const manualOptionId = createId("list");
  const childId = createId("entity");

  const fields: EntityField[] = [
    createEntityNameField(nameFieldId),
    fieldShell(linkFieldId, {
      name: hostLabel,
      type: "relation",
      required: true,
      showInTable: false,
      showInFilters: true,
      relationEntityId: host.id,
      tableOrder: 1,
    }),
    fieldShell(employeeFieldId, {
      name: "Сотрудник",
      type: "relation",
      required: true,
      showInFilters: true,
      relationEntityId: usersEntityId,
      tableOrder: 2,
    }),
    fieldShell(startFieldId, {
      name: "Начало",
      type: "datetime",
      required: true,
      datetimeWithTime: true,
      showInFilters: true,
      tableOrder: 3,
    }),
    fieldShell(endFieldId, {
      name: "Окончание",
      type: "datetime",
      datetimeWithTime: true,
      showInFilters: true,
      tableOrder: 4,
    }),
    fieldShell(hoursFieldId, {
      name: "Часы",
      type: "number",
      required: true,
      decimals: 2,
      unitSuffix: "ч",
      showInFilters: true,
      tableOrder: 5,
    }),
    fieldShell(methodFieldId, {
      name: "Способ",
      type: "list",
      listFixed: true,
      listOptions: [
        {
          id: timerOptionId,
          name: "Таймер",
          color: "#3b82f6",
          parentOptionId: null,
        },
        {
          id: manualOptionId,
          name: "Вручную",
          color: "#64748b",
          parentOptionId: null,
        },
      ],
      showInFilters: true,
      tableOrder: 6,
    }),
    fieldShell(commentFieldId, {
      name: "Комментарий",
      type: "textarea",
      showInTable: false,
      colSpan: 4,
      tableOrder: 7,
    }),
  ];

  const entryEntity: Entity = {
    id: childId,
    name: "Сессия",
    namePlural: journalPlural,
    description: `Журнал учёта времени для «${hostLabel}»`,
    nameTemplate: "",
    views: ["table"],
    defaultView: "table",
    fields,
    headerFieldId: null,
    kanbanFieldId: null,
    kanbanCardFieldIds: null,
    kanbanShowFilters: true,
    tableMassSelection: false,
    tableParentFieldId: null,
    tableSubgroupFieldId: null,
    tableNestedEntityId: null,
    tabs: [],
    fieldGroups: [],
    systemKey: null,
    locked: false,
    parentEntityId: host.id,
    recordColumns: 2,
    recordsDisplay: "table",
    timeTracking: null,
    timeline: null,
    pageLayout: null,
    publishedVersion: 1,
    records: [],
  };

  return {
    entryEntity,
    timeTracking: {
      entryEntityId: childId,
      linkFieldId,
      employeeFieldId,
      startFieldId,
      endFieldId,
      hoursFieldId,
      methodFieldId,
      timerOptionId,
      manualOptionId,
      commentFieldId,
      statusFieldId: null,
      statusOptionIds: [],
      dailyLimitHours: 8,
      context: [],
    },
  };
}
