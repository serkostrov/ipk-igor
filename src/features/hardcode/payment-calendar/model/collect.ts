import {
  getEntityRecordTitle,
  getEntityRelationTargetId,
  type EntityField,
  type EntityRecord,
  type EntityValueContext,
} from "@/entities/entity";
import { extractIsoDate } from "@/shared/lib/business-days";
import {
  firstRelationId,
  readNumber,
  readRaw,
  readText,
} from "../../deal-card/model/deal-data";
import { roundMoney } from "../../deal-card/model/calculations";
import {
  findNamedField,
  findRelationTo,
  type PaymentCalendarSources,
} from "../match";
import type {
  CalendarReceipt,
  CalendarStage,
  DaysKind,
  PaymentCondition,
  RecordRef,
} from "./types";

const NOT_FOUND = "Запись не найдена";
const INCOME_MARKERS = ["поступ", "приход", "доход"] as const;

/**
 * Record behind a relation value. The field's declared target wins; otherwise
 * the global id index is used, so the label and link stay right even when the
 * relation points at an entity other than the one matched by name.
 */
function resolveRelated(
  ctx: EntityValueContext,
  field: EntityField,
  id: string,
) {
  const targetId = getEntityRelationTargetId(field);
  const target = targetId ? ctx.entityById.get(targetId) : undefined;
  const record = targetId ? ctx.getRecord(targetId, id) : undefined;
  if (target && record) return { entity: target, record };
  return ctx.recordById.get(id);
}

function readRef(
  ctx: EntityValueContext,
  record: EntityRecord,
  field: EntityField | null,
): RecordRef | null {
  const id = field ? firstRelationId(record, field) : null;
  if (!field || !id) return null;
  const owner = resolveRelated(ctx, field, id);
  return owner
    ? {
        id,
        name: getEntityRecordTitle(ctx, owner.entity, owner.record),
        entityId: owner.entity.id,
      }
    : { id, name: NOT_FOUND, entityId: null };
}

function parseCondition(text: string): PaymentCondition {
  const value = text.toLocaleLowerCase("ru");
  if (!value.includes("аванс")) return "postpay";
  return value.includes("постоплат") ? "advance-postpay" : "advance";
}

function parseDaysKind(text: string): DaysKind {
  return text.toLocaleLowerCase("ru").includes("рабоч")
    ? "business"
    : "calendar";
}

function days(value: number | null): number {
  return Math.max(0, Math.round(value ?? 0));
}

function readStages(
  ctx: EntityValueContext,
  sources: PaymentCalendarSources,
): CalendarStage[] {
  const { stage: entity, contract, deal, legal, counterparty } = sources;
  if (!entity) return [];
  const field = (names: readonly string[]) => findNamedField(entity, names);
  const columns = {
    start: field(["Дата начала"]),
    end: field(["Дата окончания"]),
    order: field(["Порядок оплаты"]),
    costWithVat: field(["Сумма по этапу (с НДС)", "Сумма с НДС"]),
    cost: field(["Сумма по этапу (без НДС)", "Сумма без НДС"]),
    rate: findNamedField(entity, ["Ставка НДС"], ["number"]),
    advance: field(["Сумма аванса без НДС", "Сумма аванса (без НДС)"]),
    advancePercent: field(["Процент аванса", "Аванс, %"]),
    advanceDate: field(["Дата аванса"]),
    acceptance: field(["Срок приёмки, дней", "Срок приемки, дней"]),
    acceptanceKind: field(["Тип срока приёмки", "Тип срока приемки"]),
    deferral: field(["Отсрочка по договору, дней", "Отсрочка, дней"]),
    deferralKind: field(["Тип отсрочки, дни", "Тип отсрочки"]),
  };

  // Links are found by their target entity (created in the entity settings),
  // names only break ties between several relations to the same entity.
  const stageContract = findRelationTo(entity, contract, ["Договор"]);
  const stageDeal = findRelationTo(entity, deal, ["Сделка"]);
  const contractDeal = findRelationTo(contract, deal, ["Сделка"]);
  const links = {
    legal: [
      findRelationTo(entity, legal, ["Юрлицо"]),
      findRelationTo(contract, legal, ["Юрлицо"]),
      findRelationTo(deal, legal, ["Юрлицо"]),
    ],
    counterparty: [
      findRelationTo(entity, counterparty, ["Контрагент"]),
      findRelationTo(contract, counterparty, ["Контрагент"]),
      findRelationTo(deal, counterparty, ["Контрагент"]),
    ],
  };

  return ctx.getRecords(entity.id).map((record) => {
    const contractRef = readRef(ctx, record, stageContract);
    const contractRecord =
      contract && contractRef?.entityId === contract.id
        ? ctx.getRecord(contract.id, contractRef.id)
        : undefined;
    const dealRef =
      readRef(ctx, record, stageDeal) ??
      (contractRecord ? readRef(ctx, contractRecord, contractDeal) : null);
    const dealRecord =
      deal && dealRef?.entityId === deal.id
        ? ctx.getRecord(deal.id, dealRef.id)
        : undefined;

    // Stage → contract → deal: the nearest record that has the link wins.
    const inherited = (fields: ReadonlyArray<EntityField | null>) => {
      const holders = [record, contractRecord, dealRecord];
      for (const [index, link] of fields.entries()) {
        const holder = holders[index];
        const ref = holder ? readRef(ctx, holder, link) : null;
        if (ref) return ref;
      }
      return null;
    };

    const number = (target: EntityField | null) =>
      readNumber(ctx, entity, record, target);
    const vatFactor = 1 + (number(columns.rate) ?? 0) / 100;
    const withoutVat = number(columns.cost);
    const cost =
      number(columns.costWithVat) ??
      (withoutVat != null ? roundMoney(withoutVat * vatFactor) : null);
    const advance = number(columns.advance);

    return {
      id: record.id,
      name: getEntityRecordTitle(ctx, entity, record),
      contract: contractRef,
      dealId: dealRef?.id ?? null,
      legal: inherited(links.legal),
      counterparty: inherited(links.counterparty),
      startDate: readRaw(record, columns.start) || null,
      endDate: readRaw(record, columns.end) || null,
      condition: parseCondition(readText(ctx, entity, record, columns.order)),
      cost,
      advanceAmount: advance != null ? roundMoney(advance * vatFactor) : null,
      advancePercent: number(columns.advancePercent),
      advanceDate: readRaw(record, columns.advanceDate) || null,
      acceptanceDays: days(number(columns.acceptance)),
      acceptanceKind: parseDaysKind(
        readText(ctx, entity, record, columns.acceptanceKind),
      ),
      deferralDays: days(number(columns.deferral)),
      deferralKind: parseDaysKind(
        readText(ctx, entity, record, columns.deferralKind),
      ),
    };
  });
}

