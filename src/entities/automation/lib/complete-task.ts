import { getEntityConfig, getEntityFieldDisplayName } from "@/entities/entity";
import {
  completeAutomationTaskRpc,
  fetchAutomationTask,
  returnAutomationTaskForRevisionRpc,
} from "../api/automation-tasks-api";
import { executeAutomationActions } from "./execute-actions";

/** Complete via SQL RPC, then run rich client-side actions from outcome. */
export async function completeAutomationTask(
  taskId: string,
  outcomeId: string,
  actorUserId?: string | null,
) {
  const task = await fetchAutomationTask(taskId);
  if (!task) throw new Error("Задача не найдена");

  const outcome =
    task.config.outcomes.find((item) => item.id === outcomeId) ??
    task.config.outcomes[0];
  if (!outcome) throw new Error("Не выбран результат");

  const { entities } = getEntityConfig();
  const entity = entities.find((item) => item.id === task.entityId);
  const record = entity?.records.find((item) => item.id === task.recordId);
  const valuesBefore = record?.values ?? {};

  // Required fields from outcome form + optional requireFields action.
  const requireAction = outcome.actions.find(
    (action) => action.kind === "requireFields",
  );
  const requiredIds = [
    ...outcome.fieldAccess.requiredFieldIds,
    ...(requireAction && requireAction.kind === "requireFields"
      ? requireAction.fieldIds
      : []),
  ];
  const missingRequired = [...new Set(requiredIds)].filter(
    (fieldId) => !(valuesBefore[fieldId] ?? "").trim(),
  );
  if (missingRequired.length > 0) {
    const labels = missingRequired.map((fieldId) => {
      const field = entity?.fields.find((item) => item.id === fieldId);
      return field ? getEntityFieldDisplayName(field) : fieldId;
    });
    throw new Error(`Не заполнены обязательные поля: ${labels.join(", ")}`);
  }
  const previousValues: Record<string, string> = {
    ...(record?.values ?? {}),
  };

  const rpcResult = await completeAutomationTaskRpc(
    taskId,
    outcome.id,
    actorUserId,
  );

  // Refresh after SQL setField side-effects.
  const { entities: nextEntities } = getEntityConfig();
  const nextEntity = nextEntities.find((item) => item.id === task.entityId);
  const nextRecord = nextEntity?.records.find(
    (item) => item.id === task.recordId,
  );
  const values: Record<string, string> = {
    ...(nextRecord?.values ?? previousValues),
  };

  const richActions = outcome.actions.filter(
    (action) =>
      action.kind !== "setField" &&
      action.kind !== "noop" &&
      action.kind !== "requireFields" &&
      action.kind !== "cancelTasks",
  );

  if (richActions.length > 0) {
    const result = await executeAutomationActions(richActions, {
      entities: nextEntities,
      triggerEntityId: task.entityId,
      triggerRecordId: task.recordId,
      values,
      previousValues,
      actorUserId: actorUserId ?? null,
      depth: 1,
    });
    if (result.errors.length > 0) {
      throw new Error(result.errors.join("; "));
    }
  }

  return rpcResult;
}

export async function returnAutomationTaskForRevision(
  taskId: string,
  actorUserId?: string | null,
) {
  return returnAutomationTaskForRevisionRpc(taskId, actorUserId);
}
