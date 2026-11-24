/**
 * Commercial-group hop must not attribute the group head’s departments to leads.
 * Run: npx --yes vite-node src/entities/entity/model/departments.hop.test.ts
 */
import { SYSTEM_USERS_ENTITY_ID } from "./system-entities";
import { collectRecordDepartmentIds } from "./departments";
import type { Entity, EntityField, EntityRecord } from "./types";

function field(
  partial: Pick<EntityField, "id" | "name" | "type"> & {
    relationEntityId?: string | null;
  },
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

async function main() {
  const departments = entity({
    id: "entity-departments",
    name: "Отделы",
    namePlural: "Отделы",
    records: [record("dept-a", { name: "A" }), record("dept-b", { name: "B" })],
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
    ],
    records: [record("group-main", { "field-group-head": "user-head" })],
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
      record("lead-1", {
        "field-lead-manager": "user-manager",
        "field-lead-group": "group-main",
      }),
    ],
  });

  const entitiesList = [departments, users, groups, leads];
  const lead = leads.records[0]!;
  const ids = await collectRecordDepartmentIds(
    leads,
    lead,
    departments,
    entitiesList,
  );

  const unique = [...new Set(ids)].sort();
  if (unique.includes("dept-b")) {
    throw new Error(
      `commercial-group head dept leaked into lead: ${unique.join(",")}`,
    );
  }
  if (!unique.includes("dept-a")) {
    throw new Error(
      `expected manager dept-a on lead, got: ${unique.join(",") || "(empty)"}`,
    );
  }
  console.log("ok: collectRecordDepartmentIds ignores commercial-group head");
}

main().catch((error) => {
  console.error(error);
  throw error;
});
