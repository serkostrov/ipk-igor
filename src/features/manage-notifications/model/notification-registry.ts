/**
 * Notification settings registry: Entity → Stage → Task → rules.
 * Mirrors automation structure so the left nav reads like a nomenclature.
 */

import {
  describeAutomationNotificationEvent,
  type AutomationNotificationRule,
  type AutomationProcess,
  type AutomationScenario,
  type AutomationTaskTemplate,
} from "@/entities/automation";
import {
  getEntityDisplayName,
  getEntityFieldDisplayName,
  resolveEntityListFieldOptions,
  type Entity,
} from "@/entities/entity";
import {
  createStageChangeNotificationRule,
  type NotificationRule,
} from "@/entities/notification";
import { formatTemplateLabel } from "@/features/manage-automations/lib/template-text";

export type RegistryAutomationRule = {
  rule: AutomationNotificationRule;
  label: string;
};

export type RegistryTask = {
  templateId: string;
  label: string;
  scenarioName: string;
  processName: string;
  entity: Entity;
  template: AutomationTaskTemplate;
  rules: RegistryAutomationRule[];
};

export type RegistryStage = {
  stageKey: string;
  stageName: string;
  /** Process list field used as stage for this entity (may be empty). */
  stageFieldId: string;
  tasks: RegistryTask[];
};

export type RegistryEntity = {
  entityId: string;
  entityName: string;
  entity: Entity;
  /** Process stage/list field id when an automation process exists. */
  stageFieldId: string;
  /** Record-level notification rules (not tied to a task). */
  entityRules: NotificationRule[];
  stages: RegistryStage[];
};

/** Rules that notify about entering / leaving / transitioning this stage. */
export function matchStageNotificationRules(
  rules: readonly NotificationRule[],
  stageFieldId: string,
  stageKey: string,
): NotificationRule[] {
  if (!stageFieldId) return [];
  const anyStage = stageKey === "__any__" || !stageKey.trim();
  return rules.filter((rule) => {
    if (rule.fieldId !== stageFieldId) return false;
    if (
      rule.triggerKind !== "fieldEnter" &&
      rule.triggerKind !== "fieldLeave" &&
      rule.triggerKind !== "fieldTransition"
    ) {
      return false;
    }
    if (anyStage) return true;
    if (rule.triggerKind === "fieldTransition") {
      return !rule.toOptionId || rule.toOptionId === stageKey;
    }
    return !rule.optionId || rule.optionId === stageKey;
  });
}

export function buildStageEnterRule(input: {
  entity: Entity;
  stageFieldId: string;
  stageKey: string;
  stageName: string;
}): NotificationRule {
  const stageField = input.entity.fields.find(
    (field) => field.id === input.stageFieldId,
  );
  return createStageChangeNotificationRule({
    entityId: input.entity.id,
    stageFieldId: input.stageFieldId,
    stageFieldLabel: stageField
      ? getEntityFieldDisplayName(stageField)
      : undefined,
    optionId: input.stageKey === "__any__" ? "" : input.stageKey,
    optionLabel: input.stageKey === "__any__" ? "" : input.stageName,
    triggerKind: "fieldEnter",
  });
}

export function buildAnyStageChangeRule(input: {
  entity: Entity;
  stageFieldId: string;
}): NotificationRule {
  const stageField = input.entity.fields.find(
    (field) => field.id === input.stageFieldId,
  );
  return createStageChangeNotificationRule({
    entityId: input.entity.id,
    stageFieldId: input.stageFieldId,
    stageFieldLabel: stageField
      ? getEntityFieldDisplayName(stageField)
      : undefined,
    triggerKind: "fieldTransition",
  });
}

