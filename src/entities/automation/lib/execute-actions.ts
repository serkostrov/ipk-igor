import {
  addEntityRecord,
  parseEntityRelationIds,
  serializeEntityRelationIds,
  updateEntityRecord,
  type Entity,
  type EntityFieldType,
} from "@/entities/entity";
import { createNotification } from "@/entities/notification/api/notifications-api";
import { isSupabaseConfigured, supabase } from "@/shared/api/supabase";
import type {
  AutomationAction,
  AutomationFieldMapping,
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
): Record<string, string> {
  const result: Record<string, string> = { ...(extra ?? {}) };
  for (const mapping of mappings) {
    result[mapping.targetFieldId] = resolveTemplateValue(
      mapping.source,
      ctx,
      createdRecordIds,
    );
  }
  return result;
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
          updateEntityRecord(ctx.triggerEntityId, ctx.triggerRecordId, {
            [action.fieldId]: resolved,
          });
          ctx.values[action.fieldId] = resolved;
          logs.push({ kind: "setField", fieldId: action.fieldId });
          break;
        }
        case "setFieldPrevious": {
          const prev = ctx.previousValues[action.fieldId] ?? "";
          updateEntityRecord(ctx.triggerEntityId, ctx.triggerRecordId, {
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
          const values = applyMappings(action.mappings, ctx, createdRecordIds);
          const record = addEntityRecord(action.entityId, values);
          if (record) {
            createdRecordIds.push(record.id);
            if (action.linkBackFieldId) {
              updateEntityRecord(ctx.triggerEntityId, ctx.triggerRecordId, {
                [action.linkBackFieldId]: serializeEntityRelationIds([
                  record.id,
                ]),
              });
              ctx.values[action.linkBackFieldId] = serializeEntityRelationIds([
                record.id,
              ]);
            }
            logs.push({
              kind: "createRecord",
              entityId: action.entityId,
              recordId: record.id,
            });
          }
          break;
        }
        case "createRecordsFromMapping": {
          const fanOut = parseEntityRelationIds(
            ctx.values[action.fanOutFieldId],
          );
          for (const itemId of fanOut) {
            const values = applyMappings(
              action.mappings,
              ctx,
              createdRecordIds,
              {
                [action.fanOutTargetFieldId]: serializeEntityRelationIds([
                  itemId,
                ]),
              },
            );
            const record = addEntityRecord(action.entityId, values);
            if (record) {
              createdRecordIds.push(record.id);
              logs.push({
                kind: "createRecordsFromMapping",
                recordId: record.id,
                fanOutId: itemId,
              });
            }
          }
          break;
        }
        case "updateRecords": {
          const target = ctx.entities.find(
            (entity) => entity.id === action.entityId,
          );
          if (!target) break;
          const linkIds = new Set(
            parseEntityRelationIds(ctx.values[action.linkFieldId]),
          );
          for (const record of target.records) {
            if (!linkIds.has(record.id)) continue;
            const patch = applyMappings(action.mappings, ctx, createdRecordIds);
            updateEntityRecord(action.entityId, record.id, patch);
            logs.push({ kind: "updateRecords", recordId: record.id });
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
          const patch = applyMappings(action.mappings, ctx, createdRecordIds);
          updateEntityRecord(targetEntityId, targetRecordId, patch);
          logs.push({ kind: "copyFields", recordId: targetRecordId });
          break;
        }
        case "setRelation": {
          const value = resolveTemplateValue(
            action.value,
            ctx,
            createdRecordIds,
          );
          updateEntityRecord(ctx.triggerEntityId, ctx.triggerRecordId, {
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
          updateEntityRecord(ctx.triggerEntityId, ctx.triggerRecordId, {
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
          const missing = action.fieldIds.filter(
            (fieldId) => !(ctx.values[fieldId] ?? "").trim(),
          );
          if (missing.length > 0) {
            throw new Error(
              `Не заполнены обязательные поля: ${missing.join(", ")}`,
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
            updateEntityRecord(targetEntityId, targetRecordId, {
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
      const message =
        error instanceof Error
          ? error.message
          : "Ошибка действия автоматизации";
      errors.push(message);
      logs.push({ kind: action.kind, error: message });
    }
  }

  return { logs, createdRecordIds, errors };
}
