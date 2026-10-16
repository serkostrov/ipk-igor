import {
  defaultAssigneeResolver,
  normalizeAssigneeResolver,
  type AutomationAssigneeResolver,
} from "./assignee";
import { normalizeAutomationActions, type AutomationAction } from "./actions";
import {
  emptyAutomationConditions,
  normalizeAutomationConditions,
  type AutomationConditions,
} from "./conditions";

/**
 * ipk-new → core primitives (config only, no commercial hardcoded kinds):
 * - stage spawn          → Process.triggerFieldId + Template.triggerOptionId (fieldEnter)
 * - funnel scenario      → Scenario.entryConditions
 * - assignee_kind/from   → AssigneeResolver
 * - advance/stay/back    → setField / noop / setFieldPrevious
 * - launch_process       → startProcess
 * - side effects         → createRecord + copyFields + setRelation + startProcess
 * - create_linked_leads  → createRecordsFromMapping
 * - notifications        → NotificationRule / notify action
 * - SLA                  → Template.sla + worker
 */

export type AutomationTriggerKind =
  | "recordCreated"
  | "recordUpdated"
  | "fieldEnter"
  | "fieldLeave"
  | "fieldTransition"
  | "taskCompleted"
  | "slaOverdue";

export const AUTOMATION_TRIGGER_KIND_LABELS: Record<
  AutomationTriggerKind,
  string
> = {
  recordCreated: "Создание записи",
  recordUpdated: "Изменение записи",
  fieldEnter: "Попадание на значение",
  fieldLeave: "Уход с значения",
  fieldTransition: "Переход значения",
  taskCompleted: "Завершение задачи",
  slaOverdue: "Просрочка SLA",
};

export type AutomationTaskKind = "decision" | "single";

export type AutomationTaskStatus =
  "pending" | "completed" | "cancelled" | "returned";

export type AutomationOutcomeFieldAccess = {
  /** Fields required to complete with this outcome. */
  requiredFieldIds: string[];
  /** Fields shown / editable on the task form. */
  visibleFieldIds: string[];
  requireAttachment: boolean;
};

export type AutomationOutcome = {
  id: string;
  label: string;
  actions: AutomationAction[];
  fieldAccess: AutomationOutcomeFieldAccess;
};

export type AutomationSla = {
  hours: number;
  /** Reserved for business-calendar support. */
  calendar: "247" | "business";
};

export type AutomationNotificationEvent = "assigned" | "completed" | "overdue";

export type AutomationNotificationRule = {
  id: string;
  templateId: string;
  event: AutomationNotificationEvent;
  recipients: AutomationAssigneeResolver;
  conditions: AutomationConditions;
  messageTemplate: string;
};

export type AutomationTaskTemplate = {
  id: string;
  scenarioId: string;
  name: string;
  /** `{{fieldId}}` placeholders rendered at spawn. */
  nameTemplate: string;
  /** List option id on the process trigger field. */
  triggerOptionId: string;
  stepOrder: number;
  isBlocking: boolean;
  kind: AutomationTaskKind;
  launchConditions: AutomationConditions;
  assignee: AutomationAssigneeResolver;
  watchers: AutomationAssigneeResolver;
  outcomes: AutomationOutcome[];
  sla: AutomationSla | null;
  materials: string[];
};

/** Free-form flow canvas positions keyed by React Flow node id. */
export type AutomationCanvasLayout = Record<string, { x: number; y: number }>;

export type AutomationScenario = {
  id: string;
  processId: string;
  name: string;
  isDefault: boolean;
  entryConditions: AutomationConditions;
  priority: number;
  canvasLayout: AutomationCanvasLayout;
};

export type AutomationProcess = {
  id: string;
  name: string;
  description: string;
  entityId: string;
  /** List field used as stage/status trigger. */
  triggerFieldId: string;
  /** Primary trigger kind for the process map UI. */
  triggerKind: AutomationTriggerKind;
  enabled: boolean;
  version: number;
};

export type AutomationConfig = {
  processes: AutomationProcess[];
  scenarios: AutomationScenario[];
  templates: AutomationTaskTemplate[];
  notificationRules: AutomationNotificationRule[];
};

