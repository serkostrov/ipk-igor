/**
 * Soft keys + list-field resolution for «отправить цену ТКП на согласование».
 * Approval chain itself is automation (decision tasks / stage transitions).
 */

import {
  getEntityFieldDisplayName,
  getEntityFieldListOptions,
  parseEntityListValueIds,
  type Entity,
  type EntityField,
} from "@/entities/entity";

/** Soft: which price revision was submitted for approval. */
export const TKP_APPROVAL_REVISION_KEY = "__tkp_approval_revision_id__";
/** Soft: ISO timestamp of last approval submit. */
export const TKP_APPROVAL_SUBMITTED_AT_KEY = "__tkp_approval_submitted_at__";

const APPROVAL_FIELD_NAMES = [
  "Согласование ТКП",
  "Согласование цены",
  "Статус согласования ТКП",
  "Статус согласования",
  "Согласование документа ТКП",
] as const;

const PENDING_OPTION_NAMES = [
  "На согласовании",
  "Отправлено на согласование",
  "Согласование",
  "На согласовании ТКП",
] as const;

function normalizeName(value: string): string {
  return value.trim().toLocaleLowerCase("ru").replaceAll("ё", "е");
}

function nameMatches(value: string, keys: readonly string[]): boolean {
  const name = normalizeName(value);
  return keys.some((key) => {
    const needle = normalizeName(key);
    return name === needle || name.includes(needle);
  });
}

/** List field that drives the TKP document approval process (if configured). */
export function findTkpApprovalListField(entity: Entity): EntityField | null {
  return (
    entity.fields.find(
      (field) =>
        field.type === "list" &&
        nameMatches(getEntityFieldDisplayName(field), APPROVAL_FIELD_NAMES),
    ) ?? null
  );
}

/**
 * Option id for «На согласовании» on the approval list field.
 * Returns null when the field/option is not configured.
 */
export function resolveTkpApprovalPendingOptionId(
  field: EntityField,
  entities: readonly Entity[] = [],
): string | null {
  const options = getEntityFieldListOptions(field, entities);
  const match = options.find((option) =>
    nameMatches(option.name, PENDING_OPTION_NAMES),
  );
  return match?.id ?? null;
}

export function readTkpApprovalState(values: Record<string, string>): {
  revisionId: string | null;
  submittedAt: string | null;
} {
  const revisionId = values[TKP_APPROVAL_REVISION_KEY]?.trim() || null;
  const submittedAt = values[TKP_APPROVAL_SUBMITTED_AT_KEY]?.trim() || null;
  return { revisionId, submittedAt };
}

/**
 * List field is currently «На согласовании» (approval chain in progress).
 * Soft submit keys alone are not enough — status can move on without clearing them.
 */
export function isTkpApprovalInProgress(options: {
  entity: Entity;
  values: Record<string, string | undefined>;
  entities?: readonly Entity[];
}): boolean {
  const field = findTkpApprovalListField(options.entity);
  if (!field) return false;
  const pendingOptionId = resolveTkpApprovalPendingOptionId(
    field,
    options.entities ?? [],
  );
  if (!pendingOptionId) return false;
  const currentId =
    parseEntityListValueIds(options.values[field.id] ?? "")[0]?.trim() ?? "";
  return currentId === pendingOptionId;
}

/** Whether the host has a list field + «На согласовании» option for the chain. */
export function resolveTkpApprovalChainReady(
  entity: Entity,
  entities: readonly Entity[] = [],
): {
  ready: boolean;
  fieldName: string | null;
} {
  const field = findTkpApprovalListField(entity);
  if (!field) return { ready: false, fieldName: null };
  const optionId = resolveTkpApprovalPendingOptionId(field, entities);
  return {
    ready: optionId != null,
    fieldName:
      getEntityFieldDisplayName(field).trim() || field.name.trim() || null,
  };
}

export function writeTkpApprovalSubmittedPatch(input: {
  entity: Entity;
  entities: readonly Entity[];
  values: Record<string, string>;
  revisionId: string;
  submittedAt?: string;
}): Record<string, string> {
  const submittedAt = input.submittedAt ?? new Date().toISOString();
  const next: Record<string, string> = {
    ...input.values,
    [TKP_APPROVAL_REVISION_KEY]: input.revisionId,
    [TKP_APPROVAL_SUBMITTED_AT_KEY]: submittedAt,
  };

  const field = findTkpApprovalListField(input.entity);
  if (field) {
    const optionId = resolveTkpApprovalPendingOptionId(field, input.entities);
    if (optionId) {
      next[field.id] = optionId;
    }
  }

  return next;
}

/** Soft keys that keep «Цена ТКП» locked after send / cancel. */
export function buildTkpApprovalClearedPatch(): Record<string, string> {
  return {
    [TKP_APPROVAL_REVISION_KEY]: "",
    [TKP_APPROVAL_SUBMITTED_AT_KEY]: "",
  };
}

/** Process trigger list on Разбор ТКП («Статус» / «Стадия»). */
export function findTkpStatusField(entity: Entity): EntityField | null {
  return (
    entity.fields.find((field) => {
      if (field.type !== "list") return false;
      const name = normalizeName(getEntityFieldDisplayName(field));
      return name === "статус" || name === "стадия";
    }) ?? null
  );
}

function resolveTkpStatusOptionId(
  field: EntityField,
  entities: readonly Entity[],
  matchers: readonly ((name: string) => boolean)[],
): string | null {
  const options = getEntityFieldListOptions(field, entities);
  for (const match of matchers) {
    const hit = options.find((option) => match(normalizeName(option.name)));
    if (hit) return hit.id;
  }
  return null;
}

/** First approval-chain stage (ГИП). */
export function resolveTkpApproveGipStatusOptionId(
  entity: Entity,
  entities: readonly Entity[] = [],
): { fieldId: string; optionId: string } | null {
  const field = findTkpStatusField(entity);
  if (!field) return null;
  const optionId = resolveTkpStatusOptionId(field, entities, [
    (name) =>
      name.includes("согласован") &&
      name.includes("гип") &&
      !name.includes("заказчик"),
    (name) => name.includes("на согласован") && name.includes("гип"),
  ]);
  return optionId ? { fieldId: field.id, optionId } : null;
}

/** Terminal «Отправлено» status after send-to-customer. */
export function resolveTkpSentStatusOptionId(
  entity: Entity,
  entities: readonly Entity[] = [],
): { fieldId: string; optionId: string } | null {
  const field = findTkpStatusField(entity);
  if (!field) return null;
  const optionId = resolveTkpStatusOptionId(field, entities, [
    (name) => name === "отправлено" || name.includes("ткп отправл"),
    (name) => name.includes("отправл") && !name.includes("согласован"),
  ]);
  return optionId ? { fieldId: field.id, optionId } : null;
}