/** Приходные операции ДДС (тип движения «Поступление» / «Приход»). */
function readReceipts(
  ctx: EntityValueContext,
  sources: PaymentCalendarSources,
): CalendarReceipt[] {
  const { dds: entity, deal, contract, stage, legal, counterparty } = sources;
  const { article } = sources;
  if (!entity) return [];
  const movement = findNamedField(entity, ["Тип движения", "Движение"]);
  const articleMovement = findNamedField(article, ["Тип движения"]);
  const articleLink = findRelationTo(entity, article, ["Статья"]);
  const date = findNamedField(entity, ["Дата"]);
  const amount = findNamedField(entity, ["Сумма с НДС", "Сумма"]);
  const links = {
    deal: findRelationTo(entity, deal, ["Сделка"]),
    contract: findRelationTo(entity, contract, ["Договор"]),
    stage: findRelationTo(entity, stage, ["Этап по договору", "Этап"]),
    legal: findRelationTo(entity, legal, ["Юрлицо"]),
    counterparty: findRelationTo(entity, counterparty, ["Контрагент"]),
  };

  // Movement lives on the operation, or on its article when the operation
  // itself has none.
  const isIncome = (record: EntityRecord) => {
    let text = readText(ctx, entity, record, movement);
    if (!text && article && articleMovement) {
      const articleId = firstRelationId(record, articleLink);
      const articleRecord = articleId
        ? ctx.getRecord(article.id, articleId)
        : undefined;
      if (articleRecord) {
        text = readText(ctx, article, articleRecord, articleMovement);
      }
    }
    const value = text.toLocaleLowerCase("ru");
    return INCOME_MARKERS.some((marker) => value.includes(marker));
  };

  const receipts: CalendarReceipt[] = [];
  for (const record of ctx.getRecords(entity.id)) {
    const isoDate = extractIsoDate(readRaw(record, date));
    const sum = readNumber(ctx, entity, record, amount);
    if (!isoDate || sum == null || !isIncome(record)) continue;
    receipts.push({
      id: record.id,
      title: getEntityRecordTitle(ctx, entity, record),
      date: isoDate,
      amount: Math.abs(sum),
      dealId: firstRelationId(record, links.deal),
      contractId: firstRelationId(record, links.contract),
      stageId: firstRelationId(record, links.stage),
      legalId: firstRelationId(record, links.legal),
      counterpartyId: firstRelationId(record, links.counterparty),
    });
  }
  return receipts;
}

/** Everything the calendar needs, read synchronously from the value context. */
export function collectPaymentCalendarData(
  ctx: EntityValueContext,
  sources: PaymentCalendarSources,
): { stages: CalendarStage[]; receipts: CalendarReceipt[] } {
  return {
    stages: readStages(ctx, sources),
    receipts: readReceipts(ctx, sources),
  };
}
