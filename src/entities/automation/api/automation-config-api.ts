import { isSupabaseConfigured, supabase } from "@/shared/api/supabase";
import {
  emptyAutomationConfig,
  normalizeAutomationConfig,
  normalizeAutomationNotificationRule,
  normalizeAutomationProcess,
  normalizeAutomationScenario,
  normalizeAutomationTaskTemplate,
  type AutomationConfig,
  type AutomationNotificationRule,
  type AutomationProcess,
  type AutomationScenario,
  type AutomationTaskTemplate,
} from "../model/types";

function requireClient() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error("Supabase is not configured");
  }
  return supabase;
}

export async function fetchAutomationConfig(): Promise<AutomationConfig> {
  if (!isSupabaseConfigured || !supabase) return emptyAutomationConfig();

  const client = supabase;
  const [processes, scenarios, templates, rules] = await Promise.all([
    client.from("automation_processes").select("*"),
    client.from("automation_scenarios").select("*"),
    client.from("automation_task_templates").select("*"),
    client.from("automation_notification_rules").select("*"),
  ]);

  if (processes.error) throw processes.error;
  if (scenarios.error) throw scenarios.error;
  if (templates.error) throw templates.error;
  if (rules.error) throw rules.error;

  return normalizeAutomationConfig({
    processes: (processes.data ?? []).map(mapProcessRow),
    scenarios: (scenarios.data ?? []).map(mapScenarioRow),
    templates: (templates.data ?? []).map(mapTemplateRow),
    notificationRules: (rules.data ?? []).map(mapRuleRow),
  });
}

function mapProcessRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    entityId: row.entity_id,
    triggerFieldId: row.trigger_field_id,
    triggerKind: row.trigger_kind,
    enabled: row.enabled,
    version: row.version,
  };
}

function mapScenarioRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    processId: row.process_id,
    name: row.name,
    isDefault: row.is_default,
    entryConditions: row.entry_conditions,
    priority: row.priority,
    canvasLayout: row.canvas_layout,
    stageTransitions: row.stage_transitions,
    stageTaskRelease: row.stage_task_release,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapTemplateRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    scenarioId: row.scenario_id,
    name: row.name,
    nameTemplate: row.name_template,
    description: row.description,
    triggerOptionId: row.trigger_option_id,
    stepOrder: row.step_order,
    isBlocking: row.is_blocking,
    enabled: row.enabled !== false,
    kind: row.kind,
    launchPhase: row.launch_phase === "beforeEnter" ? "beforeEnter" : "onEnter",
    launchConditions: row.launch_conditions,
    assignee: row.assignee,
    watchers: row.watchers,
    outcomes: row.outcomes,
    sla: row.sla,
    materials: row.materials,
    fieldAccess: row.field_access,
    actions: row.actions,
    viewFieldsPlacement: row.view_fields_placement,
  };
}

function mapRuleRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    templateId: row.template_id,
    event: row.event,
    recipients: row.recipients,
    conditions: row.conditions,
    messageTemplate: row.message_template,
  };
}

export async function upsertAutomationProcess(
  process: AutomationProcess,
): Promise<void> {
  const client = requireClient();
  const { error } = await client.from("automation_processes").upsert({
    id: process.id,
    name: process.name,
    description: process.description,
    entity_id: process.entityId,
    trigger_field_id: process.triggerFieldId,
    trigger_kind: process.triggerKind,
    enabled: process.enabled,
    version: process.version,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function deleteAutomationProcess(
  processId: string,
): Promise<void> {
  const client = requireClient();
  const { error } = await client
    .from("automation_processes")
    .delete()
    .eq("id", processId);
  if (error) throw error;
}

export async function upsertAutomationScenario(
  scenario: AutomationScenario,
): Promise<void> {
  const client = requireClient();
  const { error } = await client.from("automation_scenarios").upsert({
    id: scenario.id,
    process_id: scenario.processId,
    name: scenario.name,
    is_default: scenario.isDefault,
    entry_conditions: scenario.entryConditions,
    priority: scenario.priority,
    canvas_layout: scenario.canvasLayout,
    stage_transitions: scenario.stageTransitions,
    stage_task_release: scenario.stageTaskRelease ?? {},
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function deleteAutomationScenario(
  scenarioId: string,
): Promise<void> {
  const client = requireClient();
  const { error } = await client
    .from("automation_scenarios")
    .delete()
    .eq("id", scenarioId);
  if (error) throw error;
}

export async function upsertAutomationTemplate(
  template: AutomationTaskTemplate,
): Promise<void> {
  const client = requireClient();
  const { error } = await client.from("automation_task_templates").upsert({
    id: template.id,
    scenario_id: template.scenarioId,
    name: template.name,
    name_template: template.nameTemplate,
    description: template.description,
    trigger_option_id: template.triggerOptionId,
    step_order: template.stepOrder,
    is_blocking: template.isBlocking,
    enabled: template.enabled !== false,
    kind: template.kind,
    launch_phase: template.launchPhase ?? "onEnter",
    launch_conditions: template.launchConditions,
    assignee: template.assignee,
    watchers: template.watchers,
    outcomes: template.outcomes,
    sla: template.sla,
    materials: template.materials,
    field_access: template.fieldAccess,
    actions: template.actions ?? [],
    view_fields_placement: template.viewFieldsPlacement ?? "afterSelect",
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function deleteAutomationTemplate(
  templateId: string,
): Promise<void> {
  const client = requireClient();
  const { error } = await client
    .from("automation_task_templates")
    .delete()
    .eq("id", templateId);
  if (error) throw error;
}

export async function upsertAutomationNotificationRule(
  rule: AutomationNotificationRule,
): Promise<void> {
  const client = requireClient();
  const { error } = await client.from("automation_notification_rules").upsert({
    id: rule.id,
    template_id: rule.templateId,
    event: rule.event,
    recipients: rule.recipients,
    conditions: rule.conditions,
    message_template: rule.messageTemplate,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function deleteAutomationNotificationRule(
  ruleId: string,
): Promise<void> {
  const client = requireClient();
  const { error } = await client
    .from("automation_notification_rules")
    .delete()
    .eq("id", ruleId);
  if (error) throw error;
}

/** Replace full config (used for bulk save from builder). */
export async function saveAutomationConfig(
  config: AutomationConfig,
): Promise<void> {
  const normalized = normalizeAutomationConfig(config);
  for (const process of normalized.processes) {
    await upsertAutomationProcess(process);
  }
  for (const scenario of normalized.scenarios) {
    await upsertAutomationScenario(scenario);
  }
  for (const template of normalized.templates) {
    await upsertAutomationTemplate(template);
  }
  for (const rule of normalized.notificationRules) {
    await upsertAutomationNotificationRule(rule);
  }
}

export {
  normalizeAutomationProcess,
  normalizeAutomationScenario,
  normalizeAutomationTaskTemplate,
  normalizeAutomationNotificationRule,
};
