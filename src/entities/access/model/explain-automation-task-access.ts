import {
  ENTITY_CONDITION_OPERATOR_LABELS,
  collectRecordDepartmentIds,
  collectRecordLegalEntityIds,
  collectUserDepartmentIds,
  collectViewerDepartmentIds,
  entityCanLinkToLegalEntities,
  entitySupportsDepartmentScope,
  fieldParticipatesInOwnScope,
  matchesEntityConditions,
  findDepartmentsEntity,
  findLegalEntitiesEntity,
  findParentVisibilityLinks,
  findSystemUserByAuthId,
  getEntityFieldDisplayName,
  getEntityRecordById,
  getEntityRecordTitle,
  getRecordFieldIds,
  getSystemUsersEntity,
  parseEntityRelationIds,
  type Entity,
  type EntityCondition,
  type EntityRecord,
  type EntityValueContext,
} from "@/entities/entity";
import {
  automationTasksScope,
  automationTasksScopeFilter,
  canAccessAutomationTasks,
  canEntity,
  canViewRecordForDataScope,
  canViewRecordForLegalEntities,
  entityScope,
  entityScopeFilter,
  getEntityAccess,
  matchesRecordDataScopeDirect,
  roleLegalEntityIds,
  taskMatchesAutomationScope,
} from "./permissions";
import { DATA_SCOPE_LABELS, type DataScope, type Role } from "./types";

type AccessOptions = {
  authUserId: string | null;
  userRecordId: string | null;
  entities: Entity[];
  valueContext: EntityValueContext;
};

export type AutomationTaskAccessSubject = {
  id?: string;
  name?: string;
  assigneeUserId: string | null;
  entityId: string;
  recordId: string;
};

export type AutomationTaskAccessCheck = {
  name: string;
  passed: boolean;
  detail: string;
};

/** Why a task page is open or closed. Logged only when access is denied. */
export type AutomationTaskAccessReport = {
  allowed: boolean;
  reason: string;
  role: { id: string; name: string } | null;
  viewer: { authUserId: string | null; userRecordId: string | null };
  task: {
    id: string | null;
    name: string | null;
    assigneeUserId: string | null;
    entityId: string;
    entityName: string | null;
    recordId: string;
  };
  checks: AutomationTaskAccessCheck[];
};

function entityById(
  entities: readonly Entity[],
  entityId: string,
): Entity | undefined {
  return entities.find((item) => item.id === entityId);
}

async function recordLabel(
  entity: Entity | null | undefined,
  recordId: string | null,
  valueContext: EntityValueContext,
): Promise<string> {
  if (!recordId) return "не указан";
  if (!entity) return recordId;
  const record = await getEntityRecordById(entity, recordId);
  if (!record) return recordId;
  const title = getEntityRecordTitle(valueContext, entity, record, recordId);
  return title && title !== recordId ? `${title} (${recordId})` : recordId;
}

async function idList(
  entity: Entity | null | undefined,
  ids: readonly string[],
  valueContext: EntityValueContext,
): Promise<string> {
  if (ids.length === 0) return "нет";
  const labels = await Promise.all(
    ids.map((id) => recordLabel(entity, id, valueContext)),
  );
  return labels.join(", ");
}

function conditionText(entity: Entity, condition: EntityCondition): string {
  const field = entity.fields.find((item) => item.id === condition.fieldId);
  const fieldName = field
    ? getEntityFieldDisplayName(field)
    : condition.fieldId;
  const operator =
    ENTITY_CONDITION_OPERATOR_LABELS[condition.operator] ?? condition.operator;
  const values = [
    ...(condition.values ?? []),
    ...(condition.value ? [condition.value] : []),
  ];
  const tail = values.length > 0 ? `: ${values.join(", ")}` : "";
  return `«${fieldName}» ${operator}${tail}`;
}

