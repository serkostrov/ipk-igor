import { isSupabaseConfigured, supabase } from "@/shared/api/supabase";
import {
  normalizeAutomationTaskTemplate,
  type AutomationTask,
  type AutomationTaskStatus,
} from "../model/types";

function requireClient() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error("Supabase is not configured");
  }
  return supabase;
}

function mapTaskRow(row: Record<string, unknown>): AutomationTask | null {
  const config = normalizeAutomationTaskTemplate(row.config) ?? {
    id: String(row.template_id ?? ""),
    scenarioId: String(row.scenario_id ?? ""),
    name: String(row.name ?? ""),
    nameTemplate: "",
    description: "",
    triggerOptionId: String(row.trigger_option_id ?? ""),
    stepOrder: Number(row.step_order ?? 0),
    isBlocking: row.is_blocking === true,
    enabled: true,
    kind: "decision" as const,
    launchPhase: "onEnter" as const,
    launchConditions: { version: 1 as const, match: "all" as const, rules: [] },
    assignee: { type: "currentUser" as const },
    watchers: { type: "currentUser" as const },
    outcomes: [],
    sla: null,
    materials: [],
    fieldAccess: {
      requiredFieldIds: [],
      visibleFieldIds: [],
      requireAttachment: false,
      commentFieldIds: [],
      recordFieldIds: [],
      relatedVisibleFields: [],
      relatedRequiredIds: [],
      relatedCommentIds: [],
      relatedRecordIds: [],
      fieldAskOptions: {},
    },
    actions: [],
    viewFieldsPlacement: "afterSelect",
  };

  const status = String(row.status ?? "pending") as AutomationTaskStatus;
  return {
    id: String(row.id),
    processId: String(row.process_id),
    scenarioId: String(row.scenario_id),
    templateId: String(row.template_id),
    entityId: String(row.entity_id),
    recordId: String(row.record_id),
    triggerFieldId: String(row.trigger_field_id ?? ""),
    triggerOptionId: String(row.trigger_option_id ?? ""),
    assigneeUserId:
      typeof row.assignee_user_id === "string" ? row.assignee_user_id : null,
    status,
    outcomeId: typeof row.outcome_id === "string" ? row.outcome_id : null,
    isBlocking: row.is_blocking === true,
    stepOrder: Number(row.step_order ?? 0),
    name: String(row.name ?? ""),
    description: String(row.description ?? ""),
    config,
    dueAt: typeof row.due_at === "string" ? row.due_at : null,
    parentTaskId:
      typeof row.parent_task_id === "string" ? row.parent_task_id : null,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
    completedAt: typeof row.completed_at === "string" ? row.completed_at : null,
  };
}

export async function fetchAutomationTasks(options?: {
  assigneeUserId?: string | null;
  status?: AutomationTaskStatus | AutomationTaskStatus[];
  recordId?: string;
}): Promise<AutomationTask[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  let query = supabase
    .from("automation_tasks")
    .select("*")
    .order("created_at", {
      ascending: false,
    });
  if (options?.assigneeUserId) {
    query = query.eq("assignee_user_id", options.assigneeUserId);
  }
  if (options?.recordId) {
    query = query.eq("record_id", options.recordId);
  }
  if (options?.status) {
    const statuses = Array.isArray(options.status)
      ? options.status
      : [options.status];
    query = query.in("status", statuses);
  }
  const { data, error } = await query.limit(500);
  if (error) throw error;
  return (data ?? [])
    .map((row) => mapTaskRow(row as Record<string, unknown>))
    .filter((item): item is AutomationTask => item != null);
}

/**
 * Spawn missing beforeEnter prep tasks for a move toward `toOptionId`,
 * and return pending prep / destination tasks for the record.
 */
