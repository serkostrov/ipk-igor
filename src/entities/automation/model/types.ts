import { normalizeListColor } from "@/entities/entity";
import {
  defaultWatcherResolver,
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
 * - create_linked_leads  → createRecord (per item) / updateRecords
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

/**
 * - decision / single — interactive tasks with buttons
 * - autofill — silent «Переход»: route branches, no user task UI
 * - actions — silent «Автозаполнение»: run actions only, no user task UI
 */
export type AutomationTaskKind = "decision" | "single" | "autofill" | "actions";

/** No assignee dialog; host auto-completes the spawned row. */
export function isAutomationSilentTaskKind(kind: AutomationTaskKind) {
  return kind === "autofill" || kind === "actions";
}

export type AutomationTaskStatus =
  "pending" | "completed" | "cancelled" | "returned";

/**
 * Ask the assignee to fill a field on a *related* record, reached through a
 * relation field of the trigger entity — or through a linked-entity tab
 * (подсущность) on the trigger entity.
 */
export type AutomationAskRelatedField = {
  /** Stable row id (not an entity field id). */
  id: string;
  /**
   * Relation field on the trigger entity (forward link).
   * Empty when `linkedTabId` is set.
   */
  relationFieldId: string;
  /**
   * Linked-entity tab on the trigger (`kind: "entity"`).
   * When set, related records are children linked via the tab’s parent field.
   */
  linkedTabId?: string;
  /** Field on the related / linked entity. */
  fieldId: string;
  /** Ask mode when `fieldId` is a `relationGroups` field. */
  relationGroupsMode?: AutomationRelationGroupsAskMode;
};

/**
 * Read-only field from an arbitrary entity on the task form.
 * Records are resolved by matching entity fields to trigger field values.
 */
export type AutomationViewEntityField = {
  /** Stable row id (not an entity field id). */
  id: string;
  entityId: string;
  /** Field on that entity to show. */
  fieldId: string;
  /**
   * Keep records where every pair matches:
   * `entity[entityFieldId]` equals `trigger[triggerFieldId]`
   * (ids for relations/lists, trimmed text otherwise).
   */
  matches: Array<{ entityFieldId: string; triggerFieldId: string }>;
};

/**
 * How a `relationGroups` field is asked on a task form.
 * - full — both levels
 * - items — only «Строки» (roots)
 * - nested — only «Вложенные» under existing «Строки»
 */
export type AutomationRelationGroupsAskMode = "full" | "items" | "nested";

export const AUTOMATION_RELATION_GROUPS_ASK_MODE_LABELS: Record<
  AutomationRelationGroupsAskMode,
  string
> = {
  full: "Всё сразу",
  items: "Только строки",
  nested: "Только вложенные",
};

export function automationRelationGroupsAskModeLabel(
  mode: AutomationRelationGroupsAskMode,
): string {
  return AUTOMATION_RELATION_GROUPS_ASK_MODE_LABELS[mode] ?? mode;
}

/** Ask modes for a 2-level relationGroups field. */
export function automationRelationGroupsAskModes(
  // Kept for call-site compat (was levelCount when nesting was unlimited).
  levelCount?: number,
): AutomationRelationGroupsAskMode[] {
  void levelCount;
  return ["full", "items", "nested"];
}

/** Per-field ask presentation overrides (keyed by field id). */
export type AutomationFieldAskOptions = {
  relationGroupsMode?: AutomationRelationGroupsAskMode;
};

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
  /** Related-entity fields shown on the task form. */
  relatedVisibleFields: AutomationAskRelatedField[];
  /** `relatedVisibleFields[].id` that are required. */
  relatedRequiredIds: string[];
  /** Related ask ids whose values are appended as notes on the related record. */
  relatedCommentIds: string[];
  /**
   * Related ask ids written onto the related record.
   * Defaults to all related visible for new configs.
   */
  relatedRecordIds: string[];
  /** Presentation tweaks for complex ask fields (e.g. relationGroups mode). */
  fieldAskOptions: Record<string, AutomationFieldAskOptions>;
};

export function emptyAutomationOutcomeFieldAccess(): AutomationOutcomeFieldAccess {
  return {
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
  };
}

function normalizeRelationGroupsAskMode(
  value: unknown,
): AutomationRelationGroupsAskMode | undefined {
  if (value === "full" || value === "items" || value === "nested") return value;
  // Legacy `level:N` from unlimited nesting — map back to 2-level modes.
  if (typeof value === "string" && value.startsWith("level:")) {
    const n = Number(value.slice(6));
    if (!Number.isFinite(n) || n < 0) return undefined;
    if (n <= 0) return "items";
    if (n === 1) return "nested";
    return "full";
  }
  return undefined;
}

