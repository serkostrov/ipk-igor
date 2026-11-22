import {
  formatEntityDecimalTotal,
  getRecordFieldNumber,
  type Entity,
  type EntityRecord,
  type EntityValueContext,
} from "@/entities/entity";

const PAYMENT_REQUEST_ID = "entity-2b29a77b-e6a5-491d-aed7-46b209f10070";
const STAGE_FIELD_ID = "field-537234e0-af02-48ec-9d4c-ee9a4f8a6f4d";
const DRAFT_OPTION_ID = "list-65a27c0b-7e09-45ff-939f-70644732f336";
const NET_FIELD_ID = "field-b1c3b624-8d78-4c57-9429-418b9ca202de";
const VAT_RATE_FIELD_ID = "field-36a9f394-b286-402c-83a1-ddf732e5faaf";
const GROSS_FIELD_ID = "field-24d7acd4-29ba-4d54-861b-31aaafaa8292";

export function getPaymentRequestDraftSummary(
  ctx: EntityValueContext,
  entity: Entity,
  groupFieldId: string,
  columnId: string,
  records: readonly EntityRecord[],
): string | null {
  if (
    entity.id !== PAYMENT_REQUEST_ID ||
    groupFieldId !== STAGE_FIELD_ID ||
    columnId !== DRAFT_OPTION_ID
  )
    return null;

  const netField = entity.fields.find((field) => field.id === NET_FIELD_ID);
  const rateField = entity.fields.find(
    (field) => field.id === VAT_RATE_FIELD_ID,
  );
  const grossField = entity.fields.find((field) => field.id === GROSS_FIELD_ID);
  if (!netField || !rateField || !grossField) return null;

  let net = 0;
  let gross = 0;
  let minRate = Infinity;
  let maxRate = -Infinity;
  let hasMissingRate = false;
  for (const record of records) {
    net += getRecordFieldNumber(ctx, entity, record, netField) ?? 0;
    gross += getRecordFieldNumber(ctx, entity, record, grossField) ?? 0;
    const rate = getRecordFieldNumber(ctx, entity, record, rateField);
    if (rate === null) {
      hasMissingRate = true;
    } else {
      minRate = Math.min(minRate, rate);
      maxRate = Math.max(maxRate, rate);
    }
  }

  let rateLabel = "—";
  if (records.length > 0 && !hasMissingRate) {
    rateLabel =
      minRate === maxRate
        ? `${formatEntityDecimalTotal(minRate)} %`
        : `${formatEntityDecimalTotal(minRate)} - ${formatEntityDecimalTotal(maxRate)}%`;
  }
  return [
    `${formatEntityDecimalTotal(net)} ₽`,
    rateLabel,
    `${formatEntityDecimalTotal(gross)} ₽`,
  ].join(" / ");
}
