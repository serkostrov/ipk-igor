import { isSupabaseConfigured, supabase } from "@/shared/api/supabase";
import {
  createNotificationId,
  normalizeNotification,
  type Notification,
  type NotificationSource,
} from "../model/types";

function requireClient() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error("Supabase is not configured");
  }
  return supabase;
}

function mapNotificationRow(row: Record<string, unknown>): Notification | null {
  return normalizeNotification({
    id: row.id,
    userId: row.user_id,
    title: row.title,
    message: row.message,
    source: row.source,
    ruleId: row.rule_id,
    entityId: row.entity_id,
    recordId: row.record_id,
    taskId: row.task_id,
    showToast: row.show_toast,
    readAt: row.read_at,
    createdAt: row.created_at,
  });
}

export async function fetchNotifications(
  userIds: string[],
): Promise<Notification[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  const ids = userIds.filter(Boolean);
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .in("user_id", ids)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? [])
    .map((row) => mapNotificationRow(row as Record<string, unknown>))
    .filter((item): item is Notification => item != null);
}

export async function markNotificationRead(
  notificationId: string,
): Promise<void> {
  const client = requireClient();
  const { error } = await client
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId);
  if (error) throw error;
}

export async function markAllNotificationsRead(
  userIds: string[],
): Promise<void> {
  const client = requireClient();
  const ids = userIds.filter(Boolean);
  if (ids.length === 0) return;
  const { error } = await client
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .in("user_id", ids)
    .is("read_at", null);
  if (error) throw error;
}

export async function deleteNotification(
  notificationId: string,
): Promise<void> {
  const client = requireClient();
  const { error } = await client
    .from("notifications")
    .delete()
    .eq("id", notificationId);
  if (error) throw error;
}

/** Deletes all notifications linked to the given entity records. */
export async function deleteNotificationsForRecords(
  entityId: string,
  recordIds: string[],
): Promise<number> {
  if (!isSupabaseConfigured || !supabase || recordIds.length === 0) return 0;
  const { data, error } = await supabase
    .from("notifications")
    .delete()
    .eq("entity_id", entityId)
    .in("record_id", recordIds)
    .select("id");
  if (error) throw error;
  return data?.length ?? 0;
}

export async function countNotificationsForRecords(
  entityId: string,
  recordIds: string[],
): Promise<number> {
  if (!isSupabaseConfigured || !supabase || recordIds.length === 0) return 0;
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("entity_id", entityId)
    .in("record_id", recordIds);
  if (error) throw error;
  return count ?? 0;
}

export type CreateNotificationInput = {
  userId: string;
  title: string;
  message: string;
  source?: NotificationSource;
  ruleId?: string | null;
  entityId?: string | null;
  recordId?: string | null;
  taskId?: string | null;
  showToast?: boolean;
};

export async function createNotification(
  input: CreateNotificationInput,
): Promise<Notification | null> {
  if (!isSupabaseConfigured || !supabase) return null;
  const client = supabase;

  const { data, error } = await client.rpc("create_notification", {
    p_user_id: input.userId,
    p_title: input.title,
    p_message: input.message,
    p_source: input.source ?? "action",
    p_rule_id: input.ruleId ?? null,
    p_entity_id: input.entityId ?? null,
    p_record_id: input.recordId ?? null,
    p_task_id: input.taskId ?? null,
    p_show_toast: input.showToast ?? true,
  });

  if (error) {
    // Fallback direct insert when RPC unavailable (local / partial migrate).
    const id = createNotificationId();
    const { error: insertError } = await client.from("notifications").insert({
      id,
      user_id: input.userId,
      title: input.title || input.message.slice(0, 120) || "Уведомление",
      message: input.message,
      source: input.source ?? "action",
      rule_id: input.ruleId ?? null,
      entity_id: input.entityId ?? null,
      record_id: input.recordId ?? null,
      task_id: input.taskId ?? null,
      show_toast: input.showToast ?? true,
    });
    if (insertError) throw insertError;
    return {
      id,
      userId: input.userId,
      title: input.title || input.message.slice(0, 120) || "Уведомление",
      message: input.message,
      source: input.source ?? "action",
      ruleId: input.ruleId ?? null,
      entityId: input.entityId ?? null,
      recordId: input.recordId ?? null,
      taskId: input.taskId ?? null,
      showToast: input.showToast ?? true,
      readAt: null,
      createdAt: new Date().toISOString(),
    };
  }

  const id = typeof data === "string" ? data : null;
  if (!id) return null;
  return {
    id,
    userId: input.userId,
    title: input.title || input.message.slice(0, 120) || "Уведомление",
    message: input.message,
    source: input.source ?? "action",
    ruleId: input.ruleId ?? null,
    entityId: input.entityId ?? null,
    recordId: input.recordId ?? null,
    taskId: input.taskId ?? null,
    showToast: input.showToast ?? true,
    readAt: null,
    createdAt: new Date().toISOString(),
  };
}

export function subscribeNotifications(
  onChange: (payload?: {
    eventType?: string;
    new?: Record<string, unknown>;
    old?: Record<string, unknown>;
  }) => void,
): () => void {
  if (!isSupabaseConfigured || !supabase) return () => {};
  const channel = supabase
    .channel("notifications-inbox")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "notifications" },
      (payload) => {
        onChange({
          eventType: payload.eventType,
          new: payload.new as Record<string, unknown> | undefined,
          old: payload.old as Record<string, unknown> | undefined,
        });
      },
    )
    .subscribe();
  return () => {
    void supabase?.removeChannel(channel);
  };
}
