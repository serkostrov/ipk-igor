import type {
  DealColumnOverrides,
  DealOverrides,
  DealProfitabilityColumn,
} from "./calculations";

// Type-only imports keep this module runnable by the Node verify script.
const NO_OVERRIDES: DealOverrides = { plan: {}, fact: {} };

/**
 * Service key in the deal's record values holding every hand-entered
 * calculation value as JSON (same pattern as the __tkp_*__ keys). It is not
 * a schema field, so nothing has to be configured.
 */
export const DEAL_OVERRIDES_KEY = "__deal_calc_overrides__";
const OVERRIDE_KEYS: ReadonlySet<string> = new Set<
  keyof DealProfitabilityColumn
>([
  "revenue",
  "labor",
  "supportManager",
  "tkpContractors",
  "projectExpenses",
  "trips",
  "baseCost",
  "fix",
  "externalContractors",
  "retro",
  "contingency",
  "tax",
  "costBeforeBonus",
  "profitBeforeBonus",
  "bonus",
  "finalCost",
  "finalProfit",
  "profitabilityPercent",
]);

function parseColumnOverrides(value: unknown): DealColumnOverrides {
  if (typeof value !== "object" || value === null) return {};
  const out: Record<string, number> = {};
  for (const [key, item] of Object.entries(value)) {
    if (
      OVERRIDE_KEYS.has(key) &&
      typeof item === "number" &&
      Number.isFinite(item)
    ) {
      out[key] = item;
    }
  }
  return out;
}

export function parseDealOverrides(raw: string | undefined): DealOverrides {
  if (!raw?.trim()) return NO_OVERRIDES;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return NO_OVERRIDES;
    }
    const { plan, fact } = parsed as Record<string, unknown>;
    return {
      plan: parseColumnOverrides(plan),
      fact: parseColumnOverrides(fact),
    };
  } catch {
    return NO_OVERRIDES;
  }
}

/** Empty overrides serialize to an empty string (the field is cleared). */
export function serializeDealOverrides(overrides: DealOverrides): string {
  const hasAny =
    Object.keys(overrides.plan).length > 0 ||
    Object.keys(overrides.fact).length > 0;
  return hasAny ? JSON.stringify(overrides) : "";
}
