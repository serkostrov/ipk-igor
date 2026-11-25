import { getAutomationConfig } from "../store/automation-store";
import type { AutomationProcess, AutomationScenario } from "../model/types";
import { matchAutomationConditions } from "./evaluate-conditions";

/**
 * Pick the scenario for a process: non-default entry match by priority,
 * otherwise the default scenario.
 */
export function pickScenarioForProcess(
  processId: string,
  values: Record<string, string | undefined>,
  previousValues?: Record<string, string | undefined>,
): AutomationScenario | null {
  const { scenarios } = getAutomationConfig();
  const forProcess = scenarios.filter((item) => item.processId === processId);
  const matched = forProcess
    .filter((item) => !item.isDefault && item.entryConditions.rules.length > 0)
    .filter((item) =>
      matchAutomationConditions(item.entryConditions, {
        values,
        previousValues,
      }),
    )
    .sort((a, b) => b.priority - a.priority)[0];
  return matched ?? forProcess.find((item) => item.isDefault) ?? null;
}

export type ProcessScenarioGate = {
  process: AutomationProcess;
  scenario: AutomationScenario;
};

/**
 * Resolve which process+scenario gates stage moves for a trigger list field.
 *
 * When several enabled processes share the same entity/trigger (legacy
 * duplicates), prefer the scenario that actually defines `stageTransitions`
 * so folder/file gates are not skipped by an empty twin process.
 */
export function resolveProcessScenarioForStageGate(input: {
  entityId: string;
  triggerFieldId: string;
  values: Record<string, string | undefined>;
  previousValues?: Record<string, string | undefined>;
}): ProcessScenarioGate | null {
  const { processes } = getAutomationConfig();
  const matched = processes.filter(
    (item) =>
      item.enabled &&
      item.entityId === input.entityId &&
      item.triggerFieldId === input.triggerFieldId,
  );
  if (matched.length === 0) return null;

  const gates: ProcessScenarioGate[] = [];
  for (const process of matched) {
    const scenario = pickScenarioForProcess(
      process.id,
      input.values,
      input.previousValues,
    );
    if (!scenario) continue;
    gates.push({ process, scenario });
  }
  if (gates.length === 0) return null;

  const withTransitions = gates.find(
    (item) => item.scenario.stageTransitions.length > 0,
  );
  return withTransitions ?? gates[0]!;
}
