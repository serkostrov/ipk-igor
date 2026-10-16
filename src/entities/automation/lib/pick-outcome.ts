import {
  matchAutomationConditions,
  type AutomationConditionEvalContext,
} from "./evaluate-conditions";
import type { AutomationOutcome } from "../model/types";

/**
 * Resolve which outcome to apply.
 * - If `preferredId` matches an outcome → use it (user clicked a button).
 * - Else → first outcome whose `conditions` match (empty rules = always).
 */
export function pickAutomationOutcome(
  outcomes: AutomationOutcome[],
  ctx: AutomationConditionEvalContext,
  preferredId?: string | null,
): AutomationOutcome | null {
  if (outcomes.length === 0) return null;

  const preferred = preferredId?.trim()
    ? (outcomes.find((item) => item.id === preferredId) ?? null)
    : null;
  if (preferred) return preferred;

  for (const outcome of outcomes) {
    if (matchAutomationConditions(outcome.conditions, ctx)) {
      return outcome;
    }
  }

  return outcomes[outcomes.length - 1] ?? null;
}
