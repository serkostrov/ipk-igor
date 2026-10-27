import type {
  AutomationAction,
  AutomationFieldMapping,
} from "../model/actions";
import {
  parseAutomationEntityPathRef,
  parseAutomationFieldRef,
} from "../model/action-values";
import {
  defaultAssigneeLeafResolver,
  type AutomationAssigneeLeafResolver,
  type AutomationAssigneeResolver,
} from "../model/assignee";
import type {
  AutomationConditionNode,
  AutomationConditions,
} from "../model/conditions";
import type {
  AutomationConfig,
  AutomationNotificationRule,
  AutomationOutcome,
  AutomationOutcomeFieldAccess,
  AutomationProcess,
  AutomationScenario,
  AutomationTaskTemplate,
} from "../model/types";

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Remove `{{fieldId}}` / path tokens that mention the deleted field. */
export function stripFieldTokensFromText(
  text: string,
  fieldId: string,
): string {
  if (!text || !fieldId) return text;
  const escaped = escapeRegExp(fieldId);
  return text
    .replace(new RegExp(`\\{\\{${escaped}\\}\\}`, "g"), "")
    .replace(new RegExp(`\\{\\{${escaped}\\.[^}]+\\}\\}`, "g"), "")
    .replace(new RegExp(`\\{\\{[^.}]+\\.${escaped}\\}\\}`, "g"), "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function valueMentionsField(value: string, fieldId: string): boolean {
  const direct = parseAutomationFieldRef(value);
  if (direct === fieldId) return true;
  const path = parseAutomationEntityPathRef(value);
  if (!path) return false;
  return path.relationFieldId === fieldId || path.fieldId === fieldId;
}

function scrubValue(value: string, fieldId: string): string {
  if (!value) return value;
  if (valueMentionsField(value, fieldId)) return "";
  return stripFieldTokensFromText(value, fieldId);
}

function withoutId(ids: readonly string[], fieldId: string): string[] {
  return ids.filter((id) => id !== fieldId);
}

export function scrubAutomationConditions(
  conditions: AutomationConditions,
  fieldId: string,
): AutomationConditions {
  function scrubNode(
    node: AutomationConditionNode,
  ): AutomationConditionNode | null {
    if (node.kind === "rule") {
      return node.fieldId === fieldId ? null : node;
    }
    const rules = node.rules.filter((rule) => rule.fieldId !== fieldId);
    if (rules.length === 0) return null;
    return { ...node, rules };
  }

  return {
    ...conditions,
    rules: conditions.rules
      .map(scrubNode)
      .filter((item): item is AutomationConditionNode => item != null),
  };
}

function scrubAssigneeLeaf(
  resolver: AutomationAssigneeLeafResolver,
  fieldId: string,
): AutomationAssigneeLeafResolver {
  switch (resolver.type) {
    case "field":
    case "relationFieldFanOut":
      return resolver.fieldId === fieldId
        ? defaultAssigneeLeafResolver()
        : resolver;
    case "relatedField": {
      const via = resolver.via?.filter((id) => id !== fieldId) ?? [];
      if (
        resolver.relationFieldId === fieldId ||
        resolver.fieldId === fieldId ||
        (resolver.via?.length ?? 0) !== via.length
      ) {
        return defaultAssigneeLeafResolver();
      }
      return resolver;
    }
    default:
      return resolver;
  }
}

export function scrubAutomationAssignee(
  resolver: AutomationAssigneeResolver,
  fieldId: string,
): AutomationAssigneeResolver {
  if (resolver.type !== "conditional") {
    return scrubAssigneeLeaf(resolver, fieldId);
  }
  return {
    ...resolver,
    branches: resolver.branches.map((branch) => ({
      ...branch,
      conditions: scrubAutomationConditions(branch.conditions, fieldId),
      resolver: scrubAssigneeLeaf(branch.resolver, fieldId),
    })),
    elseResolver: scrubAssigneeLeaf(resolver.elseResolver, fieldId),
  };
}

function scrubMappings(
  mappings: AutomationFieldMapping[],
  fieldId: string,
): AutomationFieldMapping[] {
  return mappings
    .filter((item) => item.targetFieldId !== fieldId)
    .map((item) => ({
      ...item,
      source: scrubValue(item.source, fieldId),
    }))
    .filter((item) => item.targetFieldId.trim() !== "");
}

function scrubAction(
  action: AutomationAction,
  fieldId: string,
): AutomationAction | null {
  switch (action.kind) {
    case "noop":
    case "viewTabs":
    case "spawnTasks":
    case "cancelTasks":
      return action;
    case "setField":
      if (action.fieldId === fieldId) return { id: action.id, kind: "noop" };
      return { ...action, value: scrubValue(action.value, fieldId) };
    case "setFieldPrevious":
      return action.fieldId === fieldId
        ? { id: action.id, kind: "noop" }
        : action;
    case "viewField": {
      const fieldIds = withoutId(action.fieldIds, fieldId);
      return { ...action, fieldIds };
    }
    case "requireFields": {
      const fieldIds = withoutId(action.fieldIds, fieldId);
      return { ...action, fieldIds };
    }
    case "setRelation":
    case "addRelation":
      if (action.fieldId === fieldId) return { id: action.id, kind: "noop" };
      return { ...action, value: scrubValue(action.value, fieldId) };
    case "attachToFolder":
      return action.fileFieldId === fieldId
        ? { id: action.id, kind: "noop" }
        : action;
    case "createRecord": {
      const askFieldIds = (action.askFieldIds ?? []).filter(
        (id) => id !== fieldId,
      );
      const askRequiredFieldIds = (action.askRequiredFieldIds ?? []).filter(
        (id) => id !== fieldId && askFieldIds.includes(id),
      );
      const fieldAskOptions = { ...(action.fieldAskOptions ?? {}) };
      delete fieldAskOptions[fieldId];
      const nestedCreates = (action.nestedCreates ?? []).map((nested) => {
        const nestedAsk = nested.askFieldIds.filter((id) => id !== fieldId);
        const nestedRequired = (nested.askRequiredFieldIds ?? []).filter(
          (id) => id !== fieldId && nestedAsk.includes(id),
        );
        const nestedOpts = { ...(nested.fieldAskOptions ?? {}) };
        delete nestedOpts[fieldId];
        return {
          ...nested,
          askFieldIds: nestedAsk,
          askRequiredFieldIds:
            nestedRequired.length > 0 ? nestedRequired : undefined,
          fieldAskOptions:
            Object.keys(nestedOpts).length > 0 ? nestedOpts : undefined,
          mappings: nested.mappings
            ? scrubMappings(nested.mappings, fieldId)
            : undefined,
        };
      });
      const parentFromRelated = (action.parentFromRelated ?? []).filter(
        (item) => item.relationFieldId !== fieldId,
      );
      const relatedCleared =
        (action.parentFromRelated?.length ?? 0) > 0 &&
        parentFromRelated.length === 0;
      return {
        ...action,
        linkBackFieldId:
          action.linkBackFieldId === fieldId
            ? undefined
            : action.linkBackFieldId,
        mappings: scrubMappings(action.mappings, fieldId),
        askFieldIds: askFieldIds.length > 0 ? askFieldIds : undefined,
        askRequiredFieldIds:
          askRequiredFieldIds.length > 0 ? askRequiredFieldIds : undefined,
        fieldAskOptions:
          Object.keys(fieldAskOptions).length > 0 ? fieldAskOptions : undefined,
        nestedCreates: nestedCreates.length > 0 ? nestedCreates : undefined,
        parentFromRelated:
          parentFromRelated.length > 0 ? parentFromRelated : undefined,
        alsoLinkTrigger:
          parentFromRelated.length > 0 ? action.alsoLinkTrigger : undefined,
        ...(relatedCleared
          ? { multiple: action.multiple === true ? true : undefined }
          : {}),
      };
    }
    case "updateRecords":
      if (action.linkFieldId === fieldId) {
        return { id: action.id, kind: "noop" };
      }
      return {
        ...action,
        mappings: scrubMappings(action.mappings, fieldId),
      };
    case "copyFields":
      if (action.targetRelationFieldId === fieldId) {
        return { id: action.id, kind: "noop" };
      }
      return {
        ...action,
        mappings: scrubMappings(action.mappings, fieldId),
      };
    case "startProcess":
      return {
        ...action,
        targetRelationFieldId:
          action.targetRelationFieldId === fieldId
            ? "self"
            : action.targetRelationFieldId,
        enterFieldId:
          action.enterFieldId === fieldId ? undefined : action.enterFieldId,
      };
    case "notify":
      return {
        ...action,
        message: scrubValue(action.message, fieldId),
        recipient: scrubAutomationAssignee(action.recipient, fieldId),
      };
  }
}

function scrubFieldAccess(
  access: AutomationOutcomeFieldAccess,
  fieldId: string,
): AutomationOutcomeFieldAccess {
  const relatedVisibleFields = access.relatedVisibleFields.filter(
    (item) => item.relationFieldId !== fieldId && item.fieldId !== fieldId,
  );
  const keptAskIds = new Set(relatedVisibleFields.map((item) => item.id));
  const fieldAskOptions = { ...access.fieldAskOptions };
  delete fieldAskOptions[fieldId];

  return {
    ...access,
    requiredFieldIds: withoutId(access.requiredFieldIds, fieldId),
    visibleFieldIds: withoutId(access.visibleFieldIds, fieldId),
    commentFieldIds: withoutId(access.commentFieldIds, fieldId),
    recordFieldIds: withoutId(access.recordFieldIds, fieldId),
    fieldAskOptions,
    relatedVisibleFields,
    relatedRequiredIds: access.relatedRequiredIds.filter((id) =>
      keptAskIds.has(id),
    ),
    relatedCommentIds: access.relatedCommentIds.filter((id) =>
      keptAskIds.has(id),
    ),
    relatedRecordIds: access.relatedRecordIds.filter((id) =>
      keptAskIds.has(id),
    ),
  };
}

function scrubOutcome(
  outcome: AutomationOutcome,
  fieldId: string,
): AutomationOutcome {
  const actions = outcome.actions
    .map((action) => scrubAction(action, fieldId))
    .filter((action): action is AutomationAction => action != null);
  return {
    ...outcome,
    fieldAccess: scrubFieldAccess(outcome.fieldAccess, fieldId),
    conditions: scrubAutomationConditions(outcome.conditions, fieldId),
    actions,
  };
}

function scrubTemplate(
  template: AutomationTaskTemplate,
  fieldId: string,
): AutomationTaskTemplate {
  return {
    ...template,
    nameTemplate: stripFieldTokensFromText(template.nameTemplate, fieldId),
    description: stripFieldTokensFromText(template.description, fieldId),
    launchConditions: scrubAutomationConditions(
      template.launchConditions,
      fieldId,
    ),
    assignee: scrubAutomationAssignee(template.assignee, fieldId),
    watchers: scrubAutomationAssignee(template.watchers, fieldId),
    outcomes: template.outcomes.map((outcome) =>
      scrubOutcome(outcome, fieldId),
    ),
  };
}

function scrubScenario(
  scenario: AutomationScenario,
  fieldId: string,
): AutomationScenario {
  return {
    ...scenario,
    entryConditions: scrubAutomationConditions(
      scenario.entryConditions,
      fieldId,
    ),
    stageTransitions: scenario.stageTransitions.map((transition) => ({
      ...transition,
      conditions: scrubAutomationConditions(transition.conditions, fieldId),
    })),
  };
}

function scrubProcess(
  process: AutomationProcess,
  fieldId: string,
): AutomationProcess {
  if (process.triggerFieldId !== fieldId) return process;
  return { ...process, triggerFieldId: "" };
}

function scrubNotificationRule(
  rule: AutomationNotificationRule,
  fieldId: string,
): AutomationNotificationRule {
  return {
    ...rule,
    recipients: scrubAutomationAssignee(rule.recipients, fieldId),
    conditions: scrubAutomationConditions(rule.conditions, fieldId),
    messageTemplate: stripFieldTokensFromText(rule.messageTemplate, fieldId),
  };
}

export type PurgeFieldFromAutomationResult = {
  config: AutomationConfig;
  changedProcessIds: string[];
  changedScenarioIds: string[];
  changedTemplateIds: string[];
  changedRuleIds: string[];
};

/**
 * Remove all references to `fieldId` from automation config for processes
 * bound to `entityId` (and related-ask leaf fields that match).
 */
export function purgeFieldFromAutomationConfig(
  config: AutomationConfig,
  entityId: string,
  fieldId: string,
): PurgeFieldFromAutomationResult {
  const id = fieldId.trim();
  if (!id) {
    return {
      config,
      changedProcessIds: [],
      changedScenarioIds: [],
      changedTemplateIds: [],
      changedRuleIds: [],
    };
  }

  const processIds = new Set(
    config.processes
      .filter((process) => process.entityId === entityId)
      .map((process) => process.id),
  );

  const changedProcessIds: string[] = [];
  const processes = config.processes.map((process) => {
    if (!processIds.has(process.id) && process.entityId !== entityId) {
      return process;
    }
    const next = scrubProcess(process, id);
    if (next !== process && next.triggerFieldId !== process.triggerFieldId) {
      changedProcessIds.push(process.id);
    } else if (JSON.stringify(next) !== JSON.stringify(process)) {
      changedProcessIds.push(process.id);
    }
    return next;
  });

  const scenarioIds = new Set(
    config.scenarios
      .filter((scenario) => processIds.has(scenario.processId))
      .map((scenario) => scenario.id),
  );

  const changedScenarioIds: string[] = [];
  const scenarios = config.scenarios.map((scenario) => {
    if (!scenarioIds.has(scenario.id)) return scenario;
    const next = scrubScenario(scenario, id);
    if (JSON.stringify(next) !== JSON.stringify(scenario)) {
      changedScenarioIds.push(scenario.id);
    }
    return next;
  });

  const changedTemplateIds: string[] = [];
  const templates = config.templates.map((template) => {
    const belongs = scenarioIds.has(template.scenarioId);
    // Always scrub related-ask / actions that reference this field id
    // (leaf on related entity, or trigger field on owned templates).
    const next = scrubTemplate(template, id);
    if (!belongs && JSON.stringify(next) === JSON.stringify(template)) {
      return template;
    }
    if (JSON.stringify(next) !== JSON.stringify(template)) {
      changedTemplateIds.push(template.id);
      return next;
    }
    return template;
  });

  const templateIdSet = new Set(config.templates.map((item) => item.id));
  const ownedTemplateIds = new Set(
    config.templates
      .filter((template) => scenarioIds.has(template.scenarioId))
      .map((template) => template.id),
  );

  const changedRuleIds: string[] = [];
  const notificationRules = config.notificationRules.map((rule) => {
    if (!templateIdSet.has(rule.templateId)) return rule;
    if (!ownedTemplateIds.has(rule.templateId)) {
      // Still scrub if message/conditions mention the field id.
      const next = scrubNotificationRule(rule, id);
      if (JSON.stringify(next) !== JSON.stringify(rule)) {
        changedRuleIds.push(rule.id);
        return next;
      }
      return rule;
    }
    const next = scrubNotificationRule(rule, id);
    if (JSON.stringify(next) !== JSON.stringify(rule)) {
      changedRuleIds.push(rule.id);
    }
    return next;
  });

  return {
    config: {
      processes,
      scenarios,
      templates,
      notificationRules,
    },
    changedProcessIds: [...new Set(changedProcessIds)],
    changedScenarioIds: [...new Set(changedScenarioIds)],
    changedTemplateIds: [...new Set(changedTemplateIds)],
    changedRuleIds: [...new Set(changedRuleIds)],
  };
}
