/**
 * Own-scope, parent inheritance, and locked tab identity.
 * Run: npx --yes vite-node src/entities/access/model/access-scope.test.ts
 */
import {
  findParentVisibilityLinks,
  recordMatchesParentVisibility,
} from "@/entities/entity/model/parent-visibility";
import {
  fieldParticipatesInOwnScope,
  recordMatchesOwnScope,
} from "@/entities/entity/model/own-scope";
import { SYSTEM_USERS_ENTITY_ID } from "@/entities/entity/model/system-entities";
import {
  isEntityOverviewTab,
  normalizeEntityTab,
  type Entity,
  type EntityField,
  type EntityRecord,
} from "@/entities/entity/model/types";

function field(
  partial: Pick<EntityField, "id" | "name" | "type"> &
    Partial<Pick<EntityField, "relationEntityId" | "lookup" | "ownScope">>,
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
    Partial<Pick<Entity, "fields" | "records">>,
): Entity {
  return {
    namePlural: partial.name,
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

function record(
  id: string,
  values: Record<string, string>,
  createdBy: string | null = null,
): EntityRecord {
  return {
    id,
    values,
    authUserId: null,
    createdBy,
    schemaVersion: 1,
  };
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

async function main() {
  const salary = normalizeEntityTab({
    id: "tab-salary",
    name: "Расчёт ЗП",
    locked: true,
    kind: "fields",
    linkedEntityId: null,
    parentLinkFieldId: null,
  });
  assert(salary.id === "tab-salary", `locked tab kept id ${salary.id}`);
  assert(salary.locked, "locked custom tab stays locked");
  assert(!isEntityOverviewTab(salary), "locked custom tab is not overview");

  const users = entity({
    id: SYSTEM_USERS_ENTITY_ID,
    name: "Пользователи",
    fields: [
      field({
        id: "field-user-name",
        name: "Имя",
        type: "text",
      }),
    ],
    records: [record("user-me", {}), record("user-other", {})],
  });
  const manager = field({
    id: "field-lead-manager",
    name: "Менеджер",
    type: "relation",
    relationEntityId: SYSTEM_USERS_ENTITY_ID,
  });
  const managerLookup = field({
    id: "field-lead-manager-card",
    name: "Карточка менеджера",
    type: "lookup",
    lookup: {
      relationFieldId: manager.id,
      targetFieldId: "field-user-name",
    },
  });
  const leads = entity({
    id: "entity-leads",
    name: "Лиды",
    fields: [manager, managerLookup],
    records: [
      record("lead-1", { "field-lead-manager": "user-me" }, "user-other"),
    ],
  });
  const entities = [users, leads];
  const viewer = {
    authUserId: null,
    currentUserRecordId: "user-me",
    entities,
  };

  assert(
    fieldParticipatesInOwnScope(leads, manager, entities),
    "user relation participates in own scope",
  );
  assert(
    !fieldParticipatesInOwnScope(leads, managerLookup, entities),
    "lookup does not participate in own scope unless opted in",
  );
  managerLookup.ownScope = true;
  assert(
    fieldParticipatesInOwnScope(leads, managerLookup, entities),
    "lookup participates when ownScope is true",
  );
  managerLookup.ownScope = undefined;
  manager.ownScope = false;
  assert(
    !fieldParticipatesInOwnScope(leads, manager, entities),
    "ownScope false opts a user relation out",
  );
  assert(
    !(await recordMatchesOwnScope(leads, leads.records[0]!, viewer)),
    "opted-out relation must not make the record own",
  );
  manager.ownScope = undefined;
  assert(
    await recordMatchesOwnScope(leads, leads.records[0]!, viewer),
    "viewer listed in the manager relation sees the record as own",
  );

  const projects = entity({
    id: "entity-projects",
    name: "Проекты",
    records: [record("project-1", { name: "P" })],
  });
  const tasks = entity({
    id: "entity-tasks",
    name: "Задачи",
    fields: [
      field({
        id: "field-task-project",
        name: "Проект",
        type: "belonging",
        relationEntityId: projects.id,
      }),
    ],
    records: [
      record("task-visible", { "field-task-project": "project-1" }),
      record("task-missing", { "field-task-project": "project-hidden" }),
    ],
  });
  const links = findParentVisibilityLinks(tasks, [projects, tasks, users]);
  assert(
    links.some(
      (link) =>
        link.parentEntity.id === projects.id &&
        link.childLinkFieldId === "field-task-project",
    ),
    "task belonging to a project is an ownership parent",
  );
  assert(
    await recordMatchesParentVisibility(
      tasks,
      tasks.records[0]!,
      [projects, tasks],
      async () => true,
    ),
    "task linked to a visible project is visible",
  );
  assert(
    !(await recordMatchesParentVisibility(
      tasks,
      tasks.records[1]!,
      [projects, tasks],
      async () => true,
    )),
    "task whose parent record is missing stays hidden",
  );

  console.log("ok: own scope, parent visibility, locked tabs");
}

main().catch((error) => {
  console.error(error);
  throw error;
});