export async function ensureAutomationBeforeEnterPrep(
  recordId: string,
  toOptionId: string,
): Promise<AutomationTask[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  const { data, error } = await supabase.rpc(
    "automation_ensure_before_enter_prep",
    {
      p_record_id: recordId,
      p_to_option_id: toOptionId,
    },
  );
  if (error) {
    // Pre-migration / missing RPC — fall back to a plain pending fetch.
    if (
      error.code === "PGRST202" ||
      /could not find the function|does not exist/i.test(error.message ?? "")
    ) {
      return fetchAutomationTasks({
        recordId,
        status: ["pending", "returned"],
      });
    }
    throw error;
  }
  const rows = (data ?? []) as Record<string, unknown>[];
  return rows
    .map((row) => mapTaskRow(row))
    .filter((item): item is AutomationTask => item != null);
}

export async function fetchAutomationTask(
  taskId: string,
): Promise<AutomationTask | null> {
  if (!isSupabaseConfigured || !supabase) return null;
  const { data, error } = await supabase
    .from("automation_tasks")
    .select("*")
    .eq("id", taskId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return mapTaskRow(data as Record<string, unknown>);
}

export async function countAutomationTasksForRecords(
  entityId: string,
  recordIds: string[],
): Promise<number> {
  if (!isSupabaseConfigured || !supabase || recordIds.length === 0) return 0;
  const { count, error } = await supabase
    .from("automation_tasks")
    .select("id", { count: "exact", head: true })
    .eq("entity_id", entityId)
    .in("record_id", recordIds);
  if (error) throw error;
  return count ?? 0;
}

export async function countAutomationTasksForRecord(
  entityId: string,
  recordId: string,
): Promise<number> {
  return countAutomationTasksForRecords(entityId, [recordId]);
}

/** Deletes all automation tasks for the given records (and cascaded task children). */
export async function deleteAutomationTasksForRecords(
  entityId: string,
  recordIds: string[],
): Promise<number> {
  if (!isSupabaseConfigured || !supabase || recordIds.length === 0) return 0;
  const { data, error } = await supabase
    .from("automation_tasks")
    .delete()
    .eq("entity_id", entityId)
    .in("record_id", recordIds)
    .select("id");
  if (error) throw error;
  return data?.length ?? 0;
}

/** Deletes all automation tasks for a record (and cascaded task children). */
export async function deleteAutomationTasksForRecord(
  entityId: string,
  recordId: string,
): Promise<number> {
  return deleteAutomationTasksForRecords(entityId, [recordId]);
}

export async function deleteAutomationTask(taskId: string): Promise<void> {
  const client = requireClient();
  const { error } = await client
    .from("automation_tasks")
    .delete()
    .eq("id", taskId);
  if (error) throw error;
}

export async function completeAutomationTaskRpc(
  taskId: string,
  outcomeId: string,
  actorUserId?: string | null,
): Promise<{
  taskId: string;
  runId: string;
  outcomeId: string;
  fieldValues: Record<string, string> | null;
  /** True when other fan-out assignees still have open tasks. */
  waitingForAssignees: boolean;
}> {
  const client = requireClient();
  const { data, error } = await client.rpc("complete_automation_task", {
    p_task_id: taskId,
    p_outcome_id: outcomeId,
    p_actor_user_id: actorUserId ?? null,
  });
  if (error) {
    throw new Error(error.message || "Ошибка завершения задачи");
  }
  const result = data as {
    taskId?: string;
    runId?: string;
    outcomeId?: string;
    fieldValues?: unknown;
    waitingForAssignees?: unknown;
  };
  return {
    taskId: result.taskId ?? taskId,
    runId: result.runId ?? "",
    outcomeId: result.outcomeId ?? outcomeId,
    fieldValues: parseRpcFieldValues(result.fieldValues),
    waitingForAssignees: result.waitingForAssignees === true,
  };
}

function parseRpcFieldValues(value: unknown): Record<string, string> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const out: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string") out[key] = item;
    else if (item != null) out[key] = String(item);
  }
  return out;
}

