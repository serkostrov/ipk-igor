import {
  createAutomationActionId,
  type AutomationAction,
} from "../model/actions";
import {
  createAutomationNotificationRuleId,
  createAutomationOutcomeId,
  createAutomationScenarioId,
  createAutomationStageTransitionId,
  createAutomationTemplateId,
  type AutomationCanvasLayout,
  type AutomationNotificationRule,
  type AutomationOutcome,
  type AutomationScenario,
  type AutomationTaskTemplate,
} from "../model/types";

function remapAction(
  action: AutomationAction,
  templateIdMap: Map<string, string>,
): AutomationAction {
  const id = createAutomationActionId();
  if (action.kind === "spawnTasks" || action.kind === "cancelTasks") {
    return {
      ...action,
      id,
      templateIds: (action.templateIds ?? []).map(
        (templateId) => templateIdMap.get(templateId) ?? templateId,
      ),
    };
  }
  return { ...action, id };
}

function remapOutcome(
  outcome: AutomationOutcome,
  templateIdMap: Map<string, string>,
): AutomationOutcome {
  return {
    ...outcome,
    id: createAutomationOutcomeId(),
    actions: outcome.actions.map((action) =>
      remapAction(action, templateIdMap),
    ),
  };
}

function remapCanvasLayout(
  layout: AutomationCanvasLayout,
  templateIdMap: Map<string, string>,
): AutomationCanvasLayout {
  const positions: AutomationCanvasLayout["positions"] = {};
  for (const [nodeId, point] of Object.entries(layout.positions)) {
    const nextId = templateIdMap.get(nodeId) ?? nodeId;
    positions[nextId] = point;
  }
  return {
    positions,
    collapsedStageIds: [...layout.collapsedStageIds],
    hiddenStageLinkKeys: [...layout.hiddenStageLinkKeys],
  };
}

export type ClonedAutomationScenario = {
  scenario: AutomationScenario;
  templates: AutomationTaskTemplate[];
  notificationRules: AutomationNotificationRule[];
};

/** Deep-clone a scenario with fresh ids (templates, outcomes, actions, rules). */
export function cloneAutomationScenario(input: {
  source: AutomationScenario;
  sourceTemplates: AutomationTaskTemplate[];
  sourceRules?: AutomationNotificationRule[];
  name: string;
}): ClonedAutomationScenario {
  const scenarioId = createAutomationScenarioId();
  const templateIdMap = new Map<string, string>();

  for (const template of input.sourceTemplates) {
    templateIdMap.set(template.id, createAutomationTemplateId());
  }

  const templates = input.sourceTemplates.map((template) => {
    const id = templateIdMap.get(template.id)!;
    return {
      ...structuredClone(template),
      id,
      scenarioId,
      outcomes: template.outcomes.map((outcome) =>
        remapOutcome(outcome, templateIdMap),
      ),
    };
  });

  const sourceTemplateIds = new Set(input.sourceTemplates.map((t) => t.id));
  const notificationRules = (input.sourceRules ?? [])
    .filter((rule) => sourceTemplateIds.has(rule.templateId))
    .map((rule) => ({
      ...structuredClone(rule),
      id: createAutomationNotificationRuleId(),
      templateId: templateIdMap.get(rule.templateId) ?? rule.templateId,
    }));

  const now = new Date().toISOString();
  const scenario: AutomationScenario = {
    ...structuredClone(input.source),
    id: scenarioId,
    name: input.name.trim() || "Сценарий",
    isDefault: false,
    canvasLayout: remapCanvasLayout(input.source.canvasLayout, templateIdMap),
    stageTransitions: input.source.stageTransitions.map((transition) => ({
      ...structuredClone(transition),
      id: createAutomationStageTransitionId(),
    })),
    createdAt: now,
    updatedAt: now,
  };

  return { scenario, templates, notificationRules };
}
