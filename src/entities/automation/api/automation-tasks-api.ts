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
    triggerOptionId: String(row.trigger_option_id ?? ""),
    stepOrder: Number(row.step_order ?? 0),
    isBlocking: row.is_blocking === true,
    kind: "decision" as const,
    launchConditions: { version: 1 as const, match: "all" as const, rules: [] },
    assignee: { type: "currentUser" as const },
    watchers: { type: "currentUser" as const },
    outcomes: [],
    sla: null,
    materials: [],
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

export async function completeAutomationTaskRpc(
  taskId: string,
  outcomeId: string,
  actorUserId?: string | null,
): Promise<{ taskId: string; runId: string; outcomeId: string }> {
  const client = requireClient();
  const { data, error } = await client.rpc("complete_automation_task", {
    p_task_id: taskId,
    p_outcome_id: outcomeId,
    p_actor_user_id: actorUserId ?? null,
  });
  if (error) throw error;
  const result = data as {
    taskId?: string;
    runId?: string;
    outcomeId?: string;
  };
  return {
    taskId: result.taskId ?? taskId,
    runId: result.runId ?? "",
    outcomeId: result.outcomeId ?? outcomeId,
  };
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
  if (error) throw error;
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

export function subscribeAutomationTasks(onChange: () => void): () => void {
  if (!isSupabaseConfigured || !supabase) return () => {};
  const channel = supabase
    .channel("automation-tasks")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "automation_tasks" },
      () => onChange(),
    )
    .subscribe();
  return () => {
    void supabase?.removeChannel(channel);
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
  const { error } = await client
    .from("automation_task_time_sessions")
    .update({ ended_at: new Date().toISOString() })
    .eq("id", sessionId)
    .is("ended_at", null);
  if (error) throw error;
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
