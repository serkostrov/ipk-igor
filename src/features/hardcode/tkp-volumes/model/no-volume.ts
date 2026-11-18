/**
 * «Нет объёмов» / «Есть объёмы» — soft state on «Разбор ТКП» (ТЗ шаг 7, ТК-07).
 */

import {
  getEntityConfig,
  getEntityFieldDisplayName,
  getSystemUserName,
  updateEntityRecord,
  type Entity,
  type EntityRecord,
} from "@/entities/entity";
import { returnAutomationTaskForRevision } from "@/entities/automation";

export const TKP_NO_VOLUME_ISSUES_KEY = "__tkp_no_volume_issues__";

export type TkpNoVolumeIssue = {
  id: string;
  taskId: string;
  taskName: string;
  assigneeUserId: string | null;
  assigneeName: string;
  departmentLabel: string;
  stageLabel: string;
  outcomeLabel: string;
  createdAt: string;
  comment?: string;
};

function normalizeLabel(value: string): string {
  return value.trim().toLocaleLowerCase("ru").replaceAll("ё", "е");
}

export function isNoVolumeOutcomeLabel(
  label: string | null | undefined,
): boolean {
  const name = normalizeLabel(label ?? "");
  return (
    name === "нет объемов" ||
    name === "нет объёмов" ||
    name.includes("нет объем") ||
    name.includes("нет объём")
  );
}

export function parseTkpNoVolumeIssues(
  values: Record<string, string | undefined>,
): TkpNoVolumeIssue[] {
  const raw = values[TKP_NO_VOLUME_ISSUES_KEY]?.trim() ?? "";
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is TkpNoVolumeIssue =>
        Boolean(item) &&
        typeof item === "object" &&
        typeof (item as TkpNoVolumeIssue).id === "string" &&
        typeof (item as TkpNoVolumeIssue).taskId === "string",
    );
  } catch {
    return [];
  }
}

export function serializeTkpNoVolumeIssues(
  issues: readonly TkpNoVolumeIssue[],
): string {
  return JSON.stringify(issues);
}

export async function appendTkpNoVolumeIssue(options: {
  entity: Entity;
  record: EntityRecord;
  issue: Omit<TkpNoVolumeIssue, "id" | "createdAt"> & {
    id?: string;
    createdAt?: string;
  };
}): Promise<TkpNoVolumeIssue[]> {
  const current = parseTkpNoVolumeIssues(options.record.values);
  const nextIssue: TkpNoVolumeIssue = {
    id: options.issue.id ?? crypto.randomUUID(),
    createdAt: options.issue.createdAt ?? new Date().toISOString(),
    taskId: options.issue.taskId,
    taskName: options.issue.taskName,
    assigneeUserId: options.issue.assigneeUserId,
    assigneeName: options.issue.assigneeName,
    departmentLabel: options.issue.departmentLabel,
    stageLabel: options.issue.stageLabel,
    outcomeLabel: options.issue.outcomeLabel,
    comment: options.issue.comment,
  };
  const withoutDup = current.filter((item) => item.taskId !== nextIssue.taskId);
  const next = [...withoutDup, nextIssue];
  await updateEntityRecord(options.entity.id, options.record.id, {
    [TKP_NO_VOLUME_ISSUES_KEY]: serializeTkpNoVolumeIssues(next),
  });
  return next;
}

export async function resolveTkpNoVolumeIssue(options: {
  entity: Entity;
  record: EntityRecord;
  issueId: string;
  comment: string;
  actorUserId?: string | null;
}): Promise<{ issues: TkpNoVolumeIssue[]; newTaskId: string | null }> {
  const comment = options.comment.trim();
  if (!comment) {
    throw new Error("Укажите комментарий для «Есть объёмы»");
  }
  const current = parseTkpNoVolumeIssues(options.record.values);
  const issue = current.find((item) => item.id === options.issueId);
  if (!issue) {
    throw new Error("Заявка «Нет объёмов» не найдена");
  }

  const newTaskId = await returnAutomationTaskForRevision(
    issue.taskId,
    options.actorUserId,
  );

  const next = current.filter((item) => item.id !== options.issueId);
  await updateEntityRecord(options.entity.id, options.record.id, {
    [TKP_NO_VOLUME_ISSUES_KEY]: serializeTkpNoVolumeIssues(next),
  });

  return { issues: next, newTaskId };
}

export function formatNoVolumeNotifyTitle(options: {
  departmentLabel: string;
  leadTitle: string;
  outcomeLabel: string;
}): string {
  return `Отдел «${options.departmentLabel}» завершил расчёт по лиду «${options.leadTitle}» — ${options.outcomeLabel}`;
}

export function formatNoVolumeNotifyBody(options: {
  assigneeName: string;
  outcomeLabel: string;
}): string {
  return `Исполнитель: ${options.assigneeName}. Результат: ${options.outcomeLabel}.`;
}

export function resolveAssigneeDisplayName(
  assigneeUserId: string | null | undefined,
): string {
  if (!assigneeUserId) return "—";
  return (
    getSystemUserName(getEntityConfig().entities, assigneeUserId) ||
    assigneeUserId
  );
}

/** Soft field label helper for UI. */
export function noVolumeFieldDisplayName(entity: Entity): string {
  const field = entity.fields.find(
    (item) => item.id === TKP_NO_VOLUME_ISSUES_KEY,
  );
  if (field) return getEntityFieldDisplayName(field);
  return "Нужно решение ГИПа по объёмам";
}