async function describeOwnMiss(
  role: Role,
  entity: Entity,
  record: EntityRecord,
  options: AccessOptions,
): Promise<string> {
  const viewer = [
    options.authUserId
      ? `сессия ${await recordLabel(getSystemUsersEntity(options.entities), options.authUserId, options.valueContext)}`
      : null,
    options.userRecordId
      ? `карточка ${await recordLabel(getSystemUsersEntity(options.entities), options.userRecordId, options.valueContext)}`
      : null,
  ].filter((item): item is string => item != null);

  const ownFieldIds = getEntityAccess(role.permissions, entity.id)?.ownFieldIds;
  const fieldLimit =
    ownFieldIds === undefined
      ? "учитываются все поля связи с пользователем"
      : ownFieldIds.length === 0
        ? "поля связи выключены, учитывается только создатель"
        : `учитываются поля: ${ownFieldIds
            .map((id) => {
              const field = entity.fields.find((item) => item.id === id);
              return field ? getEntityFieldDisplayName(field) : id;
            })
            .join(", ")}`;

  const values: string[] = [];
  const allowed = ownFieldIds != null ? new Set(ownFieldIds) : null;
  for (const field of entity.fields) {
    if (allowed && !allowed.has(field.id)) continue;
    if (!fieldParticipatesInOwnScope(entity, field, options.entities)) continue;
    const ids =
      field.type === "lookup"
        ? getRecordFieldIds(options.valueContext, entity, record, field)
        : parseEntityRelationIds(record.values[field.id]);
    values.push(
      `${getEntityFieldDisplayName(field)}: ${ids.length > 0 ? ids.join(", ") : "пусто"}`,
    );
  }

  const creator = record.createdBy
    ? await recordLabel(
        getSystemUsersEntity(options.entities),
        record.createdBy,
        options.valueContext,
      )
    : "не указан";

  return [
    `Область «${DATA_SCOPE_LABELS.own}» сущности «${entity.name}».`,
    viewer.length > 0
      ? `Вы: ${viewer.join(", ")}.`
      : "Текущий пользователь не определён.",
    `Создатель записи: ${creator}.`,
    `${fieldLimit}.`,
    values.length > 0
      ? `Поля: ${values.join("; ")}.`
      : "Подходящих полей связи нет.",
    "Совпадения с вами нет.",
  ].join(" ");
}

async function describeDepartmentMiss(
  entity: Entity,
  record: EntityRecord,
  options: AccessOptions,
): Promise<string> {
  const departments = findDepartmentsEntity(options.entities);
  if (!departments) {
    return "Справочник отделов не найден, область «Своего отдела» никого не пускает.";
  }
  if (!entitySupportsDepartmentScope(entity, options.entities)) {
    return `У сущности «${entity.name}» нет связи с отделом. Область «Своего отдела» такие записи скрывает.`;
  }
  const viewerIds = collectViewerDepartmentIds(options.entities, {
    authUserId: options.authUserId,
    currentUserRecordId: options.userRecordId,
  });
  const recordIds = await collectRecordDepartmentIds(
    entity,
    record,
    departments,
    options.entities,
    0,
    new Set<string>(),
    { valueContext: options.valueContext },
  );
  const viewerLabel = await idList(
    departments,
    viewerIds,
    options.valueContext,
  );
  const recordLabelText = await idList(
    departments,
    recordIds,
    options.valueContext,
  );
  if (viewerIds.length === 0) {
    return `Область «${DATA_SCOPE_LABELS.department}» сущности «${entity.name}»: у вас не заполнен отдел. Отделы записи: ${recordLabelText}.`;
  }
  if (recordIds.length === 0) {
    return `Область «${DATA_SCOPE_LABELS.department}» сущности «${entity.name}»: у записи нет отдела. Ваши отделы: ${viewerLabel}.`;
  }
  return `Область «${DATA_SCOPE_LABELS.department}» сущности «${entity.name}»: отделы записи (${recordLabelText}) не пересекаются с вашими (${viewerLabel}).`;
}

async function describeFilterMiss(
  entity: Entity,
  record: EntityRecord,
  conditions: readonly EntityCondition[],
  options: AccessOptions,
): Promise<string> {
  if (conditions.length === 0) {
    return `Область «${DATA_SCOPE_LABELS.filter}» сущности «${entity.name}» без условий. Пустое условие запись не открывает.`;
  }
  const failed: string[] = [];
  for (const condition of conditions) {
    const matches = matchesEntityConditions(
      options.valueContext,
      entity,
      record,
      [condition],
      null,
      { missingFieldFails: true, authUserId: options.authUserId },
    );
    if (!matches) failed.push(conditionText(entity, condition));
  }
  const listed =
    failed.length > 0
      ? failed.join("; ")
      : conditions
          .map((condition) => conditionText(entity, condition))
          .join("; ");
  return `Область «${DATA_SCOPE_LABELS.filter}» сущности «${entity.name}»: запись не прошла условия (${listed}).`;
}

