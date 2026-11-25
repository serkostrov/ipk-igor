import {
  formatRecordFieldValue,
  getEntityRecordTitle,
  getRecordFieldNumber,
  parseEntityDecimal,
  parseEntityRelationIds,
  type Entity,
  type EntityField,
  type EntityRecord,
  type EntityValueContext,
} from "@/entities/entity";
import { findNamedField, findRelationTo, type DealCardSources } from "../match";
import {
  classifyDealExpense,
  resolveRequestAmountWithoutVat,
  sumPresent,
  type DealExpenseCategory,
  type DealManualInputs,
  type DealOverrides,
  type MoneyTriple,
} from "./calculations";
import { readDealManualInputs } from "./manual-fields";
import { DEAL_OVERRIDES_KEY, parseDealOverrides } from "./overrides";
import type { DealScheduleStageInput } from "./payment-schedule";

export type DealCardRow = { id: string; title: string };

export type DealCardDeal = MoneyTriple & {
  vatRate: number | null;
  plannedHours: number | null;
  actualHours: number | null;
  /** Deal number fields feeding the calculation (see `manual-fields.ts`). */
  manual: DealManualInputs;
  /** Hand-entered values of any calculation cell. */
  overrides: DealOverrides;
};

export type DealCardContract = DealCardRow &
  MoneyTriple & { number: string; status: string };

export type DealCardStage = DealCardRow &
  DealScheduleStageInput & { contractId: string | null };

export type DealCardAct = {
  id: string;
  rejected: boolean;
  amountWithoutVat: number | null;
  amountWithVat: number | null;
};

export type DealCardRequest = DealCardRow & {
  status: string;
  paid: boolean;
  articleName: string;
  category: DealExpenseCategory;
  desiredDate: string | null;
  amountWithoutVat: number | null;
  amountWithVat: number | null;
};

export type DealCardReceipt = DealCardRow & {
  date: string | null;
  amountWithVat: number | null;
};

export type DealCardData = {
  deal: DealCardDeal;
  contracts: DealCardContract[];
  stages: DealCardStage[];
  acts: DealCardAct[];
  requests: DealCardRequest[];
  receipts: DealCardReceipt[];
  /** Sum of all linked contracts (stage rollups); `null` without contracts. */
  contractTotals: MoneyTriple | null;
};

export function readNumber(
  ctx: EntityValueContext,
  entity: Entity,
  record: EntityRecord,
  field: EntityField | null,
): number | null {
  if (!field) return null;
  if (field.type === "text") {
    const value = parseEntityDecimal(record.values[field.id] ?? "");
    return Number.isFinite(value) ? value : null;
  }
  return getRecordFieldNumber(ctx, entity, record, field);
}

export function readText(
  ctx: EntityValueContext,
  entity: Entity,
  record: EntityRecord,
  field: EntityField | null,
): string {
  if (!field) return "";
  const value = formatRecordFieldValue(ctx, entity, record, field).trim();
  return value === "—" ? "" : value;
}

export function readRaw(
  record: EntityRecord,
  field: EntityField | null,
): string {
  return field ? (record.values[field.id] ?? "").trim() : "";
}

export function firstRelationId(
  record: EntityRecord,
  field: EntityField | null,
): string | null {
  return field
    ? (parseEntityRelationIds(record.values[field.id])[0] ?? null)
    : null;
}

function linkedTo(
  record: EntityRecord,
  field: EntityField | null,
  ids: ReadonlySet<string>,
): boolean {
  if (!field || ids.size === 0) return false;
  return parseEntityRelationIds(record.values[field.id]).some((id) =>
    ids.has(id),
  );
}

