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

export type AutomationTaskKind = "decision" | "single" | "autofill";

export type AutomationTaskStatus =
  "pending" | "completed" | "cancelled" | "returned";

export type AutomationOutcomeFieldAccess = {
  /** Fields required to complete with this outcome. */
  requiredFieldIds: string[];
  /** Fields shown / editable on the task form. */
  visibleFieldIds: string[];
  requireAttachment: boolean;
  /**
   * On complete: append field content as a note on the entity’s
   * «Записи» / comments tab (if the entity has one).
   */
  commentFieldIds: string[];
  /**
   * Write filled values onto the entity record field (when it exists).
   * Defaults to all visible fields for legacy configs.
   */
  recordFieldIds: string[];
};

export function emptyAutomationOutcomeFieldAccess(): AutomationOutcomeFieldAccess {
  return {
    requiredFieldIds: [],
    visibleFieldIds: [],
    requireAttachment: false,
    commentFieldIds: [],
    recordFieldIds: [],
  };
}

function normalizeStringIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (id): id is string => typeof id === "string" && id.trim().length > 0,
  );
}

export function normalizeAutomationOutcomeFieldAccess(
  value: unknown,
): AutomationOutcomeFieldAccess {
  const access =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const visibleFieldIds = normalizeStringIdList(
    access.visibleFieldIds ?? access.visible_field_ids,
  );
  const requiredFieldIds = normalizeStringIdList(
    access.requiredFieldIds ?? access.required_field_ids,
  );
  const commentFieldIds = normalizeStringIdList(
    access.commentFieldIds ?? access.comment_field_ids,
  );
  const recordFieldIds = Array.isArray(
    access.recordFieldIds ?? access.record_field_ids,
  )
    ? normalizeStringIdList(access.recordFieldIds ?? access.record_field_ids)
    : visibleFieldIds;
  return {
    requiredFieldIds,
    visibleFieldIds,
    requireAttachment:
      access.requireAttachment === true || access.require_attachment === true,
    commentFieldIds,
    recordFieldIds,
  };
}

