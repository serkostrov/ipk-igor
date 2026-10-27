import {
  addEntityRecord,
  getEntityConfig,
  getEntityParentLinkField,
  getEntityRelationTargetId,
  isEntityComputedFieldType,
  isEntityParentLinkField,
  parseEntityRelationIds,
  resolveEntityFieldLabel,
  serializeEntityRelationIds,
  updateEntityRecord,
  waitForEntityRecordInsert,
  type Entity,
  type EntityFieldType,
} from "@/entities/entity";
import { createNotification } from "@/entities/notification/api/notifications-api";
import { isSupabaseConfigured, supabase } from "@/shared/api/supabase";
import { getErrorMessage } from "@/shared/lib/error-message";
import {
  CREATE_RECORD_MULTI_NESTED_ID,
  createRecordAskDraftKey,
  createRecordNestedAskDraftKey,
  createRecordNestedCountDraftKey,
  createRecordUnderRelatedNestedId,
  getCreateParentFromRelatedList,
  type AutomationAction,
  type AutomationFieldMapping,
} from "../model/actions";
import { resolveAutomationActionValue } from "../model/action-values";
import type { AutomationAssigneeResolver } from "../model/assignee";
import {
  collectRecordsLinkedToParent,
  resolveCreateParentFromRelated,
  resolveHostChildParentLinkField,
  resolveParentForwardChildField,
} from "./ask-related";
import {
  resolveCreateRecordAskFields,
  resolveCreateRecordParentHost,
  resolveCreateRecordParentHosts,
} from "./create-ask-fields";
import { resolveAssigneeUserIds } from "./resolve-assignee";
import { renderAutomationNameTemplate } from "./render-name-template";

export type AutomationExecutionContext = {
  entities: Entity[];
  triggerEntityId: string;
  triggerRecordId: string;
  values: Record<string, string>;
  previousValues: Record<string, string>;
  actorUserId: string | null;
  /** Depth guard — incremented on nested startProcess. */
  depth: number;
  /**
   * Task-form draft (incl. create:{actionId}:… keys). Ask values override
   * mappings when creating records from createRecord.
   */
  formValues?: Record<string, string>;
  /**
   * Silent autofill retries: if a linked child already exists for this parent,
   * reuse it instead of inserting another copy (create runs before RPC complete).
   */
  reuseExistingLinkedCreates?: boolean;
};

export type AutomationExecutionResult = {
  logs: Array<Record<string, unknown>>;
  createdRecordIds: string[];
  errors: string[];
};

const MAX_DEPTH = 5;
const MAX_ACTIONS = 40;

function resolveTemplateValue(
  source: string,
  ctx: AutomationExecutionContext,
  createdRecordIds: string[],
  fieldType?: EntityFieldType,
  datetimeWithTime?: boolean,
): string {
  return resolveAutomationActionValue(source, ctx.values, {
    createdRecordIds,
    actorUserId: ctx.actorUserId,
    fieldType,
    datetimeWithTime,
    entities: ctx.entities,
    triggerEntityId: ctx.triggerEntityId,
    triggerRecordId: ctx.triggerRecordId,
    values: ctx.values,
  });
}

function fieldMeta(
  ctx: AutomationExecutionContext,
  fieldId: string,
): {
  fieldType?: EntityFieldType;
  datetimeWithTime?: boolean;
} {
  const entity = ctx.entities.find((item) => item.id === ctx.triggerEntityId);
  const field = entity?.fields.find((item) => item.id === fieldId);
  if (!field) return {};
  return {
    fieldType: field.type,
    datetimeWithTime: field.datetimeWithTime !== false,
  };
}

function applyMappings(
  mappings: AutomationFieldMapping[],
  ctx: AutomationExecutionContext,
  createdRecordIds: string[],
  extra?: Record<string, string>,
  targetEntity?: Entity | null,
): Record<string, string> {
  const result: Record<string, string> = { ...(extra ?? {}) };
  for (const mapping of mappings) {
    if (!mapping.targetFieldId.trim()) continue;
    const targetField = targetEntity?.fields.find(
      (field) => field.id === mapping.targetFieldId,
    );
    result[mapping.targetFieldId] = resolveTemplateValue(
      mapping.source,
      ctx,
      createdRecordIds,
      targetField?.type,
      targetField?.datetimeWithTime !== false,
    );
  }
  return result;
}