function readDeal(
  ctx: EntityValueContext,
  sources: DealCardSources,
  record: EntityRecord,
): DealCardDeal {
  const entity = sources.deal;
  const number = (names: readonly string[]) =>
    readNumber(ctx, entity, record, findNamedField(entity, names));
  return {
    withoutVat: number(["Сумма (без НДС)", "Сумма без НДС"]),
    withVat: number(["Сумма (с НДС)", "Сумма с НДС"]),
    vat: number(["Сумма НДС", "НДС"]),
    vatRate: number(["Ставка НДС"]),
    plannedHours: number(["Плановые часы"]),
    actualHours: number(["Фактические часы"]),
    manual: readDealManualInputs(sources.liveDeal, record.values),
    overrides: parseDealOverrides(record.values[DEAL_OVERRIDES_KEY]),
  };
}

function readContracts(
  ctx: EntityValueContext,
  sources: DealCardSources,
  dealId: string,
): DealCardContract[] {
  const entity = sources.contract;
  if (!entity) return [];
  const dealLink = findRelationTo(entity, sources.deal, ["Сделка"]);
  const ids = new Set([dealId]);
  const withoutVat = findNamedField(entity, ["Сумма по этапам (без НДС)"]);
  const withVat = findNamedField(entity, ["Сумма по этапам (с НДС)"]);
  const vat = findNamedField(entity, ["Сумма НДС"]);
  const number = findNamedField(entity, ["Номер договора", "Номер"]);
  const status = findNamedField(entity, ["Стадия", "Статус"]);
  return ctx
    .getRecords(entity.id)
    .filter((record) => linkedTo(record, dealLink, ids))
    .map((record) => ({
      id: record.id,
      title: getEntityRecordTitle(ctx, entity, record),
      number: readRaw(record, number),
      status: readText(ctx, entity, record, status),
      withoutVat: readNumber(ctx, entity, record, withoutVat),
      withVat: readNumber(ctx, entity, record, withVat),
      vat: readNumber(ctx, entity, record, vat),
    }));
}

function readStages(
  ctx: EntityValueContext,
  sources: DealCardSources,
  contractIds: ReadonlySet<string>,
): DealCardStage[] {
  const entity = sources.stage;
  if (!entity) return [];
  const contractLink = findRelationTo(entity, sources.contract, ["Договор"]);
  const field = (names: readonly string[]) => findNamedField(entity, names);
  const start = field(["Дата начала"]);
  const end = field(["Дата окончания"]);
  const order = field(["Порядок оплаты"]);
  const amount = field(["Сумма по этапу (без НДС)", "Сумма без НДС"]);
  const rate =
    findNamedField(entity, ["Ставка НДС"], ["number"]) ?? field(["Ставка НДС"]);
  const advance = field(["Сумма аванса без НДС", "Сумма аванса (без НДС)"]);
  const advanceDate = field(["Дата аванса"]);
  const deferral = field(["Отсрочка по договору, дней", "Отсрочка, дней"]);
  const deferralKind = field(["Тип отсрочки, дни", "Тип отсрочки"]);

  return ctx
    .getRecords(entity.id)
    .filter((record) => linkedTo(record, contractLink, contractIds))
    .map((record) => {
      const title = getEntityRecordTitle(ctx, entity, record);
      return {
        id: record.id,
        title,
        name: title,
        contractId: firstRelationId(record, contractLink),
        startDate: readRaw(record, start) || null,
        endDate: readRaw(record, end) || null,
        paymentOrder: readText(ctx, entity, record, order),
        amountWithoutVat: readNumber(ctx, entity, record, amount),
        vatRate: readNumber(ctx, entity, record, rate),
        advanceWithoutVat: readNumber(ctx, entity, record, advance),
        advanceDate: readRaw(record, advanceDate) || null,
        deferralDays: readNumber(ctx, entity, record, deferral),
        deferralBusinessDays: readText(ctx, entity, record, deferralKind)
          .toLocaleLowerCase("ru")
          .includes("рабоч"),
      };
    });
}

type DealLinks = {
  deal: ReadonlySet<string>;
  contracts: ReadonlySet<string>;
  stages: ReadonlySet<string>;
  projects: ReadonlySet<string>;
};

