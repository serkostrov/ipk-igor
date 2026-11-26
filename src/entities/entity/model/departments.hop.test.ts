/**
 * Department scope hops for leads / commercial groups.
 * Run: npx --yes vite-node src/entities/entity/model/departments.hop.test.ts
 */
import { getEntityValueContext } from "./field-value";
import { SYSTEM_USERS_ENTITY_ID } from "./system-entities";
import {
  collectRecordDepartmentIds,
  collectUserDepartmentIds,
  recordMatchesDepartmentScope,
} from "./departments";
import type { Entity, EntityField, EntityRecord } from "./types";

function field(
  partial: Pick<EntityField, "id" | "name" | "type"> &
    Partial<
      Pick<
        EntityField,
        "relationEntityId" | "relationMultiple" | "lookup" | "ownScope"
      >
    >,
): EntityField {
  return {
    hint: "",
    group: "",
    tabId: "overview",
    required: false,
    locked: false,
    systemKey: null,
    showInTable: true,
    showInFilters: true,
    showOnRecord: true,
    showOnCreate: true,
    visibilityConditions: [],
    includeInTotal: false,
    tableOrder: 0,
    relationEntityId: partial.relationEntityId ?? null,
    relationMultiple: false,
    relationSpawnPerUser: false,
    relationCascadeDelete: false,
    unitSuffix: null,
    decimals: 2,
    sumFieldIds: [],
    listOptions: [],
    listSourceFieldId: null,
    listFixed: false,
    listMultiple: false,
    listAllowOther: false,
    listDependsOnFieldId: null,
    listUseColors: false,
    listShowEmptyValue: true,
    datetimeWithTime: false,
    booleanInline: false,
    colSpan: 1,
    rowSpan: 1,
    ...partial,
  } as EntityField;
}

function entity(
  partial: Pick<Entity, "id" | "name"> &
    Partial<Pick<Entity, "namePlural" | "systemKey" | "fields" | "records">>,
): Entity {
  return {
    namePlural: partial.namePlural ?? partial.name,
    description: "",
    nameTemplate: "",
    parentEntityId: null,
    systemKey: null,
    locked: false,
    views: ["table"],
    defaultView: null,
    headerFieldId: null,
    kanbanFieldId: null,
    kanbanCardFieldIds: null,
    kanbanShowFilters: true,
    tableMassSelection: false,
    tableParentFieldId: null,
    tableSubgroupFieldId: null,
    tableNestedEntityId: null,
    recordColumns: 2,
    recordsDisplay: "table",
    fields: [],
    fieldGroups: [],
    tabs: [],
    records: [],
    timeTracking: null,
    timeline: null,
    pageLayout: null,
    publishedVersion: 1,
    createUpload: null,
    ...partial,
  } as Entity;
}

