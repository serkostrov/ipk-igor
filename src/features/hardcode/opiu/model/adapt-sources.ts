import {
  getEntityListOption,
  getRecordFieldNumber,
  isEntityNameField,
  isEntityNumericFieldType,
  parseEntityDecimal,
  parseEntityListValueIds,
  parseEntityRelationIds,
  parseEntityTableParentId,
  resolveEntityListFieldOptions,
  resolveEntityTableParentField,
  resolveRelationRecordLabel,
  type Entity,
  type EntityField,
  type EntityRecord,
  type EntityValueContext,
} from "@/entities/entity";
import { resolveOpiuSourceEntities } from "../match";
import type {
  ProfitLossActSource,
  ProfitLossCashflowSource,
  ProfitLossCategorySource,
} from "./types";

function normalizeName(value: string): string {
  return value.trim().toLocaleLowerCase("ru");
}

function fieldMatches(
  field: Pick<EntityField, "name">,
  labels: readonly string[],
): boolean {
  const name = normalizeName(field.name);
  return labels.some((label) => normalizeName(label) === name);
}

function findField(
  entity: Entity,
  labels: readonly string[],
  predicate?: (field: EntityField) => boolean,
): EntityField | null {
  return (
    entity.fields.find((field) => {
      if (predicate && !predicate(field)) return false;
      return fieldMatches(field, labels);
    }) ?? null
  );
}

function extractDatePart(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(trimmed.replace(" ", "T"));
  return match?.[1] ?? "";
}

function readNumber(
  ctx: EntityValueContext,
  entity: Entity,
  record: EntityRecord,
  field: EntityField | null,
): number | null {
  if (!field) return null;
  return getRecordFieldNumber(ctx, entity, record, field);
}

const ACT_DATE_NAMES = ["Дата акта", "Дата"] as const;
const ACT_WITHOUT_VAT_NAMES = [
  "Без НДС",
  "Сумма без НДС",
  "Сумма без ндс",
] as const;
const ACT_WITH_VAT_NAMES = ["С НДС", "Сумма с НДС", "Сумма"] as const;
const ACT_VAT_NAMES = ["НДС", "Сумма НДС"] as const;

const DDS_DATE_NAMES = ["Дата"] as const;
const DDS_DIRECTION_NAMES = ["Движение", "Вид движения"] as const;
const DDS_ARTICLE_NAMES = ["Статья", "Статья ДДС"] as const;
const DDS_WITHOUT_VAT_NAMES = ["Без НДС", "Сумма без НДС"] as const;
const DDS_WITH_VAT_NAMES = ["С НДС", "Сумма с НДС", "Сумма"] as const;
const DDS_RBP_NAMES = ["Месяцы РБП", "РБП", "РБП месяцы"] as const;

export function adaptActsToSources(
  ctx: EntityValueContext,
  actsEntity: Entity | null,
): ProfitLossActSource[] {
  if (!actsEntity) return [];
  const dateField = findField(
    actsEntity,
    ACT_DATE_NAMES,
    (field) => field.type === "datetime",
  );
  const withoutVatField = findField(
    actsEntity,
    ACT_WITHOUT_VAT_NAMES,
    (field) => isEntityNumericFieldType(field.type),
  );
  const withVatField = findField(actsEntity, ACT_WITH_VAT_NAMES, (field) =>
    isEntityNumericFieldType(field.type),
  );
  const vatField = findField(actsEntity, ACT_VAT_NAMES, (field) =>
    isEntityNumericFieldType(field.type),
  );
  if (!dateField) return [];

  const out: ProfitLossActSource[] = [];
  for (const record of actsEntity.records) {
    const actDate = extractDatePart(record.values[dateField.id] ?? "");
    if (!actDate) continue;
    const withoutVat = readNumber(ctx, actsEntity, record, withoutVatField);
    if (withoutVat != null && Number.isFinite(withoutVat)) {
      out.push({ act_date: actDate, amount_without_vat: withoutVat });
      continue;
    }
    const withVat = readNumber(ctx, actsEntity, record, withVatField) ?? 0;
    const vat = readNumber(ctx, actsEntity, record, vatField) ?? 0;
    const amount = withVat - vat;
    if (!Number.isFinite(amount) || amount === 0) continue;
    out.push({ act_date: actDate, amount_without_vat: amount });
  }
  return out;
}