/** Acts linked to the deal directly («Сделка») or via its contract / stage. */
function readActs(
  ctx: EntityValueContext,
  sources: DealCardSources,
  links: DealLinks,
): DealCardAct[] {
  const entity = sources.act;
  if (!entity) return [];
  const dealLink = findRelationTo(entity, sources.deal, ["Сделка"]);
  const contractLink = findRelationTo(entity, sources.contract, ["Договор"]);
  const stageLink = findRelationTo(entity, sources.stage, ["Этап"]);
  const field = (names: readonly string[]) => findNamedField(entity, names);
  const status = field(["Стадия", "Статус"]);
  const withoutVat = field(["Сумма по этапу (без НДС)", "Сумма без НДС"]);
  const withVat = field(["Сумма по этапу (с НДС)", "Сумма с НДС"]);

  return ctx
    .getRecords(entity.id)
    .filter(
      (record) =>
        linkedTo(record, dealLink, links.deal) ||
        linkedTo(record, contractLink, links.contracts) ||
        linkedTo(record, stageLink, links.stages),
    )
    .map((record) => ({
      id: record.id,
      rejected: readText(ctx, entity, record, status)
        .toLocaleLowerCase("ru")
        .includes("отклон"),
      amountWithoutVat: readNumber(ctx, entity, record, withoutVat),
      amountWithVat: readNumber(ctx, entity, record, withVat),
    }));
}

function readArticle(
  ctx: EntityValueContext,
  sources: DealCardSources,
  articleId: string | null,
): { name: string; parentName: string } {
  const entity = sources.article;
  const record =
    entity && articleId ? ctx.getRecord(entity.id, articleId) : null;
  if (!entity || !record) return { name: "", parentName: "" };
  const parentId = firstRelationId(
    record,
    findRelationTo(entity, entity, ["Родительская статья"]),
  );
  const parent = parentId ? ctx.getRecord(entity.id, parentId) : undefined;
  return {
    name: getEntityRecordTitle(ctx, entity, record, ""),
    parentName: parent ? getEntityRecordTitle(ctx, entity, parent, "") : "",
  };
}

/** Requests linked to the deal directly or via its contract / stage / project. */
function readRequests(
  ctx: EntityValueContext,
  sources: DealCardSources,
  links: DealLinks,
): DealCardRequest[] {
  const entity = sources.request;
  if (!entity) return [];
  const dealLink = findRelationTo(entity, sources.deal, ["Сделка"]);
  const contractLink = findRelationTo(entity, sources.contract, ["Договор"]);
  const stageLink = findRelationTo(entity, sources.stage, ["Этап по договору"]);
  const projectLink = findRelationTo(entity, sources.project, ["Проект"]);
  const articleLink = findRelationTo(entity, sources.article, [
    "Статья затрат",
    "Статья",
  ]);
  const field = (names: readonly string[]) => findNamedField(entity, names);
  const status = field(["Стадия", "Статус"]);
  const desiredDate = field(["Желаемая дата платежа", "Дата платежа"]);
  const withoutVat = field([
    "Сумма платежа (без НДС)",
    "Сумма полатежа (без НДС)",
    "Сумма без НДС",
  ]);
  const withVat = field(["Сумма платежа (с НДС)", "Сумма с НДС"]);
  const rate = field(["Ставка НДС"]);

  return ctx
    .getRecords(entity.id)
    .filter(
      (record) =>
        linkedTo(record, dealLink, links.deal) ||
        linkedTo(record, contractLink, links.contracts) ||
        linkedTo(record, stageLink, links.stages) ||
        linkedTo(record, projectLink, links.projects),
    )
    .map((record) => {
      const article = readArticle(
        ctx,
        sources,
        firstRelationId(record, articleLink),
      );
      const statusText = readText(ctx, entity, record, status);
      const amountWithVat = readNumber(ctx, entity, record, withVat);
      return {
        id: record.id,
        title: getEntityRecordTitle(ctx, entity, record),
        status: statusText,
        paid: statusText.toLocaleLowerCase("ru").includes("оплачен"),
        articleName: article.name,
        category: classifyDealExpense(article.name, article.parentName),
        desiredDate: readRaw(record, desiredDate) || null,
        amountWithoutVat: resolveRequestAmountWithoutVat({
          withoutVat: readNumber(ctx, entity, record, withoutVat),
          withVat: amountWithVat,
          vatRate: readNumber(ctx, entity, record, rate),
        }),
        amountWithVat,
      };
    });
}

