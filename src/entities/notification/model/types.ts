import {
  defaultAssigneeResolver,
  normalizeAssigneeResolver,
  type AutomationAssigneeResolver,
} from "@/entities/automation/model/assignee";
import {
  emptyAutomationConditions,
  normalizeAutomationConditions,
  type AutomationConditions,
} from "@/entities/automation/model/conditions";

export type NotificationSource = "rule" | "automation" | "action";

export type NotificationTriggerKind =
  | "recordCreated"
  | "recordUpdated"
  | "fieldEnter"
  | "fieldLeave"
  | "fieldTransition";

export const NOTIFICATION_TRIGGER_KIND_LABELS: Record<
  NotificationTriggerKind,
  string
> = {
  recordCreated: "Создание записи",
  recordUpdated: "Изменение записи",
  fieldEnter: "Попадание на значение",
  fieldLeave: "Уход с значения",
  fieldTransition: "Переход значения",
};

export type Notification = {
  id: string;
  userId: string;
  title: string;
  message: string;
  source: NotificationSource;
  ruleId: string | null;
  entityId: string | null;
  recordId: string | null;
  taskId: string | null;
  showToast: boolean;
  readAt: string | null;
  createdAt: string;
};

export type NotificationRule = {
  id: string;
  name: string;
  enabled: boolean;
  entityId: string;
  triggerKind: NotificationTriggerKind;
  fieldId: string;
  optionId: string;
  fromOptionId: string;
  toOptionId: string;
  conditions: AutomationConditions;
  recipients: AutomationAssigneeResolver;
  titleTemplate: string;
  messageTemplate: string;
  showToast: boolean;
};

export type NotificationConfig = {
  rules: NotificationRule[];
};

export function createNotificationRuleId() {
  return `nr-${crypto.randomUUID()}`;
}

export function createNotificationId() {
  return `ntf-${crypto.randomUUID()}`;
}

export function emptyNotificationConfig(): NotificationConfig {
  return { rules: [] };
}

function isTriggerKind(value: unknown): value is NotificationTriggerKind {
  return (
    value === "recordCreated" ||
    value === "recordUpdated" ||
    value === "fieldEnter" ||
    value === "fieldLeave" ||
    value === "fieldTransition"
  );
}

function isSource(value: unknown): value is NotificationSource {
  return value === "rule" || value === "automation" || value === "action";
}

export function normalizeNotificationRule(
  raw: unknown,
): NotificationRule | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  const id =
    typeof item.id === "string" && item.id.trim()
      ? item.id.trim()
      : createNotificationRuleId();
  const entityId =
    typeof item.entityId === "string" ? item.entityId.trim() : "";
  if (!entityId) return null;
  return {
    id,
    name:
      typeof item.name === "string" && item.name.trim()
        ? item.name.trim()
        : "Правило",
    enabled: item.enabled !== false,
    entityId,
    triggerKind: isTriggerKind(item.triggerKind)
      ? item.triggerKind
      : "recordCreated",
    fieldId: typeof item.fieldId === "string" ? item.fieldId : "",
    optionId: typeof item.optionId === "string" ? item.optionId : "",
    fromOptionId:
      typeof item.fromOptionId === "string" ? item.fromOptionId : "",
    toOptionId: typeof item.toOptionId === "string" ? item.toOptionId : "",
    conditions: normalizeAutomationConditions(item.conditions),
    recipients: normalizeAssigneeResolver(item.recipients),
    titleTemplate:
      typeof item.titleTemplate === "string" ? item.titleTemplate : "",
    messageTemplate:
      typeof item.messageTemplate === "string" ? item.messageTemplate : "",
    showToast: item.showToast !== false,
  };
}

export function normalizeNotification(raw: unknown): Notification | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  const id = typeof item.id === "string" ? item.id.trim() : "";
  const userId = typeof item.userId === "string" ? item.userId.trim() : "";
  if (!id || !userId) return null;
  return {
    id,
    userId,
    title: typeof item.title === "string" ? item.title : "",
    message: typeof item.message === "string" ? item.message : "",
    source: isSource(item.source) ? item.source : "rule",
    ruleId: typeof item.ruleId === "string" ? item.ruleId : null,
    entityId: typeof item.entityId === "string" ? item.entityId : null,
    recordId: typeof item.recordId === "string" ? item.recordId : null,
    taskId: typeof item.taskId === "string" ? item.taskId : null,
    showToast: item.showToast !== false,
    readAt: typeof item.readAt === "string" ? item.readAt : null,
    createdAt:
      typeof item.createdAt === "string"
        ? item.createdAt
        : new Date().toISOString(),
  };
}

export function normalizeNotificationConfig(raw: unknown): NotificationConfig {
  if (!raw || typeof raw !== "object") return emptyNotificationConfig();
  const item = raw as Record<string, unknown>;
  return {
    rules: Array.isArray(item.rules)
      ? item.rules
          .map(normalizeNotificationRule)
          .filter((rule): rule is NotificationRule => rule != null)
      : [],
  };
}

export function createDefaultNotificationRule(
  entityId: string,
): NotificationRule {
  return {
    id: createNotificationRuleId(),
    name: "Новое правило",
    enabled: true,
    entityId,
    triggerKind: "recordCreated",
    fieldId: "",
    optionId: "",
    fromOptionId: "",
    toOptionId: "",
    conditions: emptyAutomationConditions(),
    recipients: defaultAssigneeResolver(),
    titleTemplate: "",
    messageTemplate: "",
    showToast: true,
  };
}

export function describeNotificationTrigger(rule: NotificationRule): string {
  const base = NOTIFICATION_TRIGGER_KIND_LABELS[rule.triggerKind];
  if (
    rule.triggerKind === "fieldEnter" ||
    rule.triggerKind === "fieldLeave" ||
    rule.triggerKind === "fieldTransition"
  ) {
    return rule.fieldId ? `${base}` : `${base} (укажите поле)`;
  }
  return base;
}