function normalizeFieldAskOptions(
  value: unknown,
  visibleFieldIds: readonly string[],
): Record<string, AutomationFieldAskOptions> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const visible = new Set(visibleFieldIds);
  const result: Record<string, AutomationFieldAskOptions> = {};
  for (const [fieldId, raw] of Object.entries(
    value as Record<string, unknown>,
  )) {
    if (!visible.has(fieldId) || !raw || typeof raw !== "object") continue;
    const mode = normalizeRelationGroupsAskMode(
      (raw as Record<string, unknown>).relationGroupsMode,
    );
    if (!mode || mode === "full") continue;
    result[fieldId] = { relationGroupsMode: mode };
  }
  return result;
}

function normalizeStringIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (id): id is string => typeof id === "string" && id.trim().length > 0,
  );
}

export function normalizeAskRelatedFields(
  value: unknown,
): AutomationAskRelatedField[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: AutomationAskRelatedField[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Record<string, unknown>;
    const relationFieldId =
      typeof raw.relationFieldId === "string"
        ? raw.relationFieldId.trim()
        : typeof raw.relation_field_id === "string"
          ? raw.relation_field_id.trim()
          : "";
    const linkedTabId =
      typeof raw.linkedTabId === "string"
        ? raw.linkedTabId.trim()
        : typeof raw.linked_tab_id === "string"
          ? raw.linked_tab_id.trim()
          : "";
    const fieldId =
      typeof raw.fieldId === "string"
        ? raw.fieldId.trim()
        : typeof raw.field_id === "string"
          ? raw.field_id.trim()
          : "";
    if (!fieldId || (!relationFieldId && !linkedTabId)) continue;
    const id =
      typeof raw.id === "string" && raw.id.trim()
        ? raw.id.trim()
        : linkedTabId
          ? `related-tab-${linkedTabId}-${fieldId}`
          : `related-${relationFieldId}-${fieldId}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const relationGroupsMode = normalizeRelationGroupsAskMode(
      raw.relationGroupsMode ?? raw.relation_groups_mode,
    );
    result.push({
      id,
      relationFieldId: linkedTabId ? "" : relationFieldId,
      fieldId,
      ...(linkedTabId ? { linkedTabId } : {}),
      ...(relationGroupsMode && relationGroupsMode !== "full"
        ? { relationGroupsMode }
        : {}),
    });
  }
  return result;
}

export function normalizeViewEntityFields(
  value: unknown,
): AutomationViewEntityField[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: AutomationViewEntityField[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Record<string, unknown>;
    const entityId =
      typeof raw.entityId === "string"
        ? raw.entityId.trim()
        : typeof raw.entity_id === "string"
          ? raw.entity_id.trim()
          : "";
    const fieldId =
      typeof raw.fieldId === "string"
        ? raw.fieldId.trim()
        : typeof raw.field_id === "string"
          ? raw.field_id.trim()
          : "";
    if (!entityId || !fieldId) continue;
    const matchesRaw = Array.isArray(raw.matches) ? raw.matches : [];
    const matches: AutomationViewEntityField["matches"] = [];
    const matchSeen = new Set<string>();
    for (const match of matchesRaw) {
      if (!match || typeof match !== "object") continue;
      const row = match as Record<string, unknown>;
      const entityFieldId =
        typeof row.entityFieldId === "string"
          ? row.entityFieldId.trim()
          : typeof row.entity_field_id === "string"
            ? row.entity_field_id.trim()
            : "";
      const triggerFieldId =
        typeof row.triggerFieldId === "string"
          ? row.triggerFieldId.trim()
          : typeof row.trigger_field_id === "string"
            ? row.trigger_field_id.trim()
            : "";
      if (!entityFieldId || !triggerFieldId) continue;
      const key = `${entityFieldId}:${triggerFieldId}`;
      if (matchSeen.has(key)) continue;
      matchSeen.add(key);
      matches.push({ entityFieldId, triggerFieldId });
    }
    if (matches.length === 0) continue;
    const id =
      typeof raw.id === "string" && raw.id.trim()
        ? raw.id.trim()
        : `view-entity-${entityId}-${fieldId}-${matches
            .map((match) => `${match.entityFieldId}:${match.triggerFieldId}`)
            .join("|")}`;
    if (seen.has(id)) continue;
    seen.add(id);
    result.push({ id, entityId, fieldId, matches });
  }
  return result;
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
  const relatedVisibleFields = normalizeAskRelatedFields(
    access.relatedVisibleFields ?? access.related_visible_fields,
  );
  const relatedVisibleIds = new Set(
    relatedVisibleFields.map((field) => field.id),
  );
  const relatedRequiredIds = normalizeStringIdList(
    access.relatedRequiredIds ?? access.related_required_ids,
  ).filter((id) => relatedVisibleIds.has(id));
  const relatedCommentIds = normalizeStringIdList(
    access.relatedCommentIds ?? access.related_comment_ids,
  ).filter((id) => relatedVisibleIds.has(id));
  const relatedRecordRaw = access.relatedRecordIds ?? access.related_record_ids;
  const relatedRecordIds = Array.isArray(relatedRecordRaw)
    ? normalizeStringIdList(relatedRecordRaw).filter((id) =>
        relatedVisibleIds.has(id),
      )
    : relatedVisibleFields.map((field) => field.id);
  return {
    requiredFieldIds,
    visibleFieldIds,
    requireAttachment:
      access.requireAttachment === true || access.require_attachment === true,
    commentFieldIds,
    recordFieldIds,
    relatedVisibleFields,
    relatedRequiredIds,
    relatedCommentIds,
    relatedRecordIds,
    fieldAskOptions: normalizeFieldAskOptions(
      access.fieldAskOptions ?? access.field_ask_options,
      visibleFieldIds,
    ),
  };
}

/** Draft value key for a related-entity ask field on the task form. */
export function relatedAskValueKey(
  relationFieldId: string,
  relatedRecordId: string,
  fieldId: string,
) {
  return `related:${relationFieldId}:${relatedRecordId}:${fieldId}`;
}

export function parseRelatedAskValueKey(key: string): {
  relationFieldId: string;
  relatedRecordId: string;
  fieldId: string;
} | null {
  if (!key.startsWith("related:")) return null;
  const parts = key.slice("related:".length).split(":");
  if (parts.length !== 3) return null;
  const [relationFieldId, relatedRecordId, fieldId] = parts;
  if (!relationFieldId || !relatedRecordId || !fieldId) return null;
  return { relationFieldId, relatedRecordId, fieldId };
}

/**
 * Where read-only «Для просмотра» appears relative to outcome buttons.
 * - `beforeOutcomes` — visible immediately, before choosing a result
 * - `afterSelect` — only after the assignee picks a button
 */
export type AutomationViewFieldsPlacement = "beforeOutcomes" | "afterSelect";

/**
 * How an outcome button behaves on first click.
 * - `auto` — finish immediately when there is nothing to fill; else open the form
 * - `immediate` — one click completes the task
 * - `withForm` — first click opens the form, second confirms
 */
export type AutomationOutcomeButtonMode = "auto" | "immediate" | "withForm";

export type AutomationOutcome = {
  id: string;
  label: string;
  /**
   * Accent for the result button in the task UI (`#rrggbb`).
   * `null` / missing — theme default.
   */
  color: string | null;
  actions: AutomationAction[];
  fieldAccess: AutomationOutcomeFieldAccess;
  /**
   * When set, this outcome is eligible only if conditions match.
   * Empty rules always match (use as «иначе» / default).
   * Autofill evaluates outcomes in order and applies the first match.
   */
  conditions: AutomationConditions;
  /** Click behaviour for interactive decision / single buttons. */
  buttonMode: AutomationOutcomeButtonMode;
};

export type AutomationSla = {
  hours: number;
  /** Reserved for business-calendar support. */
  calendar: "247" | "business";
};

export type AutomationNotificationEvent = "assigned" | "completed" | "overdue";

export const AUTOMATION_NOTIFICATION_EVENT_OPTIONS: Array<{
  value: AutomationNotificationEvent;
  label: string;
  description: string;
}> = [
  {
    value: "assigned",
    label: "Назначение",
    description: "Когда задание появляется у исполнителя",
  },
  {
    value: "completed",
    label: "Завершение",
    description: "Когда исполнитель завершил задание",
  },
  {
    value: "overdue",
    label: "Просрочка",
    description: "Когда истёк срок по SLA",
  },
];

export function describeAutomationNotificationEvent(
  event: AutomationNotificationEvent,
): string {
  return (
    AUTOMATION_NOTIFICATION_EVENT_OPTIONS.find((item) => item.value === event)
      ?.label ?? event
  );
}

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
  /**
   * When false the template is skipped at spawn (not created, sequential
   * chain continues to the next enabled template). Default true.
   */
  enabled: boolean;
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
  /**
   * Where «Для просмотра» (viewField / view entity) is shown for decision
   * tasks. Single-button tasks always show the form upfront.
   */
  viewFieldsPlacement: AutomationViewFieldsPlacement;
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
  createdAt: string;
  updatedAt: string;
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

export function normalizeAutomationOutcomeButtonMode(
  value: unknown,
): AutomationOutcomeButtonMode {
  if (value === "immediate" || value === "withForm" || value === "auto") {
    return value;
  }
  return "auto";
}

export function normalizeAutomationViewFieldsPlacement(
  value: unknown,
): AutomationViewFieldsPlacement {
  if (value === "afterSelect" || value === "beforeOutcomes") return value;
  return "beforeOutcomes";
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
  const colorRaw = typeof item.color === "string" ? item.color.trim() : "";
  return {
    id,
    label,
    color: colorRaw ? normalizeListColor(colorRaw) : null,
    actions: normalizeAutomationActions(item.actions),
    fieldAccess: normalizeAutomationOutcomeFieldAccess(item.fieldAccess),
    conditions: normalizeAutomationConditions(item.conditions),
    buttonMode: normalizeAutomationOutcomeButtonMode(
      item.buttonMode ?? item.button_mode,
    ),
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
      color: "#22c55e",
      actions: [],
      fieldAccess: emptyAutomationOutcomeFieldAccess(),
      conditions: emptyAutomationConditions(),
      buttonMode: "auto",
    },
    {
      id: createAutomationOutcomeId(),
      label: "Нет",
      color: "#ef4444",
      actions: [],
      fieldAccess: emptyAutomationOutcomeFieldAccess(),
      conditions: emptyAutomationConditions(),
      buttonMode: "auto",
    },
  ];
}

