import {
  addEntityRecord,
  getEntityParentLinkField,
  getEntityRelationTargetId,
  isEntityComputedFieldType,
  parseEntityRelationIds,
  resolveEntityFieldLabel,
  serializeEntityRelationIds,
  updateEntityRecord,
  waitForEntityRecordInsert,
  type Entity,
  type EntityField,
  type EntityFieldType,
} from "@/entities/entity";
import { createNotification } from "@/entities/notification/api/notifications-api";
import { isSupabaseConfigured, supabase } from "@/shared/api/supabase";
import { getErrorMessage } from "@/shared/lib/error-message";
import {
  createRecordAskDraftKey,
  createRecordNestedAskDraftKey,
  createRecordNestedCountDraftKey,
  type AutomationAction,
  type AutomationFieldMapping,
} from "../model/actions";
import { resolveAutomationActionValue } from "../model/action-values";
import type { AutomationAssigneeResolver } from "../model/assignee";
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
 * relation automatically unless the mapping already sets it.
 */
function withParentLink(
  values: Record<string, string>,
  target: Entity | null | undefined,
  ctx: AutomationExecutionContext,
): Record<string, string> {
  if (!target) return values;
  if (target.parentEntityId?.trim() !== ctx.triggerEntityId) return values;
  const parentLink = getEntityParentLinkField(target);
  if (!parentLink) return values;
  if (values[parentLink.id]?.trim()) return values;
  return {
    ...values,
    [parentLink.id]: serializeEntityRelationIds([ctx.triggerRecordId]),
  };
}

/** Link a child to an arbitrary parent record (e.g. just-created createRecord). */
function withExplicitParentLink(
  values: Record<string, string>,
  target: Entity | null | undefined,
  parentEntityId: string,
  parentRecordId: string,
): Record<string, string> {
  if (!target || !parentEntityId.trim() || !parentRecordId.trim()) {
    return values;
  }
  const parentLink =
    (target.parentEntityId?.trim() === parentEntityId
      ? getEntityParentLinkField(target)
      : null) ?? resolveChildParentLinkField(target, parentEntityId);
  if (!parentLink) return values;
  if (values[parentLink.id]?.trim()) return values;
  return {
    ...values,
    [parentLink.id]: serializeEntityRelationIds([parentRecordId]),
  };
}

function resolveChildParentLinkField(
  child: Entity,
  parentEntityId: string,
): EntityField | null {
  return (
    child.fields.find(
      (field) =>
        (field.type === "relation" || field.type === "belonging") &&
        getEntityRelationTargetId(field) === parentEntityId,
    ) ?? null
  );
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
    parentLink?: { parentEntityId: string; parentRecordId: string };
  },
) {
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
  if (options?.parentLink) {
    values = withExplicitParentLink(
      values,
      target,
      options.parentLink.parentEntityId,
      options.parentLink.parentRecordId,
    );
  } else {
    values = withParentLink(values, target, ctx);
  }
  const record = addEntityRecord(entityId, values);
  if (!record) {
    throw new Error("Не удалось создать запись");
  }
  await waitForEntityRecordInsert(record.id);
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
          const parentAsk = readAskDraftValues(
            ctx.formValues,
            action.askFieldIds,
            (fieldId) => createRecordAskDraftKey(action.id, fieldId),
          );
          const record = await createMappedRecord(
            action.entityId,
            action.mappings,
            ctx,
            createdRecordIds,
            { askOverrides: parentAsk },
          );
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
          const next = serializeEntityRelationIds([
            ...new Set(
              [...existing, ...parseEntityRelationIds(value), value].filter(
                Boolean,
              ),
            ),
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