export function buildNotificationRegistry(options: {
  entities: readonly Entity[];
  processes: readonly AutomationProcess[];
  scenarios: readonly AutomationScenario[];
  templates: readonly AutomationTaskTemplate[];
  automationRules: readonly AutomationNotificationRule[];
  entityRules: readonly NotificationRule[];
}): RegistryEntity[] {
  const {
    entities,
    processes,
    scenarios,
    templates,
    automationRules,
    entityRules,
  } = options;

  const rulesByTemplate = new Map<string, AutomationNotificationRule[]>();
  for (const rule of automationRules) {
    const list = rulesByTemplate.get(rule.templateId) ?? [];
    list.push(rule);
    rulesByTemplate.set(rule.templateId, list);
  }

  const entityRulesByEntity = new Map<string, NotificationRule[]>();
  for (const rule of entityRules) {
    const list = entityRulesByEntity.get(rule.entityId) ?? [];
    list.push(rule);
    entityRulesByEntity.set(rule.entityId, list);
  }

  type StageBucket = {
    stageKey: string;
    stageName: string;
    stageFieldId: string;
    tasks: RegistryTask[];
  };

  const byEntity = new Map<
    string,
    {
      entity: Entity;
      stageFieldId: string;
      stages: Map<string, StageBucket>;
    }
  >();

  for (const template of templates) {
    const scenario = scenarios.find((item) => item.id === template.scenarioId);
    if (!scenario) continue;
    const process = processes.find((item) => item.id === scenario.processId);
    if (!process) continue;
    const entity = entities.find((item) => item.id === process.entityId);
    if (!entity) continue;

    const stageFieldId = process.triggerFieldId.trim();
    const stageField = entity.fields.find((field) => field.id === stageFieldId);
    const stageOptions = stageField
      ? resolveEntityListFieldOptions(stageField, entities)
      : [];
    const stageKey = template.triggerOptionId.trim() || "__any__";
    const stageName =
      stageOptions.find((option) => option.id === template.triggerOptionId)
        ?.name ?? (stageKey === "__any__" ? "Без стадии" : "Стадия");

    let entityBucket = byEntity.get(entity.id);
    if (!entityBucket) {
      entityBucket = { entity, stageFieldId, stages: new Map() };
      byEntity.set(entity.id, entityBucket);
    } else if (!entityBucket.stageFieldId && stageFieldId) {
      entityBucket.stageFieldId = stageFieldId;
    }

    let stageBucket = entityBucket.stages.get(stageKey);
    if (!stageBucket) {
      stageBucket = { stageKey, stageName, stageFieldId, tasks: [] };
      entityBucket.stages.set(stageKey, stageBucket);
    }

    const templateRules = rulesByTemplate.get(template.id) ?? [];
    stageBucket.tasks.push({
      templateId: template.id,
      label: formatTemplateLabel(template.name, entity.fields),
      scenarioName: scenario.name.trim() || "Сценарий",
      processName: process.name.trim() || "Процесс",
      entity,
      template,
      rules: templateRules.map((rule) => ({
        rule,
        label: describeAutomationNotificationEvent(rule.event),
      })),
    });
  }

  // Entities that only have record-level rules (no automation tasks yet).
  for (const [entityId, rules] of entityRulesByEntity) {
    if (byEntity.has(entityId)) continue;
    const entity = entities.find((item) => item.id === entityId);
    if (!entity) continue;
    const process = processes.find(
      (item) => item.entityId === entityId && item.triggerFieldId.trim(),
    );
    byEntity.set(entityId, {
      entity,
      stageFieldId: process?.triggerFieldId.trim() ?? "",
      stages: new Map(),
    });
    void rules;
  }

  // Ensure process stage field is known even when templates are missing.
  for (const process of processes) {
    const entityId = process.entityId;
    const stageFieldId = process.triggerFieldId.trim();
    if (!stageFieldId) continue;
    const bucket = byEntity.get(entityId);
    if (bucket && !bucket.stageFieldId) bucket.stageFieldId = stageFieldId;
  }

  const result: RegistryEntity[] = [];
  for (const [entityId, bucket] of byEntity) {
    const stages = [...bucket.stages.values()]
      .map((stage) => ({
        stageKey: stage.stageKey,
        stageName: stage.stageName,
        stageFieldId: stage.stageFieldId || bucket.stageFieldId,
        tasks: stage.tasks
          .slice()
          .sort((a, b) => a.label.localeCompare(b.label, "ru")),
      }))
      .sort((a, b) => a.stageName.localeCompare(b.stageName, "ru"));

    result.push({
      entityId,
      entityName: getEntityDisplayName(bucket.entity),
      entity: bucket.entity,
      stageFieldId: bucket.stageFieldId,
      entityRules: (entityRulesByEntity.get(entityId) ?? [])
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name, "ru")),
      stages,
    });
  }

  return result.sort((a, b) => a.entityName.localeCompare(b.entityName, "ru"));
}

export function countRegistryNotifications(entity: RegistryEntity): number {
  let count = entity.entityRules.length;
  for (const stage of entity.stages) {
    for (const task of stage.tasks) {
      count += task.rules.length;
    }
  }
  return count;
}
