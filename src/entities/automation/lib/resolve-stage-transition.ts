import { matchAutomationConditions } from "./evaluate-conditions";
import type { AutomationStageTransition } from "../model/types";

export type StageTransitionResolution =
  | { kind: "allow"; optionId: string }
  | {
      kind: "redirect";
      optionId: string;
      transition: AutomationStageTransition;
    }
  | { kind: "block"; transition: AutomationStageTransition; message: string };

/**
 * Resolve a requested stage move against configured edge gateways.
 * No matching transition → allow as requested.
 */
export function resolveStageTransition(input: {
  transitions: AutomationStageTransition[];
  fromOptionId: string;
  toOptionId: string;
  values: Record<string, string | undefined>;
  previousValues?: Record<string, string | undefined>;
}): StageTransitionResolution {
  const from = input.fromOptionId.trim();
  const to = input.toOptionId.trim();
  if (!from || !to || from === to) {
    return { kind: "allow", optionId: to };
  }

  const transition = input.transitions.find(
    (item) => item.fromOptionId === from && item.toOptionId === to,
  );
  if (!transition) {
    return { kind: "allow", optionId: to };
  }

  // No rules yet → edge is only a placeholder; don't block.
  if (transition.conditions.rules.length === 0) {
    return { kind: "allow", optionId: to };
  }

  const ok = matchAutomationConditions(transition.conditions, {
    values: input.values,
    previousValues: input.previousValues,
  });
  if (ok) {
    return { kind: "allow", optionId: to };
  }

  const elseId = transition.elseOptionId.trim();
  if (elseId && elseId !== from) {
    return { kind: "redirect", optionId: elseId, transition };
  }

  return {
    kind: "block",
    transition,
    message: "Условия перехода на эту стадию не выполнены",
  };
}

export function findStageTransition(
  transitions: AutomationStageTransition[],
  fromOptionId: string,
  toOptionId: string,
) {
  return (
    transitions.find(
      (item) =>
        item.fromOptionId === fromOptionId && item.toOptionId === toOptionId,
    ) ?? null
  );
}

export function stageTransitionIsConfigured(
  transition: AutomationStageTransition | null | undefined,
) {
  // Any saved transition is active — including unconditional («без условий»).
  return Boolean(transition);
}
