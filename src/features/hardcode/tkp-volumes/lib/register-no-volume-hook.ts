/**
 * After dept-calc task completes with «Нет объёмов» — store issue + notify GIP.
 */

import { registerAfterAutomationTaskCompleteHook } from "@/entities/automation/lib/hardcode-hooks";
import {
  getEntityRecordById,
  getEntityConfig,
  getEntityRecordTitle,
  getEntityValueContext,
  isTkpAnalysisEntity,
  resolveTkpGipUserIdsFromHost,
} from "@/entities/entity";
import { createNotification } from "@/entities/notification";
import {
  appendTkpNoVolumeIssue,
  formatNoVolumeNotifyBody,
  formatNoVolumeNotifyTitle,
  isNoVolumeOutcomeLabel,
  resolveAssigneeDisplayName,
} from "../model/no-volume";

let registered = false;

/** Idempotent — import once from hardcode barrel / app boot. */
export function registerTkpNoVolumeAfterCompleteHook(): void {
  if (registered) return;
  registered = true;
  registerAfterAutomationTaskCompleteHook(handleNoVolumeAfterComplete);
}

export async function handleNoVolumeAfterComplete(args: {
  entityId: string;
  recordId: string;
  values: Record<string, string>;
  triggerOptionId?: string | null;
  taskId?: string | null;
  taskName?: string | null;
  outcomeId?: string | null;
  outcomeLabel?: string | null;
  assigneeUserId?: string | null;
}): Promise<void> {
  if (!isNoVolumeOutcomeLabel(args.outcomeLabel)) return;
  if (!args.taskId) return;

  const entities = getEntityConfig().entities;
  const entity = entities.find((item) => item.id === args.entityId);
  if (!entity || !isTkpAnalysisEntity(entity)) return;

  const record = (await getEntityRecordById(entity, args.recordId)) ?? null;
  const hostRecord = record
    ? { ...record, values: { ...record.values, ...args.values } }
    : {
        id: args.recordId,
        values: args.values,
        authUserId: null,
        createdBy: null,
        schemaVersion: 1 as const,
      };

  const assigneeName = resolveAssigneeDisplayName(args.assigneeUserId);
  const outcomeLabel = args.outcomeLabel?.trim() || "Нет объёмов";

  await appendTkpNoVolumeIssue({
    entity,
    record: hostRecord,
    issue: {
      taskId: args.taskId,
      taskName: args.taskName?.trim() || "Заполнить разбор ТКП",
      assigneeUserId: args.assigneeUserId ?? null,
      assigneeName,
      departmentLabel: "отдел",
      stageLabel: "",
      outcomeLabel,
    },
  });

  const gipIds = await resolveTkpGipUserIdsFromHost({
    hostEntity: entity,
    hostValues: hostRecord.values,
    entities,
  });
  if (gipIds.length === 0) return;

  const ctx = getEntityValueContext(entities);
  const leadTitle =
    getEntityRecordTitle(ctx, entity, hostRecord, "").trim() || "лид";
  const title = formatNoVolumeNotifyTitle({
    departmentLabel: "отдел",
    leadTitle,
    outcomeLabel,
  });
  const body = formatNoVolumeNotifyBody({
    assigneeName,
    outcomeLabel,
  });

  for (const userId of gipIds) {
    try {
      await createNotification({
        userId,
        title,
        message: body,
        entityId: entity.id,
        recordId: hostRecord.id,
        taskId: args.taskId,
        showToast: true,
      });
    } catch (error: unknown) {
      console.error("[tkp-volumes] notify GIP failed", error);
    }
  }
}
