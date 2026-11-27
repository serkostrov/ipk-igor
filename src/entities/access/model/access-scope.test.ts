/**
 * Own-scope, parent inheritance, and locked tab identity.
 * Run: npx --yes vite-node src/entities/access/model/access-scope.test.ts
 */
import {
  findParentVisibilityLinks,
  recordMatchesParentVisibility,
} from "@/entities/entity/model/parent-visibility";
import {
  getEntityValueContext,
  matchesEntityConditions,
} from "@/entities/entity/model/field-value";
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
  type EntityTab,
} from "@/entities/entity/model/types";
import { FEED_ITEM_ID, HISTORY_ITEM_ID, OPIU_ITEM_ID } from "@/entities/menu";
import {
  canMenuItem,
  canViewAutomationTask,
  canViewRecordForDataScope,
} from "./permissions";
import { inspectAutomationTaskAccess } from "./explain-automation-task-access";
import { createEmployeeRole, type EntityAccess, type Role } from "./types";

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

function menuItemVisibility() {
  const base = createEmployeeRole();
  const hiddenFeed: Role = {
    ...base,
    permissions: {
      ...base.permissions,
      menuItemIds: [HISTORY_ITEM_ID, OPIU_ITEM_ID],
      canAccessHistory: false,
      canAccessNewsFeed: true,
    },
  };
  assert(
    !canMenuItem(hiddenFeed, FEED_ITEM_ID),
    "feed stays hidden when it is removed from the menu",
  );
  assert(
    !canMenuItem(hiddenFeed, HISTORY_ITEM_ID),
    "history stays hidden when its switch is off",
  );
  assert(
    canMenuItem(hiddenFeed, OPIU_ITEM_ID),
    "a listed page without its own switch stays visible",
  );

  const feedOn: Role = {
    ...hiddenFeed,
    permissions: {
      ...hiddenFeed.permissions,
      menuItemIds: [FEED_ITEM_ID],
      canAccessNewsFeed: true,
    },
  };
  assert(
    canMenuItem(feedOn, FEED_ITEM_ID),
    "feed is visible when it is listed and its switch is on",
  );
  assert(
    !canMenuItem(feedOn, "entity-outside", "entity-outside"),
    "an entity outside the menu is hidden",
  );

  const entityOn: Role = {
    ...feedOn,
    permissions: { ...feedOn.permissions, menuItemIds: ["entity-outside"] },
  };
  assert(
    canMenuItem(entityOn, "entity-outside", "entity-outside"),
    "a listed entity with read access stays visible",
  );

  const allMenus: Role = {
    ...base,
    permissions: { ...base.permissions, canAccessNewsFeed: false },
  };
  assert(
    !canMenuItem(allMenus, FEED_ITEM_ID),
    "the feed switch hides the item even when every menu item is allowed",
  );
}