export type AutomationTask = {
  id: string;
  processId: string;
  scenarioId: string;
  templateId: string;
  entityId: string;
  recordId: string;
  triggerFieldId: string;
  triggerOptionId: string;
  assigneeUserId: string | null;
  status: AutomationTaskStatus;
  outcomeId: string | null;
  isBlocking: boolean;
  stepOrder: number;
  name: string;
  /** Frozen template snapshot at spawn. */
  config: AutomationTaskTemplate;
  dueAt: string | null;
  parentTaskId: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type AutomationRunCause =
  "spawn" | "complete" | "guard" | "schedule" | "revision";

export type AutomationRun = {
  id: string;
  cause: AutomationRunCause;
  entityId: string;
  recordId: string;
  taskId: string | null;
  actionsLog: unknown[];
  status: "ok" | "error";
  error: string | null;
  createdAt: string;
};

export function createAutomationProcessId() {
  return `aproc-${crypto.randomUUID()}`;
}

export function createAutomationScenarioId() {
  return `ascen-${crypto.randomUUID()}`;
}

export function createAutomationTemplateId() {
  return `atpl-${crypto.randomUUID()}`;
}

export function createAutomationOutcomeId() {
  return `aout-${crypto.randomUUID()}`;
}

export function createAutomationNotificationRuleId() {
  return `anr-${crypto.randomUUID()}`;
}

function normalizeOutcome(
  raw: unknown,
  index: number,
): AutomationOutcome | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  const id =
    typeof item.id === "string" && item.id.trim()
      ? item.id.trim()
      : `aout-${index}`;
  const label =
    typeof item.label === "string" && item.label.trim()
      ? item.label.trim()
      : "Результат";
  const access =
    item.fieldAccess && typeof item.fieldAccess === "object"
      ? (item.fieldAccess as Record<string, unknown>)
      : {};
  return {
    id,
    label,
    actions: normalizeAutomationActions(item.actions),
    fieldAccess: {
      requiredFieldIds: Array.isArray(access.requiredFieldIds)
        ? access.requiredFieldIds.filter(
            (id): id is string => typeof id === "string",
          )
        : [],
      visibleFieldIds: Array.isArray(access.visibleFieldIds)
        ? access.visibleFieldIds.filter(
            (id): id is string => typeof id === "string",
          )
        : [],
      requireAttachment: access.requireAttachment === true,
    },
  };
}

export function normalizeAutomationOutcome(
  value: unknown,
  index = 0,
): AutomationOutcome | null {
  return normalizeOutcome(value, index);
}

export function defaultDecisionOutcomes(): AutomationOutcome[] {
  return [
    {
      id: createAutomationOutcomeId(),
      label: "Да",
      actions: [],
      fieldAccess: {
        requiredFieldIds: [],
        visibleFieldIds: [],
        requireAttachment: false,
      },
    },
    {
      id: createAutomationOutcomeId(),
      label: "Нет",
      actions: [],
      fieldAccess: {
        requiredFieldIds: [],
        visibleFieldIds: [],
        requireAttachment: false,
      },
    },
  ];
}

/** Accepts camelCase (client) or snake_case (SQL to_jsonb row snapshot). */
export function normalizeAutomationTaskTemplate(
  value: unknown,
): AutomationTaskTemplate | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  const scenarioId =
    typeof raw.scenarioId === "string"
      ? raw.scenarioId.trim()
      : typeof raw.scenario_id === "string"
        ? raw.scenario_id.trim()
        : "";
  if (!id || !scenarioId) return null;
  const outcomes: AutomationOutcome[] = [];
  if (Array.isArray(raw.outcomes)) {
    raw.outcomes.forEach((item, index) => {
      const outcome = normalizeOutcome(item, index);
      if (outcome) outcomes.push(outcome);
    });
  }
  const slaRaw =
    raw.sla && typeof raw.sla === "object"
      ? (raw.sla as Record<string, unknown>)
      : null;
  const stepOrderRaw = raw.stepOrder ?? raw.step_order;
  const nameTemplateRaw = raw.nameTemplate ?? raw.name_template;
  const triggerOptionIdRaw = raw.triggerOptionId ?? raw.trigger_option_id;
  const isBlocking = raw.isBlocking === true || raw.is_blocking === true;
  const kind = raw.kind === "single" ? "single" : "decision";
  return {
    id,
    scenarioId,
    name:
      typeof raw.name === "string" && raw.name.trim()
        ? raw.name.trim()
        : "Задача",
    nameTemplate: typeof nameTemplateRaw === "string" ? nameTemplateRaw : "",
    triggerOptionId:
      typeof triggerOptionIdRaw === "string" ? triggerOptionIdRaw : "",
    stepOrder:
      typeof stepOrderRaw === "number" && Number.isFinite(stepOrderRaw)
        ? Math.max(0, Math.round(stepOrderRaw))
        : 0,
    isBlocking,
    kind,
    launchConditions: normalizeAutomationConditions(
      raw.launchConditions ?? raw.launch_conditions,
    ),
    assignee: normalizeAssigneeResolver(raw.assignee),
    watchers: normalizeAssigneeResolver(
      raw.watchers ?? defaultAssigneeResolver(),
    ),
    outcomes:
      outcomes.length > 0
        ? outcomes
        : kind === "single"
          ? [
              {
                id: createAutomationOutcomeId(),
                label: "Готово",
                actions: [],
                fieldAccess: {
                  requiredFieldIds: [],
                  visibleFieldIds: [],
                  requireAttachment: false,
                },
              },
            ]
          : defaultDecisionOutcomes(),
    sla:
      slaRaw && typeof slaRaw.hours === "number" && slaRaw.hours > 0
        ? {
            hours: slaRaw.hours,
            calendar: slaRaw.calendar === "business" ? "business" : "247",
          }
        : null,
    materials: Array.isArray(raw.materials)
      ? raw.materials.filter((item): item is string => typeof item === "string")
      : [],
  };
}

