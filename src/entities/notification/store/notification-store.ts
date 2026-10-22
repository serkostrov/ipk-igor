import { isSupabaseConfigured } from "@/shared/api/supabase";
import {
  deleteNotificationRule,
  fetchNotificationConfig,
  upsertNotificationRule,
} from "../api/notification-config-api";
import {
  createNotification as createNotificationApi,
  fetchNotifications,
  markAllNotificationsRead as markAllReadApi,
  markNotificationRead as markReadApi,
  subscribeNotifications,
  type CreateNotificationInput,
} from "../api/notifications-api";
import {
  scrubAutomationAssignee,
  scrubAutomationConditions,
  stripFieldTokensFromText,
} from "@/entities/automation/lib/purge-field-from-config";
import {
  emptyNotificationConfig,
  normalizeNotification,
  type Notification,
  type NotificationConfig,
  type NotificationRule,
} from "../model/types";

export type NotificationStatus = "idle" | "loading" | "ready" | "error";

type Listener = () => void;

let config: NotificationConfig = emptyNotificationConfig();
let inbox: Notification[] = [];
let status: NotificationStatus = "idle";
let inboxStatus: NotificationStatus = "idle";
let errorMessage: string | null = null;
let initPromise: Promise<void> | null = null;
let inboxUserIds: string[] = [];
let unsubscribeRealtime: (() => void) | null = null;
let onIncomingToast: ((notification: Notification) => void) | null = null;

const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((listener) => listener());
}

function setStatus(next: NotificationStatus, message: string | null = null) {
  status = next;
  errorMessage = message;
  notify();
}

export function getNotificationConfig() {
  return config;
}

export function getNotificationInbox() {
  return inbox;
}

export function getNotificationStatus() {
  return status;
}

export function getNotificationInboxStatus() {
  return inboxStatus;
}

export function getNotificationError() {
  return errorMessage;
}

export function getUnreadNotificationCount() {
  return inbox.filter((item) => item.readAt == null).length;
}

export function subscribeNotificationStore(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setNotificationToastHandler(
  handler: ((notification: Notification) => void) | null,
) {
  onIncomingToast = handler;
}

function prependInbox(item: Notification) {
  if (inbox.some((existing) => existing.id === item.id)) return;
  inbox = [item, ...inbox].slice(0, 200);
  notify();
}

function patchInbox(id: string, patch: Partial<Notification>) {
  inbox = inbox.map((item) => (item.id === id ? { ...item, ...patch } : item));
  notify();
}

export async function initNotificationConfig() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    setStatus("loading");
    try {
      config = await fetchNotificationConfig();
      setStatus("ready");
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "Не удалось загрузить правила уведомлений";
      console.error("[notification] load config failed", error);
      config = emptyNotificationConfig();
      setStatus("error", message);
    }
  })();
  return initPromise;
}

export async function reloadNotificationConfig() {
  initPromise = null;
  return initNotificationConfig();
}

function replaceConfig(next: NotificationConfig) {
  config = next;
  notify();
}

export async function saveNotificationRule(rule: NotificationRule) {
  const exists = config.rules.some((item) => item.id === rule.id);
  replaceConfig({
    rules: exists
      ? config.rules.map((item) => (item.id === rule.id ? rule : item))
      : [...config.rules, rule],
  });
  if (!isSupabaseConfigured) return;
  await upsertNotificationRule(rule);
}

export async function removeNotificationRule(ruleId: string) {
  replaceConfig({
    rules: config.rules.filter((item) => item.id !== ruleId),
  });
  if (!isSupabaseConfigured) return;
  await deleteNotificationRule(ruleId);
}

/** Drop references to a deleted entity field from notification rules. */
export async function purgeFieldFromNotificationRules(
  entityId: string,
  fieldId: string,
): Promise<void> {
  if (!entityId.trim() || !fieldId.trim()) return;
  if (status !== "ready" && status !== "error") {
    try {
      await initNotificationConfig();
    } catch {
      return;
    }
  }

  const id = fieldId.trim();
  const changed: NotificationRule[] = [];
  const rules = config.rules.map((rule) => {
    if (rule.entityId !== entityId) return rule;
    const next: NotificationRule = {
      ...rule,
      fieldId: rule.fieldId === id ? "" : rule.fieldId,
      optionId: rule.fieldId === id ? "" : rule.optionId,
      fromOptionId: rule.fieldId === id ? "" : rule.fromOptionId,
      toOptionId: rule.fieldId === id ? "" : rule.toOptionId,
      conditions: scrubAutomationConditions(rule.conditions, id),
      recipients: scrubAutomationAssignee(rule.recipients, id),
      titleTemplate: stripFieldTokensFromText(rule.titleTemplate, id),
      messageTemplate: stripFieldTokensFromText(rule.messageTemplate, id),
    };
    if (JSON.stringify(next) !== JSON.stringify(rule)) {
      changed.push(next);
      return next;
    }
    return rule;
  });

  if (changed.length === 0) return;
  replaceConfig({ rules });
  if (!isSupabaseConfigured) return;
  await Promise.all(changed.map((rule) => upsertNotificationRule(rule)));
}

export async function loadNotificationInbox(userIds: string[]) {
  inboxUserIds = userIds.filter(Boolean);
  inboxStatus = "loading";
  notify();
  try {
    inbox = await fetchNotifications(inboxUserIds);
    inboxStatus = "ready";
    notify();
  } catch (error: unknown) {
    console.error("[notification] load inbox failed", error);
    inbox = [];
    inboxStatus = "error";
    errorMessage =
      error instanceof Error
        ? error.message
        : "Не удалось загрузить уведомления";
    notify();
  }
}

export function startNotificationRealtime() {
  if (unsubscribeRealtime) return;
  unsubscribeRealtime = subscribeNotifications((payload) => {
    if (payload?.eventType === "INSERT" && payload.new) {
      const mapped = normalizeNotification({
        id: payload.new.id,
        userId: payload.new.user_id,
        title: payload.new.title,
        message: payload.new.message,
        source: payload.new.source,
        ruleId: payload.new.rule_id,
        entityId: payload.new.entity_id,
        recordId: payload.new.record_id,
        taskId: payload.new.task_id,
        showToast: payload.new.show_toast,
        readAt: payload.new.read_at,
        createdAt: payload.new.created_at,
      });
      if (
        mapped &&
        (inboxUserIds.length === 0 || inboxUserIds.includes(mapped.userId))
      ) {
        prependInbox(mapped);
        if (mapped.showToast) {
          onIncomingToast?.(mapped);
        }
      }
      return;
    }
    if (inboxUserIds.length > 0) {
      void loadNotificationInbox(inboxUserIds);
    }
  });
}

export function stopNotificationRealtime() {
  unsubscribeRealtime?.();
  unsubscribeRealtime = null;
}

export async function markNotificationRead(notificationId: string) {
  patchInbox(notificationId, { readAt: new Date().toISOString() });
  if (!isSupabaseConfigured) return;
  await markReadApi(notificationId);
}

export async function markAllNotificationsRead() {
  const now = new Date().toISOString();
  inbox = inbox.map((item) =>
    item.readAt == null ? { ...item, readAt: now } : item,
  );
  notify();
  if (!isSupabaseConfigured) return;
  await markAllReadApi(inboxUserIds);
}

export async function sendNotification(
  input: CreateNotificationInput,
): Promise<Notification | null> {
  const created = await createNotificationApi(input);
  if (created) prependInbox(created);
  return created;
}
