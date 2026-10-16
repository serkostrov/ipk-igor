import type {
  AutomationConditionNode,
  AutomationConditionRule,
  AutomationConditions,
} from "../model/conditions";
import { folderHasFiles, folderIsEmpty } from "./folder-files-condition";

export type AutomationConditionEvalContext = {
  /** Current field values of the record under test. */
  values: Record<string, string | undefined>;
  /** Previous values (for fieldChanged / fieldTransition). */
  previousValues?: Record<string, string | undefined>;
};

function parseIds(raw: string | undefined): string[] {
  if (!raw || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === "string");
    }
  } catch {
    // single id or comma-separated
  }
  if (raw.includes(",")) {
    return raw
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [raw.trim()];
}

function asNumber(raw: string | undefined): number | null {
  if (raw == null || raw.trim() === "") return null;
  const n = Number(raw.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function matchRule(
  rule: AutomationConditionRule,
  ctx: AutomationConditionEvalContext,
): boolean {
  const current = ctx.values[rule.fieldId] ?? "";
  const previous = ctx.previousValues?.[rule.fieldId] ?? "";
  const currentIds = parseIds(current);
  const wanted = rule.values ?? (rule.value ? [rule.value] : []);

  switch (rule.operator) {
    case "empty":
      return current.trim() === "" || currentIds.length === 0;
    case "notEmpty":
      return (
        current.trim() !== "" &&
        (currentIds.length > 0 || !current.startsWith("["))
      );
    case "equals":
      return (
        current === (rule.value ?? "") || currentIds.includes(rule.value ?? "")
      );
    case "notEquals":
      return (
        current !== (rule.value ?? "") && !currentIds.includes(rule.value ?? "")
      );
    case "contains":
      return current
        .toLocaleLowerCase("ru")
        .includes((rule.value ?? "").toLocaleLowerCase("ru"));
    case "notContains":
      return !current
        .toLocaleLowerCase("ru")
        .includes((rule.value ?? "").toLocaleLowerCase("ru"));
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      const left = asNumber(current);
      const right = asNumber(rule.value);
      if (left == null || right == null) return false;
      if (rule.operator === "gt") return left > right;
      if (rule.operator === "gte") return left >= right;
      if (rule.operator === "lt") return left < right;
      return left <= right;
    }
    case "in":
      return wanted.some((id) => currentIds.includes(id) || current === id);
    case "notIn":
      return !wanted.some((id) => currentIds.includes(id) || current === id);
    case "includesAny":
      return wanted.some((id) => currentIds.includes(id));
    case "includesAll":
      return wanted.every((id) => currentIds.includes(id));
    case "true":
      return current === "true";
    case "false":
      return current !== "true";
    case "fieldChanged":
      return current !== previous;
    case "fieldTransition": {
      let from: string | undefined;
      let to: string | undefined;
      if (rule.value) {
        try {
          const parsed = JSON.parse(rule.value) as {
            from?: string;
            to?: string;
          };
          from = parsed.from;
          to = parsed.to;
        } catch {
          to = rule.value;
        }
      }
      if (from != null && from !== "" && previous !== from) return false;
      if (
        to != null &&
        to !== "" &&
        current !== to &&
        !currentIds.includes(to)
      ) {
        return false;
      }
      return current !== previous;
    }
    case "folderHasFiles":
      return folderHasFiles(current, rule.value ?? "");
    case "folderEmpty":
      return folderIsEmpty(current, rule.value ?? "");
  }
}

function matchNode(
  node: AutomationConditionNode,
  ctx: AutomationConditionEvalContext,
): boolean {
  if (node.kind === "group") {
    if (node.rules.length === 0) return true;
    return node.match === "any"
      ? node.rules.some((rule) => matchRule(rule, ctx))
      : node.rules.every((rule) => matchRule(rule, ctx));
  }
  return matchRule(node, ctx);
}

/** Empty rules always match (no constraint). */
export function matchAutomationConditions(
  conditions: AutomationConditions | null | undefined,
  ctx: AutomationConditionEvalContext,
): boolean {
  if (!conditions || conditions.rules.length === 0) return true;
  return conditions.match === "any"
    ? conditions.rules.some((node) => matchNode(node, ctx))
    : conditions.rules.every((node) => matchNode(node, ctx));
}