/**
 * When creating a sub-entity row under the trigger record, link the parent
 * relation automatically (owned child or linked-entity tab).
 */
function withParentLink(
  values: Record<string, string>,
  target: Entity | null | undefined,
  ctx: AutomationExecutionContext,
): Record<string, string> {
  if (!target) return values;
  const host = ctx.entities.find((entity) => entity.id === ctx.triggerEntityId);
  if (!host) return values;
  const resolved = resolveHostChildParentLinkField(host, target);
  if (!resolved) return values;
  if (values[resolved.field.id]?.trim()) return values;
  return {
    ...values,
    [resolved.field.id]: serializeEntityRelationIds([ctx.triggerRecordId]),
  };
}

type CreateParentLink = { parentEntityId: string; parentRecordId: string };

/** Link a child to an arbitrary parent record (e.g. just-created createRecord). */
function withExplicitParentLink(
  values: Record<string, string>,
  target: Entity | null | undefined,
  parentEntityId: string,
  parentRecordId: string,
  entities: Entity[],
): Record<string, string> {
  if (!target || !parentEntityId.trim() || !parentRecordId.trim()) {
    return values;
  }
  const host = entities.find((entity) => entity.id === parentEntityId) ?? null;
  const resolved = host ? resolveHostChildParentLinkField(host, target) : null;
  const parentLink =
    resolved?.field ??
    (target.parentEntityId?.trim() === parentEntityId
      ? getEntityParentLinkField(target)
      : null) ??
    target.fields.find(
      (field) =>
        (field.type === "relation" || field.type === "belonging") &&
        getEntityRelationTargetId(field) === parentEntityId,
    ) ??
    null;
  if (!parentLink) return values;
  const existing = parseEntityRelationIds(values[parentLink.id]);
  if (existing.includes(parentRecordId)) return values;
  return {
    ...values,
    [parentLink.id]: serializeEntityRelationIds([...existing, parentRecordId]),
  };
}

function withExplicitParentLinks(
  values: Record<string, string>,
  target: Entity | null | undefined,
  parentLinks: readonly CreateParentLink[],
  entities: Entity[],
): Record<string, string> {
  let next = values;
  for (const link of parentLinks) {
    next = withExplicitParentLink(
      next,
      target,
      link.parentEntityId,
      link.parentRecordId,
      entities,
    );
  }
  return next;
}

/** Append created child id onto each parent's forward relation to the child. */
async function writeBackChildToParents(
  childEntityId: string,
  childRecordId: string,
  parentLinks: readonly CreateParentLink[],
  entities: Entity[],
) {
  for (const link of parentLinks) {
    // Schema from ctx; record values from live store (ctx may be stale after updates).
    const parentSchema =
      entities.find((entity) => entity.id === link.parentEntityId) ?? null;
    if (!parentSchema) continue;
    const field = resolveParentForwardChildField(parentSchema, childEntityId);
    if (!field) continue;
    const liveParent = getEntityConfig().entities.find(
      (entity) => entity.id === link.parentEntityId,
    );
    const parentRecord = liveParent?.records.find(
      (record) => record.id === link.parentRecordId,
    );
    const existing = parseEntityRelationIds(
      parentRecord?.values[field.id] ?? "",
    );
    if (existing.includes(childRecordId)) continue;
    await updateEntityRecord(link.parentEntityId, link.parentRecordId, {
      [field.id]: serializeEntityRelationIds([...existing, childRecordId]),
    });
  }
}

function readAskDraftValues(
  formValues: Record<string, string> | undefined,
  fieldIds: string[] | undefined,
  keyFor: (fieldId: string) => string,
): Record<string, string> {
  if (!formValues || !fieldIds?.length) return {};
  const result: Record<string, string> = {};
  for (const fieldId of fieldIds) {
    const key = keyFor(fieldId);
    if (key in formValues) result[fieldId] = formValues[key] ?? "";
  }
  return result;
}

