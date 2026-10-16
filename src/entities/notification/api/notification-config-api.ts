import { isSupabaseConfigured, supabase } from "@/shared/api/supabase";
import {
  emptyNotificationConfig,
  normalizeNotificationConfig,
  normalizeNotificationRule,
  type NotificationConfig,
  type NotificationRule,
} from "../model/types";

function requireClient() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error("Supabase is not configured");
  }
  return supabase;
}

function mapRuleRow(row: Record<string, unknown>): unknown {
  return {
    id: row.id,
    name: row.name,
    enabled: row.enabled,
    entityId: row.entity_id,
    triggerKind: row.trigger_kind,
    fieldId: row.field_id,
    optionId: row.option_id,
    fromOptionId: row.from_option_id,
    toOptionId: row.to_option_id,
    conditions: row.conditions,
    recipients: row.recipients,
    titleTemplate: row.title_template,
    messageTemplate: row.message_template,
    showToast: row.show_toast,
  };
}

function isMissingNotificationRulesRelation(error: {
  code?: string;
  message?: string;
  status?: number;
}) {
  if (error.code === "PGRST205" || error.code === "42P01") return true;
  if (error.status === 404) return true;
  const message = error.message ?? "";
  return (
    message.includes("notification_rules") &&
    (message.includes("does not exist") ||
      message.includes("schema cache") ||
      message.includes("Not Found"))
  );
}

export async function fetchNotificationConfig(): Promise<NotificationConfig> {
  if (!isSupabaseConfigured || !supabase) return emptyNotificationConfig();

  const { data, error } = await supabase
    .from("notification_rules")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) {
    // Migration not applied yet — app should still boot.
    if (isMissingNotificationRulesRelation(error)) {
      console.warn(
        "[notification] notification_rules missing; using empty config",
      );
      return emptyNotificationConfig();
    }
    throw error;
  }

  return normalizeNotificationConfig({
    rules: (data ?? []).map((row) =>
      mapRuleRow(row as Record<string, unknown>),
    ),
  });
}

export async function upsertNotificationRule(
  rule: NotificationRule,
): Promise<void> {
  const client = requireClient();
  const normalized = normalizeNotificationRule(rule);
  if (!normalized) throw new Error("Invalid notification rule");

  const { error } = await client.from("notification_rules").upsert({
    id: normalized.id,
    name: normalized.name,
    enabled: normalized.enabled,
    entity_id: normalized.entityId,
    trigger_kind: normalized.triggerKind,
    field_id: normalized.fieldId,
    option_id: normalized.optionId,
    from_option_id: normalized.fromOptionId,
    to_option_id: normalized.toOptionId,
    conditions: normalized.conditions,
    recipients: normalized.recipients,
    title_template: normalized.titleTemplate,
    message_template: normalized.messageTemplate,
    show_toast: normalized.showToast,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function deleteNotificationRule(ruleId: string): Promise<void> {
  const client = requireClient();
  const { error } = await client
    .from("notification_rules")
    .delete()
    .eq("id", ruleId);
  if (error) throw error;
}
