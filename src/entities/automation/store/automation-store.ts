import { isSupabaseConfigured } from "@/shared/api/supabase";
import {
  deleteAutomationNotificationRule,
  deleteAutomationProcess,
  deleteAutomationScenario,
  deleteAutomationTemplate,
  fetchAutomationConfig,
  upsertAutomationNotificationRule,
  upsertAutomationProcess,
  upsertAutomationScenario,
  upsertAutomationTemplate,
} from "../api/automation-config-api";
import { purgeFieldFromAutomationConfig } from "../lib/purge-field-from-config";
import {
  emptyAutomationConfig,
  normalizeAutomationTaskTemplate,
  type AutomationConfig,
  type AutomationNotificationRule,
  type AutomationProcess,
  type AutomationScenario,
  type AutomationTaskTemplate,
} from "../model/types";

export type AutomationStatus = "idle" | "loading" | "ready" | "error";

type Listener = () => void;

let config: AutomationConfig = emptyAutomationConfig();
let status: AutomationStatus = "idle";
let errorMessage: string | null = null;
let initPromise: Promise<void> | null = null;

const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((listener) => listener());
}

function setStatus(next: AutomationStatus, message: string | null = null) {
  status = next;
  errorMessage = message;
  notify();
}

export function getAutomationConfig() {
  return config;
}

export function getAutomationStatus() {
  return status;
}

export function getAutomationError() {
  return errorMessage;
}

export function subscribeAutomationConfig(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function initAutomationConfig() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    setStatus("loading");
    try {
      config = await fetchAutomationConfig();
      setStatus("ready");
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "Не удалось загрузить автоматизации";
      console.error("[automation] load failed", error);
      config = emptyAutomationConfig();
      setStatus("error", message);
    }
  })();
  return initPromise;
}

export async function reloadAutomationConfig() {
  initPromise = null;
  return initAutomationConfig();
}

function replaceConfig(next: AutomationConfig) {
  config = next;
  notify();
}

export async function saveProcess(process: AutomationProcess) {
  const exists = config.processes.some((item) => item.id === process.id);
  replaceConfig({
    ...config,
    processes: exists
      ? config.processes.map((item) =>
          item.id === process.id ? process : item,
        )
      : [...config.processes, process],
  });
  if (!isSupabaseConfigured) return;
  await upsertAutomationProcess(process);
}

export async function removeProcess(processId: string) {
  replaceConfig({
    processes: config.processes.filter((item) => item.id !== processId),
    scenarios: config.scenarios.filter((item) => item.processId !== processId),
    templates: config.templates.filter((template) => {
      const scenario = config.scenarios.find(
        (item) => item.id === template.scenarioId,
      );
      return scenario?.processId !== processId;
    }),
    notificationRules: config.notificationRules.filter((rule) => {
      const template = config.templates.find(
        (item) => item.id === rule.templateId,
      );
      if (!template) return true;
      const scenario = config.scenarios.find(
        (item) => item.id === template.scenarioId,
      );
      return scenario?.processId !== processId;
    }),
  });
  if (!isSupabaseConfigured) return;
  await deleteAutomationProcess(processId);
}

export async function saveScenario(scenario: AutomationScenario) {
  const exists = config.scenarios.some((item) => item.id === scenario.id);
  replaceConfig({
    ...config,
    scenarios: exists
      ? config.scenarios.map((item) =>
          item.id === scenario.id ? scenario : item,
        )
      : [...config.scenarios, scenario],
  });
  if (!isSupabaseConfigured) return;
  await upsertAutomationScenario(scenario);
}

export async function removeScenario(scenarioId: string) {
  const removedTemplateIds = new Set(
    config.templates
      .filter((item) => item.scenarioId === scenarioId)
      .map((item) => item.id),
  );
  replaceConfig({
    ...config,
    scenarios: config.scenarios.filter((item) => item.id !== scenarioId),
    templates: config.templates.filter(
      (item) => item.scenarioId !== scenarioId,
    ),
    notificationRules: config.notificationRules.filter(
      (item) => !removedTemplateIds.has(item.templateId),
    ),
  });
  if (!isSupabaseConfigured) return;
  await deleteAutomationScenario(scenarioId);
}