function readNestedDraftCount(
  formValues: Record<string, string> | undefined,
  actionId: string,
  nestedId: string,
): number {
  if (!formValues) return 0;
  const raw =
    formValues[createRecordNestedCountDraftKey(actionId, nestedId)] ?? "";
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(Math.floor(n), 50);
}

/** Reuse a linked child on silent retry (create runs before RPC marks done). */
function findExistingLinkedChild(
  ctx: AutomationExecutionContext,
  childEntityId: string,
  parentEntityId: string,
  parentRecordId: string,
): { id: string } | null {
  if (!ctx.reuseExistingLinkedCreates) return null;
  const child =
    ctx.entities.find((entity) => entity.id === childEntityId) ?? null;
  const host =
    ctx.entities.find((entity) => entity.id === parentEntityId) ?? null;
  if (!child || !parentRecordId.trim()) return null;
  const existing = collectRecordsLinkedToParent({
    childEntity: child,
    parentEntityId,
    parentRecordId,
    host,
  });
  const id = existing[0];
  return id ? { id } : null;
}

/** True when mappings actually fill at least one target field. */
function mappingsHaveTargets(mappings: AutomationFieldMapping[]) {
  return mappings.some((mapping) => mapping.targetFieldId.trim().length > 0);
}

/**
 * Values that are only parent-links / empty would create a «Без названия» ghost
 * row — skip those inserts.
 */
function createValuesAreMeaningful(
  target: Entity | null | undefined,
  values: Record<string, string>,
  parentLinkFieldIds: readonly string[],
): boolean {
  if (!target) {
    return Object.values(values).some((value) => value.trim().length > 0);
  }
  const exclude = new Set(parentLinkFieldIds.filter(Boolean));
  return target.fields.some((field) => {
    if (exclude.has(field.id)) return false;
    if (isEntityParentLinkField(field, parentLinkFieldIds[0] ?? null)) {
      return false;
    }
    if (isEntityComputedFieldType(field.type)) return false;
    if (field.type === "file" || field.type === "dependencies") return false;
    return (values[field.id] ?? "").trim().length > 0;
  });
}

function resolveCreateParentLinkFieldId(
  target: Entity | null | undefined,
  parentEntityId: string | undefined,
  entities: Entity[],
): string | null {
  if (!target || !parentEntityId?.trim()) return null;
  const host = entities.find((entity) => entity.id === parentEntityId) ?? null;
  if (host) {
    const fromHost = resolveHostChildParentLinkField(host, target);
    if (fromHost) return fromHost.field.id;
  }
  if (target.parentEntityId?.trim() === parentEntityId) {
    const owned = getEntityParentLinkField(target);
    if (owned) return owned.id;
  }
  return (
    target.fields.find(
      (field) =>
        (field.type === "relation" || field.type === "belonging") &&
        getEntityRelationTargetId(field) === parentEntityId,
    )?.id ?? null
  );
}

async function createMappedRecord(
  entityId: string,
  mappings: AutomationFieldMapping[],
  ctx: AutomationExecutionContext,
  createdRecordIds: string[],
  options?: {
    extra?: Record<string, string>;
    /** Ask-form values — win over mappings. */
    askOverrides?: Record<string, string>;
    /** Link to this parent instead of the trigger (nested creates). */
    parentLink?: CreateParentLink;
    /** Link to several parents (trigger + related) on one created row. */
    parentLinks?: readonly CreateParentLink[];
    /** Also append child id onto each parent's forward relation to child. */
    writeBackToParents?: boolean;
  },
): Promise<{ id: string } | null> {
  const target = ctx.entities.find((entity) => entity.id === entityId) ?? null;
  let values = applyMappings(
    mappings,
    ctx,
    createdRecordIds,
    options?.extra,
    target,
  );
  if (options?.askOverrides) {
    values = { ...values, ...options.askOverrides };
  }
  const parentLinks: CreateParentLink[] = options?.parentLinks?.length
    ? [...options.parentLinks]
    : options?.parentLink
      ? [options.parentLink]
      : [];
  if (parentLinks.length > 0) {
    values = withExplicitParentLinks(values, target, parentLinks, ctx.entities);
  } else {
    values = withParentLink(values, target, ctx);
  }
  const parentLinkFieldIds =
    parentLinks.length > 0
      ? parentLinks
          .map((link) =>
            resolveCreateParentLinkFieldId(
              target,
              link.parentEntityId,
              ctx.entities,
            ),
          )
          .filter((id): id is string => Boolean(id))
      : [
          resolveCreateParentLinkFieldId(
            target,
            ctx.triggerEntityId,
            ctx.entities,
          ),
        ].filter((id): id is string => Boolean(id));
  // Skip shell rows that would show as «Без названия» (parent link only / empty).
  if (!createValuesAreMeaningful(target, values, parentLinkFieldIds)) {
    return null;
  }
  const record = addEntityRecord(entityId, values);
  if (!record) {
    throw new Error("Не удалось создать запись");
  }
  await waitForEntityRecordInsert(record.id);
  if (options?.writeBackToParents && parentLinks.length > 0) {
    await writeBackChildToParents(
      entityId,
      record.id,
      parentLinks,
      ctx.entities,
    );
  }
  return record;
}

