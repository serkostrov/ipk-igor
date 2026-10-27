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
import { resolveFinanceDashboardSources } from "../match";
import type {
  DashboardCashflowEntry,
  DashboardCategory,
  DashboardLegalEntity,
  DashboardPlannedItem,
  DashboardProject,
  DashboardWallet,
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

function recordLabel(entity: Entity, record: EntityRecord): string {
  const nameField = entity.fields.find((field) => isEntityNameField(field));
  if (nameField) {
    const fromRelation = resolveRelationRecordLabel(entity, record.id);
    if (fromRelation?.trim()) return fromRelation.trim();
    const raw = (record.values[nameField.id] ?? "").trim();
    if (raw) return raw;
  }
  return "Без названия";
}

function findRelationField(
  entity: Entity,
  labels: readonly string[],
  softIncludes?: string,
): EntityField | null {
  const byName = findField(
    entity,
    labels,
    (field) => field.type === "relation" || field.type === "belonging",
  );
  if (byName) return byName;
  if (!softIncludes) return null;
  const needle = normalizeName(softIncludes);
  return (
    entity.fields.find(
      (field) =>
        (field.type === "relation" || field.type === "belonging") &&
        normalizeName(field.name).includes(needle),
    ) ?? null
  );
}

const DATE_NAMES = ["Дата"] as const;
const DIRECTION_NAMES = ["Движение", "Вид движения"] as const;
const ARTICLE_NAMES = ["Статья", "Статья ДДС"] as const;
const WALLET_NAMES = ["Кошелёк", "Кошелек"] as const;
const LEGAL_NAMES = ["Юрлицо", "Юр. лицо", "Организация"] as const;
const PROJECT_NAMES = ["Проект"] as const;
const AMOUNT_WITH_VAT = ["С НДС", "Сумма с НДС", "Сумма"] as const;
const AMOUNT_WITHOUT_VAT = ["Без НДС", "Сумма без НДС"] as const;
const STATUS_NAMES = ["Статус"] as const;
const STARTING_BALANCE_NAMES = [
  "Начальный остаток",
  "Остаток",
  "Стартовый остаток",
] as const;
const OVERDRAFT_LIMIT_NAMES = ["Лимит овердрафта", "Овердрафт лимит"] as const;
const FACTORING_LIMIT_NAMES = ["Лимит факторинга", "Факторинг лимит"] as const;
const REMAINING_NAMES = ["Остаток", "К поступлению", "К оплате"] as const;
const INCOME_OPTION_NAMES = ["Приход", "Доход", "Поступление"] as const;
const EXPENSE_OPTION_NAMES = ["Расход", "Выбытие"] as const;

function adaptMovement(optionName: string): "Поступление" | "Выбытие" | null {
  const name = normalizeName(optionName);
  if (INCOME_OPTION_NAMES.some((label) => normalizeName(label) === name)) {
    return "Поступление";
  }
  if (EXPENSE_OPTION_NAMES.some((label) => normalizeName(label) === name)) {
    return "Выбытие";
  }
  if (
    name.includes("поступ") ||
    name.includes("приход") ||
    name.includes("доход")
  ) {
    return "Поступление";
  }
  if (name.includes("выбыт") || name.includes("расход")) {
    return "Выбытие";
  }
  return null;
}

export function adaptCategories(
  articlesEntity: Entity | null,
): DashboardCategory[] {
  if (!articlesEntity) return [];
  const parentField = resolveEntityTableParentField(articlesEntity);
  return articlesEntity.records.map((record) => {
    const parentRaw = parentField ? (record.values[parentField.id] ?? "") : "";
    return {
      id: record.id,
      name: recordLabel(articlesEntity, record),
      parent_id: parentField
        ? parseEntityTableParentId(parentRaw) || null
        : null,
      is_active: true,
      wallet_part: null,
      activity_type: null,
    };
  });
}

export function adaptWallets(
  ctx: EntityValueContext,
  walletsEntity: Entity | null,
): DashboardWallet[] {
  if (!walletsEntity) return [];
  const legalField = findRelationField(walletsEntity, LEGAL_NAMES, "юр");
  const balanceField = findField(
    walletsEntity,
    STARTING_BALANCE_NAMES,
    (field) => isEntityNumericFieldType(field.type),
  );
  const overdraftField = findField(
    walletsEntity,
    OVERDRAFT_LIMIT_NAMES,
    (field) => isEntityNumericFieldType(field.type),
  );
  const factoringField = findField(
    walletsEntity,
    FACTORING_LIMIT_NAMES,
    (field) => isEntityNumericFieldType(field.type),
  );

  return walletsEntity.records.map((record) => ({
    id: record.id,
    name: recordLabel(walletsEntity, record),
    legal_entity_id: legalField
      ? parseEntityRelationIds(record.values[legalField.id] ?? "")[0]?.trim() ||
        null
      : null,
    is_active: true,
    starting_balance: readNumber(ctx, walletsEntity, record, balanceField) ?? 0,
    overdraft_limit:
      readNumber(ctx, walletsEntity, record, overdraftField) ?? 0,
    factoring_limit:
      readNumber(ctx, walletsEntity, record, factoringField) ?? 0,
  }));
}

export function adaptLegalEntities(
  legalEntity: Entity | null,
): DashboardLegalEntity[] {
  if (!legalEntity) return [];
  return legalEntity.records.map((record) => ({
    id: record.id,
    name: recordLabel(legalEntity, record),
  }));
}

export function adaptProjects(
  projectsEntity: Entity | null,
): DashboardProject[] {
  if (!projectsEntity) return [];
  return projectsEntity.records.map((record) => ({
    id: record.id,
    name: recordLabel(projectsEntity, record),
  }));
}

export function adaptDdsEntries(
  ctx: EntityValueContext,
  ddsEntity: Entity | null,
  projectsById: Map<string, string>,
): DashboardCashflowEntry[] {
  if (!ddsEntity) return [];

  const dateField = findField(
    ddsEntity,
    DATE_NAMES,
    (field) => field.type === "datetime",
  );
  const directionField = findField(
    ddsEntity,
    DIRECTION_NAMES,
    (field) => field.type === "list",
  );
  const articleField = findRelationField(ddsEntity, ARTICLE_NAMES, "стат");
  const walletField = findRelationField(ddsEntity, WALLET_NAMES, "кошел");
  const legalField = findRelationField(ddsEntity, LEGAL_NAMES, "юр");
  const projectField = findRelationField(ddsEntity, PROJECT_NAMES, "проект");
  const withoutVatField = findField(ddsEntity, AMOUNT_WITHOUT_VAT, (field) =>
    isEntityNumericFieldType(field.type),
  );
  const withVatField = findField(ddsEntity, AMOUNT_WITH_VAT, (field) =>
    isEntityNumericFieldType(field.type),
  );
  const statusField = findField(
    ddsEntity,
    STATUS_NAMES,
    (field) => field.type === "list",
  );

  if (!dateField || !directionField) return [];

  const directionOptions = resolveEntityListFieldOptions(
    directionField,
    ctx.entities,
  );

  const out: DashboardCashflowEntry[] = [];
  for (const record of ddsEntity.records) {
    const entryDate = extractDatePart(record.values[dateField.id] ?? "");
    if (!entryDate) continue;

    const directionId =
      parseEntityListValueIds(record.values[directionField.id] ?? "")[0] ?? "";
    const directionOption = getEntityListOption(directionOptions, directionId);
    const movement = adaptMovement(
      directionOption?.name?.trim() || directionId,
    );

    const withoutVat = readNumber(ctx, ddsEntity, record, withoutVatField);
    const withVat = readNumber(ctx, ddsEntity, record, withVatField);
    const amount =
      withVat != null && Number.isFinite(withVat)
        ? withVat
        : withoutVat != null && Number.isFinite(withoutVat)
          ? withoutVat
          : 0;
    if (!Number.isFinite(amount) || amount === 0) continue;

    const categoryId = articleField
      ? parseEntityRelationIds(
          record.values[articleField.id] ?? "",
        )[0]?.trim() || null
      : null;
    const walletId = walletField
      ? parseEntityRelationIds(
          record.values[walletField.id] ?? "",
        )[0]?.trim() || null
      : null;
    const legalId = legalField
      ? parseEntityRelationIds(record.values[legalField.id] ?? "")[0]?.trim() ||
        null
      : null;
    const projectId = projectField
      ? parseEntityRelationIds(
          record.values[projectField.id] ?? "",
        )[0]?.trim() || null
      : null;

    // No status field → treat as done; with status → any non-empty value is done
    // (entity statuses rarely mirror is_done flags from ipk-new).
    const isDone = !statusField
      ? true
      : Boolean((record.values[statusField.id] ?? "").trim());

    out.push({
      id: record.id,
      entry_date: entryDate,
      amount: Math.abs(amount),
      legal_entity_id: legalId,
      wallet_id: walletId,
      category_id: categoryId,
      project_id: projectId,
      project_title: projectId ? (projectsById.get(projectId) ?? null) : null,
      movement,
      is_done: isDone,
    });
  }
  return out;
}

function adaptPlannedItems(
  ctx: EntityValueContext,
  entity: Entity | null,
  projectsById: Map<string, string>,
  kind: "receipt" | "outflow",
): DashboardPlannedItem[] {
  if (!entity) return [];
  const dateField = findField(
    entity,
    DATE_NAMES,
    (field) => field.type === "datetime",
  );
  const amountField =
    findField(entity, AMOUNT_WITH_VAT, (field) =>
      isEntityNumericFieldType(field.type),
    ) ??
    findField(entity, AMOUNT_WITHOUT_VAT, (field) =>
      isEntityNumericFieldType(field.type),
    );
  const remainingField = findField(entity, REMAINING_NAMES, (field) =>
    isEntityNumericFieldType(field.type),
  );
  const walletField = findRelationField(entity, WALLET_NAMES, "кошел");
  const legalField = findRelationField(entity, LEGAL_NAMES, "юр");
  const articleField = findRelationField(entity, ARTICLE_NAMES, "стат");
  const projectField = findRelationField(entity, PROJECT_NAMES, "проект");
  if (!dateField || !amountField) return [];

  const out: DashboardPlannedItem[] = [];
  for (const record of entity.records) {
    const entryDate = extractDatePart(record.values[dateField.id] ?? "");
    if (!entryDate) continue;
    const amount = readNumber(ctx, entity, record, amountField) ?? 0;
    if (!Number.isFinite(amount) || amount === 0) continue;
    const remainingRaw = remainingField
      ? parseEntityDecimal(record.values[remainingField.id] ?? "")
      : Number.NaN;
    const remaining =
      Number.isFinite(remainingRaw) && remainingRaw >= 0
        ? remainingRaw
        : Math.abs(amount);
    const projectId = projectField
      ? parseEntityRelationIds(
          record.values[projectField.id] ?? "",
        )[0]?.trim() || null
      : null;
    out.push({
      id: record.id,
      entry_date: entryDate,
      amount: Math.abs(amount),
      remaining: Math.abs(remaining),
      wallet_id: walletField
        ? parseEntityRelationIds(
            record.values[walletField.id] ?? "",
          )[0]?.trim() || null
        : null,
      legal_entity_id: legalField
        ? parseEntityRelationIds(
            record.values[legalField.id] ?? "",
          )[0]?.trim() || null
        : null,
      category_id: articleField
        ? parseEntityRelationIds(
            record.values[articleField.id] ?? "",
          )[0]?.trim() || null
        : null,
      project_id: projectId,
      project_title: projectId ? (projectsById.get(projectId) ?? null) : null,
    });
    void kind;
  }
  return out;
}

export function adaptFinanceDashboardFromEntities(
  ctx: EntityValueContext,
  entities: readonly Entity[],
) {
  const sources = resolveFinanceDashboardSources(entities);
  const projects = adaptProjects(sources.projects);
  const projectsById = new Map(
    projects.map((project) => [project.id, project.name]),
  );

  return {
    sources,
    entries: adaptDdsEntries(ctx, sources.dds, projectsById),
    categories: adaptCategories(sources.articles),
    wallets: adaptWallets(ctx, sources.wallets),
    legalEntities: adaptLegalEntities(sources.legalEntities),
    projects,
    plannedReceipts: adaptPlannedItems(
      ctx,
      sources.plannedReceipts,
      projectsById,
      "receipt",
    ),
    plannedOutflows: adaptPlannedItems(
      ctx,
      sources.plannedOutflows,
      projectsById,
      "outflow",
    ),
  };
}