/**
 * Silent route branches («Переход»): first matching `conditions` wins
 * (empty = else). Apply setField / stage moves without a user button.
 */
export function defaultAutofillOutcomes(): AutomationOutcome[] {
  return [
    {
      id: createAutomationOutcomeId(),
      label: "Иначе",
      color: null,
      actions: [],
      fieldAccess: emptyAutomationOutcomeFieldAccess(),
      conditions: emptyAutomationConditions(),
      buttonMode: "auto",
    },
  ];
}

/** Silent «Автозаполнение»: one auto outcome with actions only. */
export function defaultActionsOutcomes(): AutomationOutcome[] {
  return [
    {
      id: createAutomationOutcomeId(),
      label: "Авто",
      color: null,
      actions: [],
      fieldAccess: emptyAutomationOutcomeFieldAccess(),
      conditions: emptyAutomationConditions(),
      buttonMode: "auto",
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
  const enabled = raw.enabled !== false;
  const kind: AutomationTaskKind =
    raw.kind === "single"
      ? "single"
      : raw.kind === "autofill"
        ? "autofill"
        : raw.kind === "actions"
          ? "actions"
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
    enabled,
    kind,
    launchPhase,
    launchConditions: normalizeAutomationConditions(
      raw.launchConditions ?? raw.launch_conditions,
    ),
    assignee: normalizeAssigneeResolver(raw.assignee),
    watchers: normalizeAssigneeResolver(
      raw.watchers ?? defaultWatcherResolver(),
    ),
    outcomes:
      outcomes.length > 0
        ? outcomes
        : kind === "autofill"
          ? defaultAutofillOutcomes()
          : kind === "actions"
            ? defaultActionsOutcomes()
            : kind === "single"
              ? [
                  {
                    id: createAutomationOutcomeId(),
                    label: "Готово",
                    color: null,
                    actions: [],
                    fieldAccess: emptyAutomationOutcomeFieldAccess(),
                    conditions: emptyAutomationConditions(),
                    buttonMode: "auto",
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
    viewFieldsPlacement: normalizeAutomationViewFieldsPlacement(
      raw.viewFieldsPlacement ?? raw.view_fields_placement,
    ),
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
  const now = new Date().toISOString();
  const createdAt =
    typeof raw.createdAt === "string" && raw.createdAt.trim()
      ? raw.createdAt.trim()
      : typeof raw.created_at === "string" && raw.created_at.trim()
        ? raw.created_at.trim()
        : now;
  const updatedAt =
    typeof raw.updatedAt === "string" && raw.updatedAt.trim()
      ? raw.updatedAt.trim()
      : typeof raw.updated_at === "string" && raw.updated_at.trim()
        ? raw.updated_at.trim()
        : createdAt;
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
    createdAt,
    updatedAt,
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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  };
}