async function describeParentMiss(
  role: Role,
  entity: Entity,
  record: EntityRecord,
  options: AccessOptions,
): Promise<string> {
  const links = findParentVisibilityLinks(entity, options.entities);
  if (links.length === 0) {
    return "Родительской связи, которая могла бы открыть запись, нет.";
  }
  const parts: string[] = [];
  for (const link of links) {
    const field = entity.fields.find(
      (item) => item.id === link.childLinkFieldId,
    );
    const fieldName = field
      ? getEntityFieldDisplayName(field)
      : link.childLinkFieldId;
    const parentIds = parseEntityRelationIds(
      record.values[link.childLinkFieldId],
    );
    if (parentIds.length === 0) {
      parts.push(`«${fieldName}» пусто`);
      continue;
    }
    for (const parentId of parentIds) {
      const parent = await getEntityRecordById(link.parentEntity, parentId);
      if (!parent) {
        parts.push(
          `«${fieldName}»: ${link.parentEntity.name} ${parentId} не найден`,
        );
        continue;
      }
      const visible = await canViewRecordForDataScope(
        role,
        link.parentEntity,
        parent,
        {
          entities: options.entities,
          authUserId: options.authUserId,
          currentUserRecordId: options.userRecordId,
          valueContext: options.valueContext,
        },
      );
      const title = getEntityRecordTitle(
        options.valueContext,
        link.parentEntity,
        parent,
        parentId,
      );
      const scope = DATA_SCOPE_LABELS[entityScope(role, link.parentEntity.id)];
      const read = canEntity(role, link.parentEntity.id, "read")
        ? "чтение есть"
        : "чтения нет";
      parts.push(
        visible
          ? `${link.parentEntity.name} «${title}» виден`
          : `${link.parentEntity.name} «${title}» скрыт (область «${scope}», ${read})`,
      );
    }
  }
  return `Родители запись не открывают: ${parts.join("; ")}.`;
}

async function describeRecordMiss(
  role: Role,
  entity: Entity,
  record: EntityRecord,
  options: AccessOptions,
): Promise<string> {
  if (!canEntity(role, entity.id, "read")) {
    return `Нет права чтения сущности «${entity.name}». Задание открывается только вместе с его записью.`;
  }
  const scope = entityScope(role, entity.id);
  if (
    !(await matchesRecordDataScopeDirect(role, entity, record, {
      entities: options.entities,
      authUserId: options.authUserId,
      currentUserRecordId: options.userRecordId,
      valueContext: options.valueContext,
    }))
  ) {
    const direct =
      scope === "own"
        ? await describeOwnMiss(role, entity, record, options)
        : scope === "department"
          ? await describeDepartmentMiss(entity, record, options)
          : scope === "filter"
            ? await describeFilterMiss(
                entity,
                record,
                entityScopeFilter(role, entity.id) ?? [],
                options,
              )
            : `Область «${DATA_SCOPE_LABELS[scope]}» сущности «${entity.name}» запись не пропустила.`;
    const parent = await describeParentMiss(role, entity, record, options);
    return `${direct} ${parent}`;
  }
  return `Запись сущности «${entity.name}» скрыта областью «${DATA_SCOPE_LABELS[scope]}».`;
}