export type AutomationOutcome = {
  id: string;
  label: string;
  actions: AutomationAction[];
  fieldAccess: AutomationOutcomeFieldAccess;
  /**
   * When set, this outcome is eligible only if conditions match.
   * Empty rules always match (use as «иначе» / default).
   * Autofill evaluates outcomes in order and applies the first match.
   */
  conditions: AutomationConditions;
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

/** When the task is created relative to landing on its stage. */
export type AutomationLaunchPhase = "onEnter" | "beforeEnter";

export type AutomationTaskTemplate = {
  id: string;
  scenarioId: string;
  name: string;
  /** `{{fieldId}}` placeholders rendered at spawn. */
  nameTemplate: string;
  /** Task body; `{{fieldId}}` placeholders rendered at spawn. */
  description: string;
  /** List option id on the process trigger field. */
  triggerOptionId: string;
  stepOrder: number;
  isBlocking: boolean;
  kind: AutomationTaskKind;
  /**
   * `onEnter` — after landing on the stage (below «Старт»).
   * `beforeEnter` — prep before moving to the stage (above «Старт»);
   * spawns on the previous stage / next-option so it appears before the list change.
   */
  launchPhase: AutomationLaunchPhase;
  launchConditions: AutomationConditions;
  assignee: AutomationAssigneeResolver;
  watchers: AutomationAssigneeResolver;
  outcomes: AutomationOutcome[];
  sla: AutomationSla | null;
  materials: string[];
};

/** Free-form flow canvas positions keyed by React Flow node id. */
export type AutomationCanvasNodePositions = Record<
  string,
  { x: number; y: number }
>;

/**
 * Persisted canvas state for a scenario (stored in `canvas_layout` jsonb).
 * Legacy flat `{ [nodeId]: { x, y } }` is accepted by the normalizer.
 */
export type AutomationCanvasLayout = {
  positions: AutomationCanvasNodePositions;
  /** Stage option ids whose column (start + tasks) is collapsed. */
  collapsedStageIds: string[];
  /** Stage-map / else edge keys that are visually hidden. */
  hiddenStageLinkKeys: string[];
};

export function emptyAutomationCanvasLayout(): AutomationCanvasLayout {
  return {
    positions: {},
    collapsedStageIds: [],
    hiddenStageLinkKeys: [],
  };
}

function normalizeCanvasPositions(
  value: unknown,
): AutomationCanvasNodePositions {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: AutomationCanvasNodePositions = {};
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

function normalizeCanvasIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const id = item.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * Conditional gateway when leaving `fromOptionId` toward `toOptionId` («тогда»).
 * `toOptionId` may be any other stage, not only the next list option.
 * - conditions match → allow `toOptionId`
 * - else → `elseOptionId` if set, otherwise block the move
 */
export type AutomationStageTransition = {
  id: string;
  fromOptionId: string;
  /** Success target («тогда») — any stage except `fromOptionId`. */
  toOptionId: string;
  conditions: AutomationConditions;
  /** Redirect target when conditions fail; empty = forbid the transition. */
  elseOptionId: string;
};

export function createAutomationStageTransitionId() {
  return `astr-${crypto.randomUUID()}`;
}

export function normalizeAutomationStageTransition(
  value: unknown,
  index = 0,
): AutomationStageTransition | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const fromOptionId =
    typeof raw.fromOptionId === "string"
      ? raw.fromOptionId.trim()
      : typeof raw.from_option_id === "string"
        ? raw.from_option_id.trim()
        : "";
  const toOptionId =
    typeof raw.toOptionId === "string"
      ? raw.toOptionId.trim()
      : typeof raw.to_option_id === "string"
        ? raw.to_option_id.trim()
        : "";
  if (!fromOptionId || !toOptionId) return null;
  const id =
    typeof raw.id === "string" && raw.id.trim()
      ? raw.id.trim()
      : `astr-${index}-${fromOptionId}-${toOptionId}`;
  const elseOptionId =
    typeof raw.elseOptionId === "string"
      ? raw.elseOptionId.trim()
      : typeof raw.else_option_id === "string"
        ? raw.else_option_id.trim()
        : "";
  return {
    id,
    fromOptionId,
    toOptionId,
    conditions: normalizeAutomationConditions(raw.conditions),
    elseOptionId,
  };
}

export function normalizeAutomationStageTransitions(
  value: unknown,
): AutomationStageTransition[] {
  if (!Array.isArray(value)) return [];
  const out: AutomationStageTransition[] = [];
  const seen = new Set<string>();
  value.forEach((item, index) => {
    const transition = normalizeAutomationStageTransition(item, index);
    if (!transition) return;
    const key = `${transition.fromOptionId}\0${transition.toOptionId}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(transition);
  });
  return out;
}

/**
 * How tasks on a stage are released to assignees.
 * - `parallel` — all matching tasks spawn on enter (default).
 * - `sequential` — only the first by `stepOrder`; next spawns after the previous completes.
 */
export type AutomationStageTaskRelease = "parallel" | "sequential";

export const AUTOMATION_STAGE_TASK_RELEASE_LABELS: Record<
  AutomationStageTaskRelease,
  string
> = {
  parallel: "Параллельно",
  sequential: "Последовательно",
};

/** Per stage (list option id) release mode. Missing key → parallel. */
export type AutomationStageTaskReleaseMap = Record<
  string,
  AutomationStageTaskRelease
>;

export function normalizeAutomationStageTaskReleaseMap(
  value: unknown,
): AutomationStageTaskReleaseMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: AutomationStageTaskReleaseMap = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const id = key.trim();
    if (!id) continue;
    if (raw === "sequential" || raw === "parallel") {
      out[id] = raw;
    }
  }
  return out;
}

export function getStageTaskRelease(
  map: AutomationStageTaskReleaseMap | undefined,
  stageOptionId: string,
): AutomationStageTaskRelease {
  const mode = map?.[stageOptionId];
  return mode === "sequential" ? "sequential" : "parallel";
}

export type AutomationScenario = {
  id: string;
  processId: string;
  name: string;
  isDefault: boolean;
  entryConditions: AutomationConditions;
  priority: number;
  canvasLayout: AutomationCanvasLayout;
  /** Conditional rules on stage→stage edges of the process map. */
  stageTransitions: AutomationStageTransition[];
  /** Per-stage task release: parallel (default) or sequential by stepOrder. */
  stageTaskRelease: AutomationStageTaskReleaseMap;
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
  /** Rendered description at spawn. */
  description: string;
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
  return {
    id,
    label,
    actions: normalizeAutomationActions(item.actions),
    fieldAccess: normalizeAutomationOutcomeFieldAccess(item.fieldAccess),
    conditions: normalizeAutomationConditions(item.conditions),
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
      fieldAccess: emptyAutomationOutcomeFieldAccess(),
      conditions: emptyAutomationConditions(),
    },
    {
      id: createAutomationOutcomeId(),
      label: "Нет",
      actions: [],
      fieldAccess: emptyAutomationOutcomeFieldAccess(),
      conditions: emptyAutomationConditions(),
    },
  ];
}

/**
 * Silent branches: first matching `conditions` wins (empty = else).
 * Apply setField / stage moves without a user button.
 */
export function defaultAutofillOutcomes(): AutomationOutcome[] {
  return [
    {
      id: createAutomationOutcomeId(),
      label: "Иначе",
      actions: [],
      fieldAccess: emptyAutomationOutcomeFieldAccess(),
      conditions: emptyAutomationConditions(),
    },
  ];
}

/** Whether outcome has at least one condition rule (not a bare else). */
export function automationOutcomeHasConditions(
  outcome: Pick<AutomationOutcome, "conditions">,
) {
  return outcome.conditions.rules.length > 0;
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
  const descriptionRaw = raw.description;
  const triggerOptionIdRaw = raw.triggerOptionId ?? raw.trigger_option_id;
  const isBlocking = raw.isBlocking === true || raw.is_blocking === true;
  const kind: AutomationTaskKind =
    raw.kind === "single"
      ? "single"
      : raw.kind === "autofill"
        ? "autofill"
        : "decision";
  const launchPhaseRaw = raw.launchPhase ?? raw.launch_phase;
  const launchPhase: AutomationLaunchPhase =
    launchPhaseRaw === "beforeEnter" ? "beforeEnter" : "onEnter";
  return {
    id,
    scenarioId,
    name:
      typeof raw.name === "string" && raw.name.trim()
        ? raw.name.trim()
        : "Задача",
    nameTemplate: typeof nameTemplateRaw === "string" ? nameTemplateRaw : "",
    description: typeof descriptionRaw === "string" ? descriptionRaw : "",
    triggerOptionId:
      typeof triggerOptionIdRaw === "string" ? triggerOptionIdRaw : "",
    stepOrder:
      typeof stepOrderRaw === "number" && Number.isFinite(stepOrderRaw)
        ? Math.max(0, Math.round(stepOrderRaw))
        : 0,
    isBlocking,
    kind,
    launchPhase,
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
        : kind === "autofill"
          ? defaultAutofillOutcomes()
          : kind === "single"
            ? [
                {
                  id: createAutomationOutcomeId(),
                  label: "Готово",
                  actions: [],
                  fieldAccess: emptyAutomationOutcomeFieldAccess(),
                  conditions: emptyAutomationConditions(),
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
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return emptyAutomationCanvasLayout();
  }
  const raw = value as Record<string, unknown>;
  const isStructured =
    "positions" in raw ||
    "collapsedStageIds" in raw ||
    "collapsed_stage_ids" in raw ||
    "hiddenStageLinkKeys" in raw ||
    "hidden_stage_link_keys" in raw;

  if (isStructured) {
    return {
      positions: normalizeCanvasPositions(raw.positions),
      collapsedStageIds: normalizeCanvasIdList(
        raw.collapsedStageIds ?? raw.collapsed_stage_ids,
      ),
      hiddenStageLinkKeys: normalizeCanvasIdList(
        raw.hiddenStageLinkKeys ?? raw.hidden_stage_link_keys,
      ),
    };
  }

  // Legacy flat map: nodeId → { x, y }
  return {
    positions: normalizeCanvasPositions(raw),
    collapsedStageIds: [],
    hiddenStageLinkKeys: [],
  };
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
    isDefault: raw.isDefault === true || raw.is_default === true,
    entryConditions: normalizeAutomationConditions(
      raw.entryConditions ?? raw.entry_conditions,
    ),
    priority:
      typeof raw.priority === "number" && Number.isFinite(raw.priority)
        ? Math.round(raw.priority)
        : 0,
    canvasLayout: normalizeAutomationCanvasLayout(
      raw.canvasLayout ?? raw.canvas_layout,
    ),
    stageTransitions: normalizeAutomationStageTransitions(
      raw.stageTransitions ?? raw.stage_transitions,
    ),
    stageTaskRelease: normalizeAutomationStageTaskReleaseMap(
      raw.stageTaskRelease ?? raw.stage_task_release,
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
      canvasLayout: emptyAutomationCanvasLayout(),
      stageTransitions: [],
      stageTaskRelease: {},
    },
  };
}
