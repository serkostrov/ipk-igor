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
  resolveEntityListFieldOptions,
  type Entity,
} from "@/entities/entity";
import type { NotificationRule } from "@/entities/notification";
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
  tasks: RegistryTask[];
};

export type RegistryEntity = {
  entityId: string;
  entityName: string;
  entity: Entity;
  /** Record-level notification rules (not tied to a task). */
  entityRules: NotificationRule[];
  stages: RegistryStage[];
};

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
    tasks: RegistryTask[];
  };

  const byEntity = new Map<
    string,
    {
      entity: Entity;
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

    const stageField = entity.fields.find(
      (field) => field.id === process.triggerFieldId,
    );
    const stageOptions = stageField
      ? resolveEntityListFieldOptions(stageField, entities)
      : [];
    const stageKey = template.triggerOptionId.trim() || "__any__";
    const stageName =
      stageOptions.find((option) => option.id === template.triggerOptionId)
        ?.name ?? (stageKey === "__any__" ? "Без стадии" : "Стадия");

    let entityBucket = byEntity.get(entity.id);
    if (!entityBucket) {
      entityBucket = { entity, stages: new Map() };
      byEntity.set(entity.id, entityBucket);
    }

    let stageBucket = entityBucket.stages.get(stageKey);
    if (!stageBucket) {
      stageBucket = { stageKey, stageName, tasks: [] };
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
    byEntity.set(entityId, { entity, stages: new Map() });
    void rules;
  }

  const result: RegistryEntity[] = [];
  for (const [entityId, bucket] of byEntity) {
    const stages = [...bucket.stages.values()]
      .map((stage) => ({
        stageKey: stage.stageKey,
        stageName: stage.stageName,
        tasks: stage.tasks
          .slice()
          .sort((a, b) => a.label.localeCompare(b.label, "ru")),
      }))
      .sort((a, b) => a.stageName.localeCompare(b.stageName, "ru"));

    result.push({
      entityId,
      entityName: getEntityDisplayName(bucket.entity),
      entity: bucket.entity,
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