async function describeTaskScopeMiss(
  role: Role,
  task: AutomationTaskAccessSubject,
  options: AccessOptions,
): Promise<string> {
  const scope: DataScope = automationTasksScope(role);
  if (scope === "own") {
    if (!task.assigneeUserId) {
      return "Область заданий «Только свои»: у задания нет исполнителя.";
    }
    const assignee = await recordLabel(
      getSystemUsersEntity(options.entities),
      task.assigneeUserId,
      options.valueContext,
    );
    const you = [
      options.userRecordId,
      options.authUserId && options.authUserId !== options.userRecordId
        ? options.authUserId
        : null,
    ]
      .filter((id): id is string => id != null)
      .join(", ");
    return `Область заданий «Только свои»: исполнитель ${assignee}, а вы ${you || "не определены"}. Видны только свои задания.`;
  }

  if (scope === "department") {
    const users = getSystemUsersEntity(options.entities);
    const departments = findDepartmentsEntity(options.entities);
    const viewerIds = collectViewerDepartmentIds(options.entities, {
      authUserId: options.authUserId,
      currentUserRecordId: options.userRecordId,
    });
    const assigneeRecord = task.assigneeUserId
      ? ((await getEntityRecordById(users, task.assigneeUserId)) ??
        findSystemUserByAuthId(options.entities, task.assigneeUserId))
      : undefined;
    const assigneeDepartmentIds =
      assigneeRecord && users && departments
        ? collectUserDepartmentIds(
            assigneeRecord,
            users,
            departments,
            options.entities,
          )
        : [];
    const assignee = task.assigneeUserId
      ? await recordLabel(users, task.assigneeUserId, options.valueContext)
      : "не назначен";
    const viewerLabel = await idList(
      departments,
      viewerIds,
      options.valueContext,
    );
    const assigneeLabel = await idList(
      departments,
      assigneeDepartmentIds,
      options.valueContext,
    );
    const entity = entityById(options.entities, task.entityId);
    const record = await getEntityRecordById(entity, task.recordId);
    const recordPart = !entity
      ? `Сущность ${task.entityId} не найдена.`
      : !record
        ? `Запись ${task.recordId} сущности «${entity.name}» не найдена.`
        : await describeDepartmentMiss(entity, record, options);
    return `Область заданий «Своего отдела»: исполнитель ${assignee} (его отделы: ${assigneeLabel}), ваши отделы: ${viewerLabel}. ${recordPart}`;
  }

  const filter = automationTasksScopeFilter(role);
  if (!filter) {
    return "Область заданий «По полям» не указывает сущность. Такая область никого не пускает.";
  }
  const filterEntity = entityById(options.entities, filter.entityId);
  if (task.entityId !== filter.entityId) {
    const taskEntity = entityById(options.entities, task.entityId);
    return `Область заданий «По полям» настроена на «${filterEntity?.name ?? filter.entityId}», а задание относится к «${taskEntity?.name ?? task.entityId}».`;
  }
  if (filter.conditions.length === 0) {
    return "Область заданий «По полям» без условий. Пустое условие никого не пускает.";
  }
  if (!filterEntity) {
    return `Область заданий «По полям»: сущность ${filter.entityId} не найдена.`;
  }
  const record = await getEntityRecordById(filterEntity, task.recordId);
  if (!record) {
    return `Область заданий «По полям»: запись ${task.recordId} сущности «${filterEntity.name}» не найдена.`;
  }
  return `Область заданий «По полям». ${await describeFilterMiss(filterEntity, record, filter.conditions, options)}`;
}

async function describeLegalMiss(
  role: Role,
  entity: Entity,
  record: EntityRecord,
  options: AccessOptions,
): Promise<string> {
  const allowedIds = roleLegalEntityIds(role);
  const legalEntities = findLegalEntitiesEntity(options.entities);
  const linked =
    legalEntities &&
    entityCanLinkToLegalEntities(entity, legalEntities.id, options.entities)
      ? await collectRecordLegalEntityIds(
          entity,
          record,
          legalEntities.id,
          options.entities,
        )
      : [];
  const allowed = await idList(legalEntities, allowedIds, options.valueContext);
  const onRecord = await idList(legalEntities, linked, options.valueContext);
  if (linked.length === 0) {
    return `Роль видит только юрлица: ${allowed}. У записи «${entity.name}» юрлицо не найдено.`;
  }
  return `Роль видит только юрлица: ${allowed}. У записи «${entity.name}»: ${onRecord}. Пересечения нет.`;
}

function reportOf(
  allowed: boolean,
  reason: string,
  role: Role | null | undefined,
  task: AutomationTaskAccessSubject,
  options: AccessOptions,
  checks: AutomationTaskAccessCheck[],
): AutomationTaskAccessReport {
  const entity = entityById(options.entities, task.entityId);
  return {
    allowed,
    reason,
    role: role ? { id: role.id, name: role.name } : null,
    viewer: {
      authUserId: options.authUserId,
      userRecordId: options.userRecordId,
    },
    task: {
      id: task.id ?? null,
      name: task.name ?? null,
      assigneeUserId: task.assigneeUserId,
      entityId: task.entityId,
      entityName: entity?.name ?? null,
      recordId: task.recordId,
    },
    checks,
  };
}