export async function returnAutomationTaskForRevisionRpc(
  taskId: string,
  actorUserId?: string | null,
): Promise<string> {
  const client = requireClient();
  const { data, error } = await client.rpc(
    "return_automation_task_for_revision",
    {
      p_task_id: taskId,
      p_actor_user_id: actorUserId ?? null,
    },
  );
  if (error) {
    throw new Error(error.message || "Ошибка возврата задачи");
  }
  return String(data);
}

export async function registerOverdueAutomationTasksRpc(): Promise<number> {
  const client = requireClient();
  const { data, error } = await client.rpc("automation_register_overdue_tasks");
  if (error) throw error;
  return typeof data === "number" ? data : 0;
}

/** @deprecated Prefer `@/entities/notification` inbox API. */
export async function fetchAutomationNotifications(userId: string): Promise<
  Array<{
    id: string;
    userId: string;
    taskId: string | null;
    message: string;
    readAt: string | null;
    createdAt: string;
  }>
> {
  if (!isSupabaseConfigured || !supabase) return [];
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .eq("source", "automation")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []).map((row) => {
    const item = row as Record<string, unknown>;
    return {
      id: String(item.id),
      userId: String(item.user_id),
      taskId: typeof item.task_id === "string" ? item.task_id : null,
      message: String(item.message ?? ""),
      readAt: typeof item.read_at === "string" ? item.read_at : null,
      createdAt: String(item.created_at ?? ""),
    };
  });
}

/** @deprecated Prefer `@/entities/notification` inbox API. */
export async function markAutomationNotificationRead(
  notificationId: string,
): Promise<void> {
  const client = requireClient();
  const { error } = await client
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId);
  if (error) throw error;
}

type AutomationTasksListener = () => void;

/** One realtime channel, many listeners — avoids re-`.on()` after `subscribe()`. */
let automationTasksShared: {
  channel: ReturnType<NonNullable<typeof supabase>["channel"]>;
  listeners: Set<AutomationTasksListener>;
} | null = null;

function notifyAutomationTasksListeners() {
  const shared = automationTasksShared;
  if (!shared) return;
  for (const listener of shared.listeners) {
    try {
      listener();
    } catch (error) {
      console.error("[automation] tasks listener failed", error);
    }
  }
}

/** Immediate local refresh (realtime may lag after RPC complete/return). */
export function notifyAutomationTasksChanged() {
  notifyAutomationTasksListeners();
}