function resolveUserIds(
  resolver: AutomationAssigneeResolver,
  ctx: AutomationExecutionContext,
): string[] {
  return resolveAssigneeUserIds(resolver, {
    values: ctx.values,
    previousValues: ctx.previousValues,
    actorUserId: ctx.actorUserId,
    entities: ctx.entities,
    triggerEntityId: ctx.triggerEntityId,
    triggerRecordId: ctx.triggerRecordId,
  });
}

/**
 * Executes action pipeline beyond what SQL `complete_automation_task` covers.
 * Safe to call after RPC complete for createRecord / copy / notify / etc.
 */
export async function executeAutomationActions(
  actions: AutomationAction[],
  ctx: AutomationExecutionContext,
): Promise<AutomationExecutionResult> {
  const logs: Array<Record<string, unknown>> = [];
  const createdRecordIds: string[] = [];
  const errors: string[] = [];

  if (ctx.depth >= MAX_DEPTH) {
    errors.push("Превышена глубина вложенных автоматизаций");
    return { logs, createdRecordIds, errors };
  }

  const limited = actions.slice(0, MAX_ACTIONS);

  for (const action of limited) {
    try {
      switch (action.kind) {
        case "noop":
          logs.push({ kind: "noop" });
          break;
        case "setField": {
          const meta = fieldMeta(ctx, action.fieldId);
          const resolved = resolveTemplateValue(
            action.value,
            ctx,
            createdRecordIds,
            meta.fieldType,
            meta.datetimeWithTime,
          );
          await updateEntityRecord(ctx.triggerEntityId, ctx.triggerRecordId, {
            [action.fieldId]: resolved,
          });
          ctx.values[action.fieldId] = resolved;
          logs.push({ kind: "setField", fieldId: action.fieldId });
          break;
        }
        case "setFieldPrevious": {
          const prev = ctx.previousValues[action.fieldId] ?? "";
          await updateEntityRecord(ctx.triggerEntityId, ctx.triggerRecordId, {
            [action.fieldId]: prev,
          });
          ctx.values[action.fieldId] = prev;
          logs.push({ kind: "setFieldPrevious", fieldId: action.fieldId });
          break;
        }
        case "viewField":
          logs.push({ kind: "viewField", fieldIds: action.fieldIds });
          break;
        case "viewTabs":
          logs.push({
            kind: "viewTabs",
            tabIds: action.tabIds,
            filesTabEntryIds: action.filesTabEntryIds ?? {},
            filesTabAllowMove: action.filesTabAllowMove === true,
          });
          break;
        case "createRecord": {
          if (!action.entityId.trim()) {
            throw new Error("Не выбрана сущность для создания записи");
          }
          const createTarget =
            ctx.entities.find((entity) => entity.id === action.entityId) ??
            null;
          const triggerEntity =
            ctx.entities.find((entity) => entity.id === ctx.triggerEntityId) ??
            null;
          const createParentHosts = resolveCreateRecordParentHosts(
            action,
            triggerEntity,
            ctx.entities,
          );
          const createParentHost =
            createParentHosts[0] ??
            resolveCreateRecordParentHost(action, triggerEntity, ctx.entities);
          const createAskFieldIds = createTarget
            ? resolveCreateRecordAskFields(
                action,
                createTarget,
                createParentHosts.length > 0
                  ? createParentHosts
                  : createParentHost,
              ).askFieldIds
            : (action.askFieldIds ?? []);
          const parentFromRelatedList = getCreateParentFromRelatedList(action);
          if (parentFromRelatedList.length > 0) {
            if (!triggerEntity) {
              throw new Error(
                "Не найдена сущность задачи для создания записей",
              );
            }
            const multiIds: string[] = [];
            const relatedMappings =
              action.useEntityCreateForm === true ? [] : action.mappings;
            const relatedParentLinks: CreateParentLink[] = [];
            const seenRelatedParent = new Set<string>();
            let resolvedAny = false;
            for (const parentFrom of parentFromRelatedList) {
              const relatedParents = resolveCreateParentFromRelated({
                triggerEntity,
                entities: ctx.entities,
                parentFrom,
                triggerRecordId: ctx.triggerRecordId,
                triggerValues: ctx.values,
              });
              if (!relatedParents) continue;
              if (relatedParents.parentRecordIds.length > 0) {
                resolvedAny = true;
              }
              for (const parentRecordId of relatedParents.parentRecordIds) {
                const key = `${relatedParents.parentEntity.id}:${parentRecordId}`;
                if (seenRelatedParent.has(key)) continue;
                seenRelatedParent.add(key);
                relatedParentLinks.push({
                  parentEntityId: relatedParents.parentEntity.id,
                  parentRecordId,
                });
              }
            }

            if (action.alsoLinkTrigger) {
              // One create pass: link each new row to trigger + all related parents.
              const parentLinks: CreateParentLink[] = [
                {
                  parentEntityId: ctx.triggerEntityId,
                  parentRecordId: ctx.triggerRecordId,
                },
                ...relatedParentLinks,
              ];
              let triggerCount = readNestedDraftCount(
                ctx.formValues,
                action.id,
                CREATE_RECORD_MULTI_NESTED_ID,
              );
              if (
                triggerCount === 0 &&
                action.useEntityCreateForm !== true &&
                mappingsHaveTargets(relatedMappings)
              ) {
                triggerCount = 1;
              }
              for (let index = 0; index < triggerCount; index++) {
                const multiAsk = readAskDraftValues(
                  ctx.formValues,
                  createAskFieldIds,
                  (fieldId) =>
                    createRecordNestedAskDraftKey(
                      action.id,
                      CREATE_RECORD_MULTI_NESTED_ID,
                      index,
                      fieldId,
                    ),
                );
                const child = await createMappedRecord(
                  action.entityId,
                  relatedMappings,
                  ctx,
                  createdRecordIds,
                  {
                    askOverrides: multiAsk,
                    parentLinks,
                    writeBackToParents: true,
                  },
                );
                if (!child) continue;
                createdRecordIds.push(child.id);
                multiIds.push(child.id);
              }
              if (action.linkBackFieldId && multiIds.length > 0) {
                const linked = serializeEntityRelationIds(multiIds);
                await updateEntityRecord(
                  ctx.triggerEntityId,
                  ctx.triggerRecordId,
                  { [action.linkBackFieldId]: linked },
                );
                ctx.values[action.linkBackFieldId] = linked;
              }
            } else {
              // Fan-out: create under each related parent record separately.
              if (!resolvedAny || relatedParentLinks.length === 0) {
                throw new Error(
                  "Не удалось определить связанные записи-родители для создания",
                );
              }
              for (const parentLink of relatedParentLinks) {
                const nestedId = createRecordUnderRelatedNestedId(
                  parentLink.parentRecordId,
                );
                let count = readNestedDraftCount(
                  ctx.formValues,
                  action.id,
                  nestedId,
                );
                // Mapped autofill under related parents: no drafts → one row each
                // only when mappings actually fill fields (avoids empty ghosts).
                if (
                  count === 0 &&
                  action.useEntityCreateForm !== true &&
                  mappingsHaveTargets(relatedMappings)
                ) {
                  count = 1;
                }
                for (let index = 0; index < count; index++) {
                  const multiAsk = readAskDraftValues(
                    ctx.formValues,
                    createAskFieldIds,
                    (fieldId) =>
                      createRecordNestedAskDraftKey(
                        action.id,
                        nestedId,
                        index,
                        fieldId,
                      ),
                  );
                  const child = await createMappedRecord(
                    action.entityId,
                    relatedMappings,
                    ctx,
                    createdRecordIds,
                    {
                      askOverrides: multiAsk,
                      parentLink,
                      writeBackToParents: true,
                    },
                  );
                  if (!child) continue;
                  createdRecordIds.push(child.id);
                  multiIds.push(child.id);
                }
              }
            }
            logs.push({
              kind: "createRecord",
              entityId: action.entityId,
              multiple: true,
              parentFromRelated: true,
              recordIds: multiIds,
            });
            break;
          }
          if (action.multiple) {
            const multiMappings =
              action.useEntityCreateForm === true ? [] : action.mappings;
            let count = readNestedDraftCount(
              ctx.formValues,
              action.id,
              CREATE_RECORD_MULTI_NESTED_ID,
            );
            // Autofill / mapped create with «multiple» but no drafts → one row
            // only when mappings fill real fields (avoids empty ghosts).
            if (
              count === 0 &&
              action.useEntityCreateForm !== true &&
              mappingsHaveTargets(multiMappings)
            ) {
              count = 1;
            }
            if (count === 0) {
              logs.push({
                kind: "createRecord",
                entityId: action.entityId,
                multiple: true,
                recordIds: [],
              });
              break;
            }
            const multiIds: string[] = [];
            const multiParentId = createParentHost?.id ?? ctx.triggerEntityId;
            for (let index = 0; index < count; index++) {
              const multiAsk = readAskDraftValues(
                ctx.formValues,
                createAskFieldIds,
                (fieldId) =>
                  createRecordNestedAskDraftKey(
                    action.id,
                    CREATE_RECORD_MULTI_NESTED_ID,
                    index,
                    fieldId,
                  ),
              );
              const child = await createMappedRecord(
                action.entityId,
                multiMappings,
                ctx,
                createdRecordIds,
                {
                  askOverrides: multiAsk,
                  parentLink: {
                    parentEntityId: multiParentId,
                    parentRecordId: ctx.triggerRecordId,
                  },
                  writeBackToParents: true,
                },
              );
              if (!child) continue;
              createdRecordIds.push(child.id);
              multiIds.push(child.id);
            }
            if (action.linkBackFieldId && multiIds.length > 0) {
              const linked = serializeEntityRelationIds(multiIds);
              await updateEntityRecord(
                ctx.triggerEntityId,
                ctx.triggerRecordId,
                { [action.linkBackFieldId]: linked },
              );
              ctx.values[action.linkBackFieldId] = linked;
            }
            logs.push({
              kind: "createRecord",
              entityId: action.entityId,
              multiple: true,
              recordIds: multiIds,
            });
            break;
          }
          const parentAsk = readAskDraftValues(
            ctx.formValues,
            createAskFieldIds,
            (fieldId) => createRecordAskDraftKey(action.id, fieldId),
          );
          // Keep mappings for silent autofill even when askFieldIds are set
          // from builder defaults (empty form drafts).
          const singleMappings =
            action.useEntityCreateForm === true &&
            Object.keys(parentAsk).length > 0
              ? []
              : action.mappings;
          const singleParentId = createParentHost?.id ?? ctx.triggerEntityId;
          // Silent retry: do not insert another linked child when one exists.
          const reused =
            Object.keys(parentAsk).length === 0
              ? findExistingLinkedChild(
                  ctx,
                  action.entityId,
                  singleParentId,
                  ctx.triggerRecordId,
                )
              : null;
          const record = reused
            ? { id: reused.id }
            : await createMappedRecord(
                action.entityId,
                singleMappings,
                ctx,
                createdRecordIds,
                {
                  askOverrides: parentAsk,
                  parentLink: {
                    parentEntityId: singleParentId,
                    parentRecordId: ctx.triggerRecordId,
                  },
                  writeBackToParents: true,
                },
              );
          if (!record) {
            logs.push({
              kind: "createRecord",
              entityId: action.entityId,
              recordIds: [],
            });
            break;
          }
          createdRecordIds.push(record.id);
          if (action.linkBackFieldId) {
            const linked = serializeEntityRelationIds([record.id]);
            await updateEntityRecord(ctx.triggerEntityId, ctx.triggerRecordId, {
              [action.linkBackFieldId]: linked,
            });
            ctx.values[action.linkBackFieldId] = linked;
          }
          const nestedCreatedIds: string[] = [];
          for (const nested of action.nestedCreates ?? []) {
            if (!nested.entityId.trim()) continue;
            const count = readNestedDraftCount(
              ctx.formValues,
              action.id,
              nested.id,
            );
            for (let index = 0; index < count; index++) {
              const nestedAsk = readAskDraftValues(
                ctx.formValues,
                nested.askFieldIds,
                (fieldId) =>
                  createRecordNestedAskDraftKey(
                    action.id,
                    nested.id,
                    index,
                    fieldId,
                  ),
              );
              const child = await createMappedRecord(
                nested.entityId,
                nested.mappings ?? [],
                ctx,
                createdRecordIds,
                {
                  askOverrides: nestedAsk,
                  parentLink: {
                    parentEntityId: action.entityId,
                    parentRecordId: record.id,
                  },
                },
              );
              if (!child) continue;
              nestedCreatedIds.push(child.id);
            }
          }
          logs.push({
            kind: "createRecord",
            entityId: action.entityId,
            recordId: record.id,
            // `"created"` in later setRelation / addRelation = parent id only.
            nestedRecordIds: nestedCreatedIds,
          });
          break;
        }
        case "updateRecords": {
          const target = ctx.entities.find(
            (entity) => entity.id === action.entityId,
          );
          if (!target || !action.linkFieldId.trim()) break;
          const linkMode =
            action.linkMode === "backRelation" ? "backRelation" : "relation";
          const matches =
            linkMode === "backRelation"
              ? target.records.filter((record) =>
                  parseEntityRelationIds(
                    record.values[action.linkFieldId],
                  ).includes(ctx.triggerRecordId),
                )
              : (() => {
                  const linkIds = new Set(
                    parseEntityRelationIds(ctx.values[action.linkFieldId]),
                  );
                  return target.records.filter((record) =>
                    linkIds.has(record.id),
                  );
                })();
          for (const record of matches) {
            const patch = applyMappings(
              action.mappings,
              ctx,
              createdRecordIds,
              undefined,
              target,
            );
            await updateEntityRecord(action.entityId, record.id, patch);
            logs.push({
              kind: "updateRecords",
              recordId: record.id,
              linkMode,
            });
          }
          break;
        }
        case "copyFields": {
          let targetEntityId = ctx.triggerEntityId;
          let targetRecordId = ctx.triggerRecordId;
          if (action.targetRelationFieldId !== "self") {
            const ids = parseEntityRelationIds(
              ctx.values[action.targetRelationFieldId],
            );
            const first = ids[0];
            if (!first) break;
            targetRecordId = first;
            const linked = ctx.entities.find((entity) =>
              entity.records.some((record) => record.id === first),
            );
            if (linked) targetEntityId = linked.id;
          }
          const targetEntity =
            ctx.entities.find((entity) => entity.id === targetEntityId) ?? null;
          const patch = applyMappings(
            action.mappings,
            ctx,
            createdRecordIds,
            undefined,
            targetEntity,
          );
          await updateEntityRecord(targetEntityId, targetRecordId, patch);
          logs.push({ kind: "copyFields", recordId: targetRecordId });
          break;
        }
        case "setRelation": {
          const value = resolveTemplateValue(
            action.value,
            ctx,
            createdRecordIds,
          );
          await updateEntityRecord(ctx.triggerEntityId, ctx.triggerRecordId, {
            [action.fieldId]: value.includes("[")
              ? value
              : serializeEntityRelationIds(value ? [value] : []),
          });
          logs.push({ kind: "setRelation", fieldId: action.fieldId });
          break;
        }
        case "addRelation": {
          const value = resolveTemplateValue(
            action.value,
            ctx,
            createdRecordIds,
          );
          const existing = parseEntityRelationIds(ctx.values[action.fieldId]);
          const fromValue = parseEntityRelationIds(value);
          const extras =
            fromValue.length > 0
              ? fromValue
              : value.trim()
                ? [value.trim()]
                : [];
          const next = serializeEntityRelationIds([
            ...new Set([...existing, ...extras].filter(Boolean)),
          ]);
          await updateEntityRecord(ctx.triggerEntityId, ctx.triggerRecordId, {
            [action.fieldId]: next,
          });
          logs.push({ kind: "addRelation", fieldId: action.fieldId });
          break;
        }
        case "notify": {
          const recipients = resolveUserIds(action.recipient, ctx);
          const message = renderAutomationNameTemplate(
            action.message,
            ctx.values,
            action.message || "Уведомление",
          );
          for (const userId of recipients) {
            await createNotification({
              userId,
              title: "Уведомление",
              message,
              source: "action",
              entityId: ctx.triggerEntityId,
              recordId: ctx.triggerRecordId,
              showToast: true,
            });
          }
          logs.push({
            kind: "notify",
            message,
            recipients,
          });
          break;
        }
        case "requireFields": {
          const entity = ctx.entities.find(
            (item) => item.id === ctx.triggerEntityId,
          );
          const missing = action.fieldIds.filter((fieldId) => {
            const field = entity?.fields.find((item) => item.id === fieldId);
            if (!field) return false;
            if (isEntityComputedFieldType(field.type)) return false;
            return !(ctx.values[fieldId] ?? "").trim();
          });
          if (missing.length > 0) {
            const labels = missing.map((fieldId) =>
              resolveEntityFieldLabel(entity?.fields ?? [], fieldId),
            );
            throw new Error(
              `Не заполнены обязательные поля: ${labels.join(", ")}`,
            );
          }
          logs.push({ kind: "requireFields", ok: true });
          break;
        }
        case "cancelTasks": {
          if (isSupabaseConfigured && supabase) {
            let query = supabase
              .from("automation_tasks")
              .update({
                status: "cancelled",
                updated_at: new Date().toISOString(),
              })
              .eq("record_id", ctx.triggerRecordId)
              .eq("status", "pending");
            if (action.templateIds && action.templateIds.length > 0) {
              query = query.in("template_id", action.templateIds);
            }
            await query;
          }
          logs.push({ kind: "cancelTasks" });
          break;
        }
        case "startProcess":
        case "spawnTasks":
        case "attachToFolder":
          // startProcess: enter option → DB spawn; spawnTasks/attach deferred.
          logs.push({ kind: action.kind, deferred: true });
          if (
            action.kind === "startProcess" &&
            action.enterFieldId &&
            action.enterOptionId
          ) {
            let targetEntityId = ctx.triggerEntityId;
            let targetRecordId = ctx.triggerRecordId;
            if (action.targetRelationFieldId !== "self") {
              const ids = parseEntityRelationIds(
                ctx.values[action.targetRelationFieldId],
              );
              const first = ids[0];
              if (first) {
                targetRecordId = first;
                const linked = ctx.entities.find((entity) =>
                  entity.records.some((record) => record.id === first),
                );
                if (linked) targetEntityId = linked.id;
              }
            }
            await updateEntityRecord(targetEntityId, targetRecordId, {
              [action.enterFieldId]: action.enterOptionId,
            });
            logs.push({
              kind: "startProcess",
              processId: action.processId,
              recordId: targetRecordId,
            });
          }
          break;
      }
    } catch (error: unknown) {
      const message = getErrorMessage(error, "Ошибка действия автоматизации");
      errors.push(message);
      logs.push({ kind: action.kind, error: message });
    }
  }

  return { logs, createdRecordIds, errors };
}