/** Incoming ДДС operations linked to the deal (movement «Поступление»). */
function readReceipts(
  ctx: EntityValueContext,
  sources: DealCardSources,
  dealId: string,
): DealCardReceipt[] {
  const entity = sources.dds;
  if (!entity) return [];
  const dealLink = findRelationTo(entity, sources.deal, ["Сделка"]);
  const articleLink = findRelationTo(entity, sources.article, ["Статья"]);
  const movement = findNamedField(entity, ["Тип движения", "Движение"]);
  const articleMovement = findNamedField(sources.article, ["Тип движения"]);
  const date = findNamedField(entity, ["Дата"]);
  const withVat = findNamedField(entity, ["Сумма с НДС", "Сумма"]);
  const ids = new Set([dealId]);

  const isIncome = (record: EntityRecord) => {
    let text = readText(ctx, entity, record, movement);
    if (!text && sources.article && articleMovement) {
      const articleId = firstRelationId(record, articleLink);
      const article = articleId
        ? ctx.getRecord(sources.article.id, articleId)
        : undefined;
      if (article) {
        text = readText(ctx, sources.article, article, articleMovement);
      }
    }
    return text.toLocaleLowerCase("ru").includes("поступ");
  };

  return ctx
    .getRecords(entity.id)
    .filter((record) => linkedTo(record, dealLink, ids) && isIncome(record))
    .map((record) => ({
      id: record.id,
      title: getEntityRecordTitle(ctx, entity, record),
      date: readRaw(record, date) || null,
      amountWithVat: readNumber(ctx, entity, record, withVat),
    }));
}

function readProjectIds(
  ctx: EntityValueContext,
  sources: DealCardSources,
  dealId: string,
  contractIds: ReadonlySet<string>,
): Set<string> {
  const entity = sources.project;
  if (!entity) return new Set();
  const dealLink = findRelationTo(entity, sources.deal, ["Сделка"]);
  const contractLink = findRelationTo(entity, sources.contract, ["Договор"]);
  const ids = new Set([dealId]);
  return new Set(
    ctx
      .getRecords(entity.id)
      .filter(
        (record) =>
          linkedTo(record, dealLink, ids) ||
          linkedTo(record, contractLink, contractIds),
      )
      .map((record) => record.id),
  );
}

/**
 * Everything the deal card shows, read synchronously from the value context.
 * Callers must load the source entities first (`usePageRecordScope`).
 */
export function collectDealCardData(
  ctx: EntityValueContext,
  sources: DealCardSources,
  dealRecord: EntityRecord,
): DealCardData {
  const contracts = readContracts(ctx, sources, dealRecord.id);
  const contractIds = new Set(contracts.map((item) => item.id));
  const stages = readStages(ctx, sources, contractIds);
  const links: DealLinks = {
    deal: new Set([dealRecord.id]),
    contracts: contractIds,
    stages: new Set(stages.map((item) => item.id)),
    projects: readProjectIds(ctx, sources, dealRecord.id, contractIds),
  };

  const contractTotals: MoneyTriple | null =
    contracts.length === 0
      ? null
      : {
          withoutVat: sumPresent(contracts.map((item) => item.withoutVat)),
          withVat: sumPresent(contracts.map((item) => item.withVat)),
          vat: sumPresent(contracts.map((item) => item.vat)),
        };

  return {
    deal: readDeal(ctx, sources, dealRecord),
    contracts,
    stages,
    acts: readActs(ctx, sources, links),
    requests: readRequests(ctx, sources, links),
    receipts: readReceipts(ctx, sources, dealRecord.id),
    contractTotals,
  };
}