async function main() {
  menuItemVisibility();
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
  assert(
    !(await recordMatchesOwnScope(leads, leads.records[0]!, {
      ...viewer,
      ownFieldIds: [],
    })),
    "empty ownFieldIds keeps only the creator",
  );
  assert(
    await recordMatchesOwnScope(leads, leads.records[0]!, {
      ...viewer,
      ownFieldIds: [manager.id],
    }),
    "ownFieldIds limits own scope to the selected field",
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

  const counterparties = entity({
    id: "entity-counterparties",
    name: "Контрагент",
    records: [record("cp-1", {})],
  });
  const projectCounterparty = field({
    id: "field-project-counterparty",
    name: "Контрагент",
    type: "relation",
    relationEntityId: counterparties.id,
  });
  const projectsWithCounterparty = entity({
    id: "entity-projects-cp",
    name: "Проекты",
    fields: [projectCounterparty],
    records: [
      record("project-other", {
        "field-project-counterparty": "cp-1",
      }),
    ],
  });
  counterparties.tabs = [
    {
      id: "tab-projects",
      name: "Проекты",
      locked: false,
      kind: "entity",
      linkedEntityId: projectsWithCounterparty.id,
      parentLinkFieldId: projectCounterparty.id,
      sourceRelationFieldId: null,
      sourceTabId: null,
      defaultFolders: [],
      singleRecord: false,
      tableFlat: false,
    } satisfies EntityTab,
  ];
  assert(
    !findParentVisibilityLinks(projectsWithCounterparty, [
      counterparties,
      projectsWithCounterparty,
      users,
    ]).some((link) => link.parentEntity.id === counterparties.id),
    "counterparty tab is not an ownership parent",
  );

  const legal = entity({
    id: "entity-legal",
    name: "Юрлицо",
    records: [record("legal-1", {})],
  });
  const projectsLegal = entity({
    id: "entity-projects-legal",
    name: "Проекты",
    fields: [
      field({
        id: "field-project-legal",
        name: "Юрлицо",
        type: "belonging",
        relationEntityId: legal.id,
      }),
    ],
    records: [record("project-legal", { "field-project-legal": "legal-1" })],
  });
  assert(
    !findParentVisibilityLinks(projectsLegal, [legal, projectsLegal]).some(
      (link) => link.parentEntity.id === legal.id,
    ),
    "legal entity catalog is not an ownership parent",
  );

  const lines = entity({
    id: "entity-lines",
    name: "Строки",
    fields: [
      field({
        id: "field-line-host",
        name: "Разбор",
        type: "relation",
        relationEntityId: "entity-host",
      }),
    ],
    records: [record("line-1", { "field-line-host": "host-1" })],
  });
  const host = entity({
    id: "entity-host",
    name: "Разбор",
    records: [record("host-1", {})],
  });
  host.tableNestedEntityId = lines.id;
  assert(
    findParentVisibilityLinks(lines, [host, lines]).some(
      (link) =>
        link.parentEntity.id === host.id &&
        link.childLinkFieldId === "field-line-host",
    ),
    "nested table is an ownership parent",
  );

  const scopeOptions = {
    entities: [projects, tasks, users],
    authUserId: null,
    currentUserRecordId: "user-me",
  };
  assert(
    await canViewRecordForDataScope(
      roleFor([
        entityAccess(projects.id, true, "all"),
        entityAccess(tasks.id, true, "own"),
      ]),
      tasks,
      tasks.records[0]!,
      scopeOptions,
    ),
    "task of a readable project stays visible",
  );
  assert(
    !(await canViewRecordForDataScope(
      roleFor([
        entityAccess(projects.id, false, "all"),
        entityAccess(tasks.id, true, "own"),
      ]),
      tasks,
      tasks.records[0]!,
      scopeOptions,
    )),
    "parent without read does not open the child",
  );
  assert(
    !(await canViewRecordForDataScope(
      roleFor([
        entityAccess(projectsWithCounterparty.id, true, "own"),
        entityAccess(counterparties.id, false, "all"),
      ]),
      projectsWithCounterparty,
      projectsWithCounterparty.records[0]!,
      {
        entities: [projectsWithCounterparty, counterparties, users],
        authUserId: null,
        currentUserRecordId: "user-me",
      },
    )),
    "own project is not opened by a counterparty tab",
  );

  const filterCtx = getEntityValueContext([users, leads], "user-me");
  assert(
    matchesEntityConditions(filterCtx, leads, leads.records[0]!, [
      {
        id: "cond-missing",
        fieldId: "missing-field",
        operator: "isCurrentUser",
      },
    ]),
    "ui filters still pass an unknown field",
  );
  assert(
    !matchesEntityConditions(
      filterCtx,
      leads,
      leads.records[0]!,
      [
        {
          id: "cond-missing-strict",
          fieldId: "missing-field",
          operator: "isCurrentUser",
        },
      ],
      null,
      { missingFieldFails: true },
    ),
    "role filter does not open a record on a broken field",
  );
  assert(
    !matchesEntityConditions(
      filterCtx,
      leads,
      leads.records[0]!,
      [
        {
          id: "cond-empty-in",
          fieldId: manager.id,
          operator: "in",
          values: [],
        },
      ],
      null,
      { missingFieldFails: true },
    ),
    "role filter does not open a record on an empty condition",
  );
  const bySession = record("lead-session", { [manager.id]: "auth-me" });
  assert(
    matchesEntityConditions(
      filterCtx,
      leads,
      bySession,
      [
        {
          id: "cond-session",
          fieldId: manager.id,
          operator: "isCurrentUser",
        },
      ],
      null,
      { missingFieldFails: true, authUserId: "auth-me" },
    ),
    "isCurrentUser matches the session id",
  );
  assert(
    !matchesEntityConditions(
      filterCtx,
      leads,
      bySession,
      [
        {
          id: "cond-session-off",
          fieldId: manager.id,
          operator: "isCurrentUser",
        },
      ],
      null,
      { missingFieldFails: true },
    ),
    "isCurrentUser ignores a session id that was not passed",
  );

  await automationTaskDenialReasons();

  console.log("ok: own scope, parent visibility, locked tabs, menu items");
}

function entityAccess(
  entityId: string,
  read: boolean,
  scope: EntityAccess["scope"],
): EntityAccess {
  return {
    entityId,
    create: false,
    read,
    update: false,
    delete: false,
    scope,
    fields: "*",
  };
}

function roleFor(entitiesAccess: EntityAccess[]): Role {
  const base = createEmployeeRole();
  return {
    ...base,
    id: "role-gip",
    name: "ГИП",
    permissions: { ...base.permissions, entities: entitiesAccess },
  };
}

async function automationTaskDenialReasons() {
  const users = entity({
    id: SYSTEM_USERS_ENTITY_ID,
    name: "Пользователи",
    fields: [field({ id: "field-user-name", name: "Имя", type: "text" })],
    records: [
      record("user-me", { "field-user-name": "Я" }),
      record("user-other", { "field-user-name": "Другой" }),
    ],
  });
  const manager = field({
    id: "field-lead-manager",
    name: "Менеджер",
    type: "relation",
    relationEntityId: SYSTEM_USERS_ENTITY_ID,
  });
  const leads = entity({
    id: "entity-leads",
    name: "Лиды",
    fields: [manager],
    records: [
      record(
        "lead-foreign",
        { "field-lead-manager": "user-other" },
        "user-other",
      ),
    ],
  });
  const entities = [users, leads];
  const options = {
    authUserId: null,
    userRecordId: "user-me",
    entities,
    valueContext: getEntityValueContext(entities, "user-me"),
  };
  const task = {
    id: "task-1",
    name: "Согласовать",
    assigneeUserId: "user-other",
    entityId: leads.id,
    recordId: "lead-foreign",
  };

  const closed = roleFor([entityAccess(leads.id, true, "all")]);
  closed.permissions.canAccessAutomationTasks = false;
  const closedReport = await inspectAutomationTaskAccess(closed, task, options);
  assert(!closedReport.allowed, "automation off denies the task");
  assert(closedReport.reason.includes("выключен доступ"), closedReport.reason);
  assert(
    closedReport.allowed ===
      (await canViewAutomationTask(closed, task, options)),
    "inspect matches canView when automation is off",
  );

  const ownTasks = roleFor([entityAccess(leads.id, true, "all")]);
  ownTasks.permissions.canAccessAutomationTasks = true;
  ownTasks.permissions.automationTasksScope = "own";
  const ownReport = await inspectAutomationTaskAccess(ownTasks, task, options);
  assert(!ownReport.allowed, "another assignee is denied");
  assert(ownReport.reason.includes("Только свои"), ownReport.reason);
  assert(ownReport.reason.includes("user-other"), ownReport.reason);
  assert(
    ownReport.allowed ===
      (await canViewAutomationTask(ownTasks, task, options)),
    "inspect matches canView for own task scope",
  );

  const ownRecords = roleFor([entityAccess(leads.id, true, "own")]);
  ownRecords.permissions.canAccessAutomationTasks = true;
  ownRecords.permissions.automationTasksScope = "all";
  const ownRecordTask = { ...task, assigneeUserId: "user-me" };
  const recordReport = await inspectAutomationTaskAccess(
    ownRecords,
    ownRecordTask,
    options,
  );
  assert(!recordReport.allowed, "foreign record is denied");
  assert(recordReport.reason.includes("Лиды"), recordReport.reason);
  assert(recordReport.reason.includes("Только свои"), recordReport.reason);
  assert(
    recordReport.allowed ===
      (await canViewAutomationTask(ownRecords, ownRecordTask, options)),
    "inspect matches canView for record scope",
  );

  const open = roleFor([entityAccess(leads.id, true, "all")]);
  open.permissions.canAccessAutomationTasks = true;
  open.permissions.automationTasksScope = "all";
  const openReport = await inspectAutomationTaskAccess(open, task, options);
  assert(openReport.allowed, openReport.reason);
  assert(
    openReport.allowed === (await canViewAutomationTask(open, task, options)),
    "inspect matches canView when the task is allowed",
  );
}

main().catch((error) => {
  console.error(error);
  throw error;
});