function record(id: string, values: Record<string, string>): EntityRecord {
  return {
    id,
    values,
    authUserId: null,
    createdBy: null,
    schemaVersion: 1,
  };
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

async function main() {
  const departments = entity({
    id: "entity-departments",
    name: "Отделы",
    namePlural: "Отделы",
    fields: [
      field({
        id: "field-dept-head",
        name: "Руководитель",
        type: "relation",
        relationEntityId: SYSTEM_USERS_ENTITY_ID,
      }),
      field({
        id: "field-dept-managers",
        name: "Менеджеры",
        type: "relation",
        relationEntityId: SYSTEM_USERS_ENTITY_ID,
        relationMultiple: true,
      }),
    ],
    records: [
      record("dept-a", { name: "A" }),
      record("dept-b", {
        name: "B",
        "field-dept-head": "user-head",
        "field-dept-managers": "user-manager",
      }),
    ],
  });

  const users = entity({
    id: SYSTEM_USERS_ENTITY_ID,
    name: "Пользователи",
    namePlural: "Пользователи",
    systemKey: "users",
    fields: [
      field({
        id: "field-user-dept",
        name: "Отдел",
        type: "relation",
        relationEntityId: departments.id,
      }),
    ],
    records: [
      record("user-manager", { "field-user-dept": "dept-a" }),
      record("user-head", { "field-user-dept": "dept-b" }),
      record("user-viewer", {}),
    ],
  });

  const groups = entity({
    id: "entity-commercial-groups",
    name: "Коммерческие группы",
    namePlural: "Коммерческие группы",
    fields: [
      field({
        id: "field-group-head",
        name: "Руководитель",
        type: "relation",
        relationEntityId: SYSTEM_USERS_ENTITY_ID,
      }),
      field({
        id: "field-group-dept",
        name: "Отдел",
        type: "relation",
        relationEntityId: departments.id,
      }),
    ],
    records: [
      record("group-main", {
        "field-group-head": "user-head",
        "field-group-dept": "dept-b",
      }),
      record("group-other", {
        "field-group-head": "user-manager",
        "field-group-dept": "dept-a",
      }),
    ],
  });

  const leads = entity({
    id: "entity-leads",
    name: "Лиды",
    namePlural: "Лиды",
    fields: [
      field({
        id: "field-lead-manager",
        name: "Менеджер",
        type: "relation",
        relationEntityId: SYSTEM_USERS_ENTITY_ID,
      }),
      field({
        id: "field-lead-group",
        name: "Коммерческая группа",
        type: "relation",
        relationEntityId: groups.id,
      }),
    ],
    records: [
      record("lead-mine", {
        "field-lead-manager": "user-manager",
        "field-lead-group": "group-main",
      }),
      record("lead-other-group", {
        "field-lead-manager": "user-head",
        "field-lead-group": "group-other",
      }),
      record("lead-orphan", {
        "field-lead-manager": "user-manager",
      }),
    ],
  });

  const entitiesList = [departments, users, groups, leads];

  // Explicit group→dept only — manager dept must not leak.
  const mineIds = await collectRecordDepartmentIds(
    leads,
    leads.records[0]!,
    departments,
    entitiesList,
  );
  assert(
    [...mineIds].sort().join(",") === "dept-b",
    `lead-mine expected dept-b only, got: ${mineIds.join(",") || "(empty)"}`,
  );

  const otherIds = await collectRecordDepartmentIds(
    leads,
    leads.records[1]!,
    departments,
    entitiesList,
  );
  assert(
    [...otherIds].sort().join(",") === "dept-a",
    `lead-other-group expected dept-a, got: ${otherIds.join(",") || "(empty)"}`,
  );

  const orphanIds = await collectRecordDepartmentIds(
    leads,
    leads.records[2]!,
    departments,
    entitiesList,
  );
  assert(
    orphanIds.length === 0,
    `orphan lead (no group) must have no depts, got: ${orphanIds.join(",")}`,
  );

  // Viewer who heads commercial group gets that group's department.
  const headDepts = collectUserDepartmentIds(
    users.records[1]!,
    users,
    departments,
    entitiesList,
  );
  assert(
    headDepts.includes("dept-b"),
    `group head should include dept-b, got: ${headDepts.join(",")}`,
  );

  const viewerOpts = {
    authUserId: null as string | null,
    currentUserRecordId: "user-head",
  };

  assert(
    await recordMatchesDepartmentScope(
      leads,
      leads.records[0]!,
      ["dept-b"],
      departments,
      entitiesList,
      viewerOpts,
    ),
    "head should see lead in own group dept",
  );

  assert(
    !(await recordMatchesDepartmentScope(
      leads,
      leads.records[1]!,
      ["dept-b"],
      departments,
      entitiesList,
      viewerOpts,
    )),
    "head must not see lead of other group dept",
  );

  assert(
    !(await recordMatchesDepartmentScope(
      leads,
      leads.records[2]!,
      ["dept-b"],
      departments,
      entitiesList,
      viewerOpts,
    )),
    "head must not see orphan lead without group/dept",
  );

  const managerDepts = collectUserDepartmentIds(
    users.records[0]!,
    users,
    departments,
    entitiesList,
  );
  assert(
    managerDepts.includes("dept-a") && !managerDepts.includes("dept-b"),
    `membership in «Менеджеры» must not grant the department, got: ${managerDepts.join(",")}`,
  );

  const notes = entity({
    id: "entity-notes",
    name: "Заметки",
    fields: [],
    records: [record("note-1", {})],
  });
  assert(
    !(await recordMatchesDepartmentScope(
      notes,
      notes.records[0]!,
      ["dept-a"],
      departments,
      [...entitiesList, notes],
      { authUserId: null, currentUserRecordId: "user-manager" },
    )),
    "department scope hides entities that cannot link to a department",
  );

  const requests = entity({
    id: "entity-requests",
    name: "Заявки",
    fields: [
      field({
        id: "field-req-manager",
        name: "Менеджер",
        type: "relation",
        relationEntityId: SYSTEM_USERS_ENTITY_ID,
      }),
      field({
        id: "field-req-watcher",
        name: "Наблюдатель",
        type: "relation",
        relationEntityId: SYSTEM_USERS_ENTITY_ID,
      }),
      field({
        id: "field-req-dept",
        name: "Отдел менеджера",
        type: "lookup",
        lookup: {
          relationFieldId: "field-req-manager",
          targetFieldId: "field-user-dept",
        },
      }),
    ],
    records: [
      record("request-1", {
        "field-req-manager": "user-manager",
        "field-req-watcher": "user-head",
      }),
    ],
  });
  const requestEntities = [...entitiesList, requests];
  const requestCtx = getEntityValueContext(requestEntities);
  const requestOpts = {
    authUserId: null as string | null,
    currentUserRecordId: "user-viewer",
    valueContext: requestCtx,
  };
  assert(
    await recordMatchesDepartmentScope(
      requests,
      requests.records[0]!,
      ["dept-a"],
      departments,
      requestEntities,
      requestOpts,
    ),
    "department lookup of the manager must match the manager department",
  );
  assert(
    !(await recordMatchesDepartmentScope(
      requests,
      requests.records[0]!,
      ["dept-b"],
      departments,
      requestEntities,
      requestOpts,
    )),
    "a watcher must not pull the record into their department when a department lookup exists",
  );

  console.log("ok: department scope uses group→dept, not manager hop");
}

main().catch((error) => {
  console.error(error);
  throw error;
});
