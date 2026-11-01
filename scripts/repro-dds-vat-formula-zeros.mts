/**
 * Repro: VAT allow-manual formulas with filled rate + empty amounts
 * must not display / total as fake 0 ₽.
 */
import {
  formatRecordFieldValue,
  getEntityValueContext,
  getRecordFieldNumber,
  isEntityComputedAutoValueEmpty,
} from "../src/entities/entity/model/field-value.ts";
import type {
  Entity,
  EntityField,
  EntityRecord,
} from "../src/entities/entity/model/types.ts";

function formulaField(
  id: string,
  name: string,
  expression: string,
): EntityField {
  return {
    id,
    name,
    type: "formula",
    hint: "",
    group: "",
    tabId: "overview",
    required: false,
    locked: false,
    systemKey: null,
    showInTable: true,
    showInFilters: true,
    showOnRecord: true,
    showOnCreate: true,
    visibilityConditions: [],
    includeInTotal: true,
    unitSuffix: "₽",
    decimals: 2,
    listMultiple: false,
    listSourceFieldId: null,
    listAllowOther: false,
    listDependsOnFieldId: null,
    listUseColors: false,
    listShowEmptyValue: false,
    allowManualInput: true,
    datetimeWithTime: false,
    booleanInline: false,
    colSpan: 1,
    rowSpan: 1,
    formula: { expression, decimals: 2 },
  } as EntityField;
}

function numberField(id: string, name: string): EntityField {
  return {
    id,
    name,
    type: "number",
    hint: "",
    group: "",
    tabId: "overview",
    required: false,
    locked: false,
    systemKey: null,
    showInTable: true,
    showInFilters: true,
    showOnRecord: true,
    showOnCreate: true,
    visibilityConditions: [],
    includeInTotal: false,
    unitSuffix: "%",
    decimals: 0,
    listMultiple: false,
    listSourceFieldId: null,
    listAllowOther: false,
    listDependsOnFieldId: null,
    listUseColors: false,
    listShowEmptyValue: false,
    datetimeWithTime: false,
    booleanInline: false,
    colSpan: 1,
    rowSpan: 1,
  } as EntityField;
}

const rate = numberField("rate", "Ставка НДС");
const withVat = formulaField(
  "with",
  "С НДС",
  "{{without}} * (1 + {{rate}} / 100)",
);
const withoutVat = formulaField(
  "without",
  "Без НДС",
  "{{with}} / (1 + {{rate}} / 100)",
);
const vat = formulaField("vat", "НДС", "{{with}} - {{without}}");

const recordEmpty: EntityRecord = {
  id: "r1",
  values: { rate: "22" },
  createdAt: "",
  updatedAt: "",
};

const recordStored: EntityRecord = {
  id: "r2",
  values: { rate: "22", with: "122000" },
  createdAt: "",
  updatedAt: "",
};

const entity = {
  id: "dds",
  name: "ДДС",
  fields: [rate, withVat, withoutVat, vat],
  records: [recordEmpty, recordStored],
  tabs: [],
} as unknown as Entity;

const ctx = getEntityValueContext([entity]);

function dump(label: string, record: EntityRecord, field: EntityField) {
  const num = getRecordFieldNumber(ctx, entity, record, field);
  const text = formatRecordFieldValue(ctx, entity, record, field);
  const empty = isEntityComputedAutoValueEmpty(ctx, entity, record, field);
  console.log(
    `${label}: number=${String(num)} display=${JSON.stringify(text)} autoEmpty=${empty}`,
  );
}

console.log("--- empty amounts, rate=22 ---");
for (const field of [withVat, withoutVat, vat]) {
  dump(field.name, recordEmpty, field);
}

console.log("--- stored С НДС=122000 ---");
for (const field of [withVat, withoutVat, vat]) {
  dump(field.name, recordStored, field);
}

const badZeros = [withVat, withoutVat, vat].some((field) => {
  const n = getRecordFieldNumber(ctx, entity, recordEmpty, field);
  const t = formatRecordFieldValue(ctx, entity, recordEmpty, field);
  return n === 0 || t.includes("0");
});

if (badZeros) {
  console.error("FAIL: empty VAT amounts still resolve to 0");
  process.exit(1);
}

const withStored = getRecordFieldNumber(ctx, entity, recordStored, withVat);
if (withStored !== 122000) {
  console.error("FAIL: stored С НДС not read", withStored);
  process.exit(1);
}

console.log("OK");