export async function saveTemplate(template: AutomationTaskTemplate) {
  const normalized = normalizeAutomationTaskTemplate(template);
  if (!normalized) {
    throw new Error("Некорректный шаблон задачи");
  }
  const exists = config.templates.some((item) => item.id === normalized.id);
  replaceConfig({
    ...config,
    templates: exists
      ? config.templates.map((item) =>
          item.id === normalized.id ? normalized : item,
        )
      : [...config.templates, normalized],
  });
  if (!isSupabaseConfigured) return;
  await upsertAutomationTemplate(normalized);
}

export async function removeTemplate(templateId: string) {
  replaceConfig({
    ...config,
    templates: config.templates.filter((item) => item.id !== templateId),
    notificationRules: config.notificationRules.filter(
      (item) => item.templateId !== templateId,
    ),
  });
  if (!isSupabaseConfigured) return;
  await deleteAutomationTemplate(templateId);
}

export async function saveNotificationRule(rule: AutomationNotificationRule) {
  const exists = config.notificationRules.some((item) => item.id === rule.id);
  replaceConfig({
    ...config,
    notificationRules: exists
      ? config.notificationRules.map((item) =>
          item.id === rule.id ? rule : item,
        )
      : [...config.notificationRules, rule],
  });
  if (!isSupabaseConfigured) return;
  await upsertAutomationNotificationRule(rule);
}

export async function removeNotificationRule(ruleId: string) {
  replaceConfig({
    ...config,
    notificationRules: config.notificationRules.filter(
      (item) => item.id !== ruleId,
    ),
  });
  if (!isSupabaseConfigured) return;
  await deleteAutomationNotificationRule(ruleId);
}

/**
 * Drop every reference to a deleted entity field from automation config
 * and persist changed rows. Safe to call when automation config is not loaded.
 */
export async function purgeFieldFromAutomations(
  entityId: string,
  fieldId: string,
): Promise<void> {
  if (!entityId.trim() || !fieldId.trim()) return;
  if (status !== "ready" && status !== "error") {
    // Config may still be loading — apply after init if possible.
    try {
      await initAutomationConfig();
    } catch {
      return;
    }
  }

  const result = purgeFieldFromAutomationConfig(config, entityId, fieldId);
  const {
    changedProcessIds,
    changedScenarioIds,
    changedTemplateIds,
    changedRuleIds,
  } = result;
  if (
    changedProcessIds.length === 0 &&
    changedScenarioIds.length === 0 &&
    changedTemplateIds.length === 0 &&
    changedRuleIds.length === 0
  ) {
    return;
  }

  replaceConfig(result.config);

  if (!isSupabaseConfigured) return;

  const processById = new Map(
    result.config.processes.map((item) => [item.id, item]),
  );
  const scenarioById = new Map(
    result.config.scenarios.map((item) => [item.id, item]),
  );
  const templateById = new Map(
    result.config.templates.map((item) => [item.id, item]),
  );
  const ruleById = new Map(
    result.config.notificationRules.map((item) => [item.id, item]),
  );

  await Promise.all([
    ...changedProcessIds.map((id) => {
      const process = processById.get(id);
      return process ? upsertAutomationProcess(process) : Promise.resolve();
    }),
    ...changedScenarioIds.map((id) => {
      const scenario = scenarioById.get(id);
      return scenario ? upsertAutomationScenario(scenario) : Promise.resolve();
    }),
    ...changedTemplateIds.map((id) => {
      const template = templateById.get(id);
      return template ? upsertAutomationTemplate(template) : Promise.resolve();
    }),
    ...changedRuleIds.map((id) => {
      const rule = ruleById.get(id);
      return rule ? upsertAutomationNotificationRule(rule) : Promise.resolve();
    }),
  ]);
}