/**
 * Same gates as `canViewAutomationTask`, with the failing step spelled out.
 * Call this when the task page is denied — not for every row of the list.
 */
export async function inspectAutomationTaskAccess(
  role: Role | null | undefined,
  task: AutomationTaskAccessSubject,
  options: AccessOptions,
): Promise<AutomationTaskAccessReport> {
  const checks: AutomationTaskAccessCheck[] = [];
  const deny = (reason: string) =>
    reportOf(false, reason, role, task, options, checks);

  if (!role) {
    checks.push({
      name: "Роль",
      passed: false,
      detail: "Роль пользователя не определена.",
    });
    return deny("Роль пользователя не определена.");
  }
  checks.push({
    name: "Роль",
    passed: true,
    detail: `«${role.name}» (${role.id})`,
  });

  if (!canAccessAutomationTasks(role)) {
    const detail = `В роли «${role.name}» выключен доступ к заданиям автоматизации.`;
    checks.push({ name: "Задания автоматизации", passed: false, detail });
    return deny(detail);
  }
  checks.push({
    name: "Задания автоматизации",
    passed: true,
    detail: "Доступ к заданиям включён.",
  });

  const taskScope = automationTasksScope(role);
  if (!(await taskMatchesAutomationScope(role, task, options))) {
    const detail = await describeTaskScopeMiss(role, task, options);
    checks.push({
      name: `Область заданий «${DATA_SCOPE_LABELS[taskScope]}»`,
      passed: false,
      detail,
    });
    return deny(detail);
  }
  checks.push({
    name: `Область заданий «${DATA_SCOPE_LABELS[taskScope]}»`,
    passed: true,
    detail: "Задание попадает в область роли.",
  });

  const entity = entityById(options.entities, task.entityId);
  const record = await getEntityRecordById(entity, task.recordId);
  if (!entity || !record) {
    const detail = !entity
      ? `Сущность задания ${task.entityId} не найдена в конфигурации.`
      : `Запись ${task.recordId} сущности «${entity.name}» не найдена.`;
    checks.push({ name: "Запись задания", passed: false, detail });
    return deny(detail);
  }
  checks.push({
    name: "Запись задания",
    passed: true,
    detail: `«${entity.name}», ${await recordLabel(entity, record.id, options.valueContext)}`,
  });

  const scopeOptions = {
    entities: options.entities,
    authUserId: options.authUserId,
    currentUserRecordId: options.userRecordId,
    valueContext: options.valueContext,
  };
  if (!(await canViewRecordForDataScope(role, entity, record, scopeOptions))) {
    const detail = await describeRecordMiss(role, entity, record, options);
    checks.push({ name: "Область записи", passed: false, detail });
    return deny(detail);
  }
  checks.push({
    name: "Область записи",
    passed: true,
    detail: `«${DATA_SCOPE_LABELS[entityScope(role, entity.id)]}» сущности «${entity.name}».`,
  });

  if (
    !(await canViewRecordForLegalEntities(
      role,
      entity,
      record,
      options.entities,
    ))
  ) {
    const detail = await describeLegalMiss(role, entity, record, options);
    checks.push({ name: "Юрлица", passed: false, detail });
    return deny(detail);
  }
  checks.push({
    name: "Юрлица",
    passed: true,
    detail:
      roleLegalEntityIds(role).length === 0
        ? "Ограничения по юрлицам нет."
        : "Запись входит в юрлица роли.",
  });

  return reportOf(true, "Доступ есть.", role, task, options, checks);
}

/** One console warning with the failing step, plus the check trail. */
export function logAutomationTaskAccessDenied(
  report: AutomationTaskAccessReport,
): void {
  const title = report.task.name
    ? `[access] Нет доступа к заданию «${report.task.name}»: ${report.reason}`
    : `[access] Нет доступа к заданию: ${report.reason}`;
  console.warn(title);
  console.info("[access] проверки доступа к заданию", {
    role: report.role,
    viewer: report.viewer,
    task: report.task,
    checks: report.checks,
  });
}
