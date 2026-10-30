/**
 * Soft keys + list-field resolution for «отправить цену ТКП на согласование».
 * Approval chain itself is automation (decision tasks / stage transitions).
 */

import {
  getEntityFieldDisplayName,
  getEntityFieldListOptions,
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
