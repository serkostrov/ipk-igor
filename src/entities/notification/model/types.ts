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
  fieldEnter: "Вход на стадию",
  fieldLeave: "Уход со стадии",
  fieldTransition: "Смена стадии",
};

export const NOTIFICATION_TRIGGER_KIND_HINTS: Record<
  NotificationTriggerKind,
  string
> = {
  recordCreated: "Когда создаётся новая запись сущности",
  recordUpdated: "Когда меняются любые поля записи",
  fieldEnter: "Когда запись переходит на выбранную стадию (значение списка)",
  fieldLeave: "Когда запись уходит с выбранной стадии",
  fieldTransition: "Когда стадия меняется с одного значения на другое",
};

/** Trigger kind picker sections in notification rules. */
export const NOTIFICATION_TRIGGER_KIND_GROUPS: Array<{
  label: string;
  items: NotificationTriggerKind[];
}> = [
  {
    label: "События записи",
    items: ["recordCreated", "recordUpdated"],
  },
  {
    label: "Смена стадии",
    items: ["fieldEnter", "fieldLeave", "fieldTransition"],
  },
];

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

/**
 * Prefills a record rule for stage change on the process list field.
 * `optionId` empty = any stage; set for «вход на конкретную стадию».
 */
export function createStageChangeNotificationRule(input: {
  entityId: string;
  stageFieldId: string;
  stageFieldLabel?: string;
  optionId?: string;
  optionLabel?: string;
  triggerKind?: "fieldEnter" | "fieldLeave" | "fieldTransition";
}): NotificationRule {
  const triggerKind = input.triggerKind ?? "fieldEnter";
  const optionId = input.optionId?.trim() ?? "";
  const optionLabel = input.optionLabel?.trim() ?? "";
  const fieldLabel = input.stageFieldLabel?.trim() || "стадия";
  const stagePhrase = optionLabel
    ? `«${optionLabel}»`
    : `{{${input.stageFieldId}}}`;

  const name =
    triggerKind === "fieldEnter" && optionLabel
      ? `Вход на стадию «${optionLabel}»`
      : triggerKind === "fieldLeave" && optionLabel
        ? `Уход со стадии «${optionLabel}»`
        : triggerKind === "fieldTransition"
          ? "Смена стадии"
          : "Смена стадии";

  return {
    id: createNotificationRuleId(),
    name,
    enabled: true,
    entityId: input.entityId,
    triggerKind,
    fieldId: input.stageFieldId,
    optionId: triggerKind === "fieldTransition" ? "" : optionId,
    fromOptionId: "",
    toOptionId: triggerKind === "fieldTransition" ? optionId : "",
    conditions: emptyAutomationConditions(),
    recipients: defaultAssigneeResolver(),
    titleTemplate:
      triggerKind === "fieldLeave"
        ? `Уход со стадии ${stagePhrase}`
        : `Стадия: ${stagePhrase}`,
    messageTemplate:
      triggerKind === "fieldLeave"
        ? `Запись покинула стадию ${stagePhrase} (поле «${fieldLabel}»).`
        : triggerKind === "fieldTransition"
          ? `Стадия записи изменилась. Текущее значение: ${stagePhrase}.`
          : `Запись перешла на стадию ${stagePhrase}.`,
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
    return rule.fieldId ? base : `${base} (укажите поле стадии)`;
  }
  return base;
}
