/**
 * Assert date formula resultType, nested operands, date−date, soft-fill lock,
 * and manual datetime stand-in.
 */
import { addBusinessDays } from "../src/shared/lib/business-days.ts";
import { evaluateFormula } from "../src/entities/entity/model/formula.ts";
import {
  computeAllowManualFormulaSoftFill,
  getEntityFieldValueKind,
  getEntityValueContext,
  getFormulaResult,
  getRecordFieldFormulaValue,
  resolveEntityComputedManualEditField,
} from "../src/entities/entity/model/field-value.ts";
import { getEntityFormulaResultType } from "../src/entities/entity/model/field.ts";
import type {
  Entity,
  EntityField,
  EntityRecord,
} from "../src/entities/entity/model/types.ts";

function baseField(
  partial: Pick<EntityField, "id" | "name" | "type"> & Partial<EntityField>,
): EntityField {
  return {
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
    tableOrder: 0,
    relationEntityId: null,
    relationMultiple: false,
    unitSuffix: null,
    decimals: 2,
    sumFieldIds: [],
    listOptions: [],
    listSourceFieldId: null,
    listFixed: false,
    listMultiple: false,
    listAllowOther: false,
    listDependsOnFieldId: null,
    listUseColors: false,
    listShowEmptyValue: false,
    datetimeWithTime: false,
    booleanInline: false,
    colSpan: 1,
    rowSpan: 1,
    ...partial,
  } as EntityField;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const startId = "f-start";
const durationId = "f-duration";
const endId = "f-end";
const nestedId = "f-nested";

const start = baseField({
  id: startId,
  name: "Дата постановки",
  type: "datetime",
});
const duration = baseField({
  id: durationId,
  name: "Длительность",
  type: "number",
  decimals: 0,
});
const end = baseField({
  id: endId,
  name: "Срок окончания (план)",
  type: "formula",
  allowManualInput: true,
  formula: {
    expression: `{{${startId}}} + {{${durationId}}}`,
    decimals: 0,
    resultType: "date",
  },
});
const nested = baseField({
  id: nestedId,
  name: "Срок + 2",
  type: "formula",
  formula: {
    expression: `{{${endId}}} + 2`,
    decimals: 0,
    resultType: "date",
  },
});

const entity: Entity = {
  id: "e1",
  name: "Tasks",
  fields: [start, duration, end, nested],
  records: [],
} as Entity;

const record: EntityRecord = {
  id: "r1",
  values: {
    [startId]: "2026-11-16", // Monday
    [durationId]: "3",
  },
} as EntityRecord;

const ctx = getEntityValueContext([entity]);

// 1. date + duration (inclusive business days)
const expectedEnd = addBusinessDays("2026-11-16", Math.max(0, 3) - 1);
const endResult = getFormulaResult(ctx, entity, record, end);
assert(
  endResult === expectedEnd,
  `date+duration: expected ${expectedEnd}, got ${endResult}`,
);

// 2. nested date formula as operand
const nestedOperand = getRecordFieldFormulaValue(ctx, entity, record, end);
assert(
  nestedOperand === expectedEnd,
  `nested operand: expected ${expectedEnd}, got ${nestedOperand}`,
);
const nestedResult = getFormulaResult(ctx, entity, record, nested);
const expectedNested = addBusinessDays(expectedEnd, Math.max(0, 2) - 1);
assert(
  nestedResult === expectedNested,
  `nested formula: expected ${expectedNested}, got ${nestedResult}`,
);

// 3. date - date → calendar days
const diff = evaluateFormula(
  '"2026-11-20" - "2026-11-16"',
  () => null,
  "2026-11-18",
);
assert(diff === 4, `date-date: expected 4, got ${diff}`);

// 4. value kind
assert(
  getEntityFieldValueKind(entity, end, [entity]) === "date",
  "value kind should be date",
);
assert(getEntityFormulaResultType(end) === "date", "resultType helper");

// 5. manual stand-in
const standIn = resolveEntityComputedManualEditField(entity, end, [entity]);
assert(standIn?.type === "datetime", `stand-in type: ${standIn?.type}`);
assert(standIn?.datetimeWithTime === false, "stand-in date-only");

// 6. soft-fill respects user lock
const softUnlocked = computeAllowManualFormulaSoftFill({
  ctx,
  entity,
  values: {
    [startId]: "2026-11-16",
    [durationId]: "3",
  },
  recordId: "r1",
});
assert(
  softUnlocked[endId] === expectedEnd,
  `soft-fill unlocked: expected ${expectedEnd}, got ${softUnlocked[endId]}`,
);

const lockedDate = "2026-12-01";
const softLocked = computeAllowManualFormulaSoftFill({
  ctx,
  entity,
  values: {
    [startId]: "2026-11-16",
    [durationId]: "3",
    [endId]: lockedDate,
  },
  recordId: "r1",
  anchorFieldId: endId,
});
assert(
  softLocked[endId] == null,
  `soft-fill locked must not overwrite; got ${softLocked[endId]}`,
);

console.log("repro-date-formula: ok");