export function adaptArticlesToCategories(
  articlesEntity: Entity | null,
): ProfitLossCategorySource[] {
  if (!articlesEntity) return [];
  const nameField =
    articlesEntity.fields.find((field) => isEntityNameField(field)) ?? null;
  const parentField = resolveEntityTableParentField(articlesEntity);

  return articlesEntity.records.map((record) => {
    const name =
      (nameField
        ? resolveRelationRecordLabel(articlesEntity, record.id)
        : null) ||
      (nameField ? (record.values[nameField.id] ?? "").trim() : "") ||
      "Без названия";
    const parentRaw = parentField ? (record.values[parentField.id] ?? "") : "";
    const parentId = parentField
      ? parseEntityTableParentId(parentRaw) || null
      : null;
    return {
      id: record.id,
      name,
      parent_id: parentId,
      is_active: true,
    };
  });
}

export function adaptDdsToCashflowSources(
  ctx: EntityValueContext,
  ddsEntity: Entity | null,
): ProfitLossCashflowSource[] {
  if (!ddsEntity) return [];
  const dateField = findField(
    ddsEntity,
    DDS_DATE_NAMES,
    (field) => field.type === "datetime",
  );
  const directionField = findField(
    ddsEntity,
    DDS_DIRECTION_NAMES,
    (field) => field.type === "list",
  );
  const articleField =
    findField(
      ddsEntity,
      DDS_ARTICLE_NAMES,
      (field) => field.type === "relation" || field.type === "belonging",
    ) ??
    ddsEntity.fields.find(
      (field) =>
        (field.type === "relation" || field.type === "belonging") &&
        normalizeName(field.name).includes("стат"),
    ) ??
    null;
  const withoutVatField = findField(ddsEntity, DDS_WITHOUT_VAT_NAMES, (field) =>
    isEntityNumericFieldType(field.type),
  );
  const withVatField = findField(ddsEntity, DDS_WITH_VAT_NAMES, (field) =>
    isEntityNumericFieldType(field.type),
  );
  const rbpField = findField(ddsEntity, DDS_RBP_NAMES, (field) =>
    isEntityNumericFieldType(field.type),
  );
  if (!dateField || !directionField || !articleField) return [];

  const directionOptions = resolveEntityListFieldOptions(
    directionField,
    ctx.entities,
  );

  const out: ProfitLossCashflowSource[] = [];
  for (const record of ddsEntity.records) {
    const entryDate = extractDatePart(record.values[dateField.id] ?? "");
    if (!entryDate) continue;

    const directionId =
      parseEntityListValueIds(record.values[directionField.id] ?? "")[0] ?? "";
    const directionOption = getEntityListOption(directionOptions, directionId);
    const movement = directionOption?.name?.trim() || directionId;
    if (!movement) continue;

    const categoryId =
      parseEntityRelationIds(record.values[articleField.id] ?? "")[0]?.trim() ||
      null;

    const withoutVat = readNumber(ctx, ddsEntity, record, withoutVatField);
    const withVat = readNumber(ctx, ddsEntity, record, withVatField);
    const amount =
      withoutVat != null && Number.isFinite(withoutVat)
        ? withoutVat
        : withVat != null && Number.isFinite(withVat)
          ? withVat
          : 0;
    if (!Number.isFinite(amount) || amount === 0) continue;

    const rbpRaw = rbpField
      ? parseEntityDecimal(record.values[rbpField.id] ?? "")
      : Number.NaN;
    const rbpMonths =
      Number.isFinite(rbpRaw) && rbpRaw > 0 ? Math.round(rbpRaw) : null;

    out.push({
      entry_date: entryDate,
      category_id: categoryId,
      movement,
      amount,
      rbp_months: rbpMonths,
    });
  }
  return out;
}

export function adaptOpiuSourcesFromEntities(
  ctx: EntityValueContext,
  entities: readonly Entity[],
) {
  const sources = resolveOpiuSourceEntities(entities);
  return {
    sources,
    acts: adaptActsToSources(ctx, sources.acts),
    entries: adaptDdsToCashflowSources(ctx, sources.dds),
    categories: adaptArticlesToCategories(sources.articles),
  };
}