export function subscribeAutomationTasks(onChange: () => void): () => void {
  if (!isSupabaseConfigured || !supabase) return () => {};

  if (!automationTasksShared) {
    const listeners = new Set<AutomationTasksListener>();
    const client = supabase;
    // Unique topic so a late removeChannel cannot collide with a new subscribe.
    const channel = client
      .channel(`automation-tasks:${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "automation_tasks" },
        () => {
          notifyAutomationTasksListeners();
        },
      )
      .subscribe((status, err) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.error("[automation] tasks realtime", status, err);
        }
      });
    automationTasksShared = { channel, listeners };
  }

  automationTasksShared.listeners.add(onChange);

  return () => {
    const shared = automationTasksShared;
    if (!shared) return;
    shared.listeners.delete(onChange);
    if (shared.listeners.size > 0) return;
    automationTasksShared = null;
    void supabase?.removeChannel(shared.channel);
  };
}

export async function addAutomationTaskAttachment(input: {
  taskId: string;
  fileName: string;
  filePath?: string;
}): Promise<string> {
  const client = requireClient();
  const id = `aatt-${crypto.randomUUID()}`;
  const { error } = await client.from("automation_task_attachments").insert({
    id,
    task_id: input.taskId,
    file_name: input.fileName,
    file_path: input.filePath ?? input.fileName,
  });
  if (error) throw error;
  return id;
}

export async function fetchAutomationTaskAttachments(
  taskId: string,
): Promise<Array<{ id: string; fileName: string; createdAt: string }>> {
  if (!isSupabaseConfigured || !supabase) return [];
  const { data, error } = await supabase
    .from("automation_task_attachments")
    .select("*")
    .eq("task_id", taskId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => {
    const item = row as Record<string, unknown>;
    return {
      id: String(item.id),
      fileName: String(item.file_name ?? ""),
      createdAt: String(item.created_at ?? ""),
    };
  });
}

export type AutomationTaskTimeSession = {
  id: string;
  taskId: string;
  userId: string | null;
  startedAt: string;
  endedAt: string | null;
  seconds: number;
};

function mapTimeSessionRow(
  row: Record<string, unknown>,
): AutomationTaskTimeSession {
  return {
    id: String(row.id),
    taskId: String(row.task_id ?? ""),
    userId: typeof row.user_id === "string" ? row.user_id : null,
    startedAt: String(row.started_at ?? new Date().toISOString()),
    endedAt: typeof row.ended_at === "string" ? row.ended_at : null,
    seconds: Number(row.seconds ?? 0) || 0,
  };
}

export async function fetchAutomationTaskTimeSessions(
  taskId: string,
): Promise<AutomationTaskTimeSession[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  const { data, error } = await supabase
    .from("automation_task_time_sessions")
    .select("*")
    .eq("task_id", taskId)
    .order("started_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) =>
    mapTimeSessionRow(row as Record<string, unknown>),
  );
}

export async function startAutomationTaskTimeSession(input: {
  taskId: string;
  userId: string;
}): Promise<string> {
  const client = requireClient();
  const id = `ats-${crypto.randomUUID()}`;
  const { error } = await client.from("automation_task_time_sessions").insert({
    id,
    task_id: input.taskId,
    user_id: input.userId,
    started_at: new Date().toISOString(),
  });
  if (error) throw error;
  return id;
}

export async function stopAutomationTaskTimeSession(
  sessionId: string,
): Promise<void> {
  const client = requireClient();
  const { data, error: loadError } = await client
    .from("automation_task_time_sessions")
    .select("started_at")
    .eq("id", sessionId)
    .is("ended_at", null)
    .maybeSingle();
  if (loadError) throw loadError;
  if (!data) return;

  const startedAt = new Date(
    String((data as { started_at: string }).started_at),
  );
  const endedAt = new Date();
  const seconds = Number.isFinite(startedAt.getTime())
    ? Math.max(0, Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000))
    : 0;

  const { error } = await client
    .from("automation_task_time_sessions")
    .update({
      ended_at: endedAt.toISOString(),
      seconds,
    })
    .eq("id", sessionId)
    .is("ended_at", null);
  if (error) throw error;
}

/** Closed manual session (already finished). */
export async function addAutomationTaskTimeSession(input: {
  taskId: string;
  userId: string;
  seconds: number;
}): Promise<string> {
  const client = requireClient();
  const seconds = Math.max(0, Math.round(input.seconds));
  if (seconds <= 0) throw new Error("Укажите длительность больше нуля");
  const id = `ats-${crypto.randomUUID()}`;
  const endedAt = new Date();
  const startedAt = new Date(endedAt.getTime() - seconds * 1000);
  const { error } = await client.from("automation_task_time_sessions").insert({
    id,
    task_id: input.taskId,
    user_id: input.userId,
    started_at: startedAt.toISOString(),
    ended_at: endedAt.toISOString(),
    seconds,
  });
  if (error) throw error;
  return id;
}

export async function fetchOpenAutomationTaskTimeSession(
  taskId: string,
  userId: string,
): Promise<string | null> {
  if (!isSupabaseConfigured || !supabase) return null;
  const { data, error } = await supabase
    .from("automation_task_time_sessions")
    .select("id")
    .eq("task_id", taskId)
    .eq("user_id", userId)
    .is("ended_at", null)
    .maybeSingle();
  if (error) throw error;
  return data ? String((data as { id: string }).id) : null;
}