export function normalizeAutomationCanvasLayout(
  value: unknown,
): AutomationCanvasLayout {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: AutomationCanvasLayout = {};
  for (const [key, pos] of Object.entries(value as Record<string, unknown>)) {
    const id = key.trim();
    if (!id || !pos || typeof pos !== "object" || Array.isArray(pos)) continue;
    const point = pos as Record<string, unknown>;
    if (typeof point.x !== "number" || typeof point.y !== "number") continue;
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    out[id] = { x: point.x, y: point.y };
  }
  return out;
}

export function normalizeAutomationScenario(
  value: unknown,
): AutomationScenario | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  const processId =
    typeof raw.processId === "string" ? raw.processId.trim() : "";
  if (!id || !processId) return null;
  return {
    id,
    processId,
    name:
      typeof raw.name === "string" && raw.name.trim()
        ? raw.name.trim()
        : "Сценарий",
    isDefault: raw.isDefault === true,
    entryConditions: normalizeAutomationConditions(raw.entryConditions),
    priority:
      typeof raw.priority === "number" && Number.isFinite(raw.priority)
        ? Math.round(raw.priority)
        : 0,
    canvasLayout: normalizeAutomationCanvasLayout(
      raw.canvasLayout ?? raw.canvas_layout,
    ),
  };
}

export function normalizeAutomationProcess(
  value: unknown,
): AutomationProcess | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  const entityId = typeof raw.entityId === "string" ? raw.entityId.trim() : "";
  if (!id || !entityId) return null;
  const triggerKind =
    typeof raw.triggerKind === "string" &&
    raw.triggerKind in AUTOMATION_TRIGGER_KIND_LABELS
      ? (raw.triggerKind as AutomationTriggerKind)
      : "fieldEnter";
  return {
    id,
    name:
      typeof raw.name === "string" && raw.name.trim()
        ? raw.name.trim()
        : "Процесс",
    description: typeof raw.description === "string" ? raw.description : "",
    entityId,
    triggerFieldId:
      typeof raw.triggerFieldId === "string" ? raw.triggerFieldId : "",
    triggerKind,
    enabled: raw.enabled !== false,
    version:
      typeof raw.version === "number" && Number.isFinite(raw.version)
        ? Math.max(1, Math.round(raw.version))
        : 1,
  };
}

export function normalizeAutomationNotificationRule(
  value: unknown,
): AutomationNotificationRule | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  const templateId =
    typeof raw.templateId === "string" ? raw.templateId.trim() : "";
  if (!id || !templateId) return null;
  const event =
    raw.event === "completed" || raw.event === "overdue"
      ? raw.event
      : "assigned";
  return {
    id,
    templateId,
    event,
    recipients: normalizeAssigneeResolver(raw.recipients),
    conditions: normalizeAutomationConditions(raw.conditions),
    messageTemplate:
      typeof raw.messageTemplate === "string" ? raw.messageTemplate : "",
  };
}

export function emptyAutomationConfig(): AutomationConfig {
  return {
    processes: [],
    scenarios: [],
    templates: [],
    notificationRules: [],
  };
}

export function normalizeAutomationConfig(value: unknown): AutomationConfig {
  if (!value || typeof value !== "object") return emptyAutomationConfig();
  const raw = value as Record<string, unknown>;
  return {
    processes: Array.isArray(raw.processes)
      ? raw.processes
          .map(normalizeAutomationProcess)
          .filter((item): item is AutomationProcess => item != null)
      : [],
    scenarios: Array.isArray(raw.scenarios)
      ? raw.scenarios
          .map(normalizeAutomationScenario)
          .filter((item): item is AutomationScenario => item != null)
      : [],
    templates: Array.isArray(raw.templates)
      ? raw.templates
          .map(normalizeAutomationTaskTemplate)
          .filter((item): item is AutomationTaskTemplate => item != null)
      : [],
    notificationRules: Array.isArray(raw.notificationRules)
      ? raw.notificationRules
          .map(normalizeAutomationNotificationRule)
          .filter((item): item is AutomationNotificationRule => item != null)
      : [],
  };
}

export function createDefaultProcess(input: {
  name: string;
  entityId: string;
  triggerFieldId: string;
}): { process: AutomationProcess; scenario: AutomationScenario } {
  const processId = createAutomationProcessId();
  const scenarioId = createAutomationScenarioId();
  return {
    process: {
      id: processId,
      name: input.name.trim() || "Процесс",
      description: "",
      entityId: input.entityId,
      triggerFieldId: input.triggerFieldId,
      triggerKind: "fieldEnter",
      enabled: true,
      version: 1,
    },
    scenario: {
      id: scenarioId,
      processId,
      name: "Основной",
      isDefault: true,
      entryConditions: emptyAutomationConditions(),
      priority: 0,
      canvasLayout: {},
    },
  };
}
