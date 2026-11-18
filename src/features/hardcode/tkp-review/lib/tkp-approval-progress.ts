/**
 * Soft progress for TKP approval chain GIP → commercial head → general director.
 * Automation decision tasks advance these keys; send-to-customer reads them.
 */

export const TKP_APPROVAL_STEP_KEY = "__tkp_approval_step__";
export const TKP_APPROVAL_RETURN_TO_STEP_KEY =
  "__tkp_approval_return_to_step__";
export const TKP_APPROVAL_HISTORY_KEY = "__tkp_approval_history__";

export type TkpApprovalStep = "gip" | "commercial" | "director" | "done";

export type TkpApprovalHistoryEntry = {
  id: string;
  step: TkpApprovalStep;
  decision: "approve" | "return";
  actorUserId?: string | null;
  comment?: string;
  at: string;
  revisionId: string;
};

const STEP_ORDER: TkpApprovalStep[] = ["gip", "commercial", "director", "done"];

export function parseTkpApprovalStep(
  values: Record<string, string | undefined>,
): TkpApprovalStep {
  const raw = (values[TKP_APPROVAL_STEP_KEY] ?? "").trim();
  if (
    raw === "gip" ||
    raw === "commercial" ||
    raw === "director" ||
    raw === "done"
  ) {
    return raw;
  }
  return "gip";
}

export function parseTkpApprovalReturnToStep(
  values: Record<string, string | undefined>,
): TkpApprovalStep | null {
  const raw = (values[TKP_APPROVAL_RETURN_TO_STEP_KEY] ?? "").trim();
  if (raw === "gip" || raw === "commercial" || raw === "director") return raw;
  return null;
}

export function isTkpFullyApproved(
  values: Record<string, string | undefined>,
): boolean {
  return parseTkpApprovalStep(values) === "done";
}

export function nextTkpApprovalStep(step: TkpApprovalStep): TkpApprovalStep {
  const index = STEP_ORDER.indexOf(step);
  if (index < 0 || index >= STEP_ORDER.length - 1) return "done";
  return STEP_ORDER[index + 1]!;
}

export function parseTkpApprovalHistory(
  values: Record<string, string | undefined>,
): TkpApprovalHistoryEntry[] {
  const raw = values[TKP_APPROVAL_HISTORY_KEY]?.trim() ?? "";
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is TkpApprovalHistoryEntry =>
        Boolean(item) &&
        typeof item === "object" &&
        typeof (item as TkpApprovalHistoryEntry).id === "string",
    );
  } catch {
    return [];
  }
}

export function buildTkpApprovalApprovePatch(options: {
  values: Record<string, string | undefined>;
  step: TkpApprovalStep;
  revisionId: string;
  actorUserId?: string | null;
  comment?: string;
}): Record<string, string> {
  const history = parseTkpApprovalHistory(options.values);
  const entry: TkpApprovalHistoryEntry = {
    id: crypto.randomUUID(),
    step: options.step,
    decision: "approve",
    actorUserId: options.actorUserId ?? null,
    comment: options.comment,
    at: new Date().toISOString(),
    revisionId: options.revisionId,
  };
  const nextStep = nextTkpApprovalStep(options.step);
  return {
    [TKP_APPROVAL_STEP_KEY]: nextStep,
    [TKP_APPROVAL_RETURN_TO_STEP_KEY]: "",
    [TKP_APPROVAL_HISTORY_KEY]: JSON.stringify([...history, entry]),
  };
}

export function buildTkpApprovalReturnPatch(options: {
  values: Record<string, string | undefined>;
  step: TkpApprovalStep;
  revisionId: string;
  actorUserId?: string | null;
  comment: string;
}): Record<string, string> {
  const comment = options.comment.trim();
  if (!comment) {
    throw new Error("Укажите причину возврата менеджеру");
  }
  const history = parseTkpApprovalHistory(options.values);
  const entry: TkpApprovalHistoryEntry = {
    id: crypto.randomUUID(),
    step: options.step,
    decision: "return",
    actorUserId: options.actorUserId ?? null,
    comment,
    at: new Date().toISOString(),
    revisionId: options.revisionId,
  };
  return {
    // New version returns to the same approver (ТЗ §8).
    [TKP_APPROVAL_STEP_KEY]: options.step,
    [TKP_APPROVAL_RETURN_TO_STEP_KEY]: options.step,
    [TKP_APPROVAL_HISTORY_KEY]: JSON.stringify([...history, entry]),
  };
}

/**
 * When manager submits a new document version after return — jump to the
 * returner step (skip already approved).
 */
export function buildTkpApprovalResubmitPatch(options: {
  values: Record<string, string | undefined>;
  revisionId: string;
}): Record<string, string> {
  const returnTo = parseTkpApprovalReturnToStep(options.values) ?? "gip";
  return {
    [TKP_APPROVAL_STEP_KEY]: returnTo,
    [TKP_APPROVAL_RETURN_TO_STEP_KEY]: "",
  };
}
